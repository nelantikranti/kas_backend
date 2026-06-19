import User from "../models/User";
import SalaryStructure from "../models/SalaryStructure";
import Attendance from "../models/Attendance";
import LeaveRequest from "../models/LeaveRequest";
import Payslip from "../models/Payslip";
import { buildPayslipPdf } from "../utils/hrPdf";
import { uploadHrPdf, deleteCloudinaryAsset } from "../utils/hrUpload";
import {
  round2,
  salaryToComponents,
  validateSalaryStructure,
} from "../utils/salaryStructure";
import { resolvePayslipDeductions, resolvePayslipEarnings } from "../utils/payslipNormalize";
import { computeAttendancePayroll, computeMonthlyPackage } from "../utils/payrollCalculation";
import { payrollMonthTitle, payrollPeriodRange, countOverlapDays } from "../utils/payrollPeriod";
import { PAYSLIP_DEDUCTION_LABELS, formatLopDeductionLabel } from "../constants/payslipLabels";

export type PayslipCalculation = {
  userId: string;
  employeeName: string;
  employeeId: string;
  department: string;
  role: string;
  email: string;
  joinDate: string;
  accountNumber: string;
  panNumber: string;
  uanNumber: string;
  month: string;
  monthLabel: string;
  workingDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  attendanceRatio: number;
  salaryConfigured: boolean;
  earnings: { basic: number; hra: number; da: number; allowances: number; incentive: number; total: number };
  deductionsDetail: { pf: number; esi: number; tds: number; professionalTax: number; lop: number; total: number };
  monthlyGross: number;
  dayRate?: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  inHandSalary: number;
  breakdown: Array<{ label: string; value: string; highlight?: boolean; section?: "earning" | "deduction" }>;
};

export type PayslipOverrides = {
  earnings?: Partial<PayslipCalculation["earnings"]>;
  deductionsDetail?: Partial<PayslipCalculation["deductionsDetail"]>;
  presentDays?: number;
  paidLeaveDays?: number;
  unpaidLeaveDays?: number;
  absentDays?: number;
};

function buildBreakdown(
  earned: PayslipCalculation["earnings"],
  deductionsDetail: PayslipCalculation["deductionsDetail"],
  netPay: number,
  unpaidLeaveDays = 0
): PayslipCalculation["breakdown"] {
  const rows: PayslipCalculation["breakdown"] = [
    { label: "Basic Pay", value: inr(earned.basic), section: "earning" },
    { label: "HRA", value: inr(earned.hra), section: "earning" },
    { label: "DA", value: inr(earned.da), section: "earning" },
    { label: "Allowances", value: inr(earned.allowances), section: "earning" },
    { label: "Incentive", value: inr(earned.incentive), section: "earning" },
    { label: "Gross earnings", value: inr(earned.total), section: "earning", highlight: true },
  ];
  if (deductionsDetail.lop > 0) {
    rows.push({
      label: formatLopDeductionLabel(unpaidLeaveDays),
      value: inr(deductionsDetail.lop),
      section: "deduction",
    });
  }
  rows.push(
    { label: PAYSLIP_DEDUCTION_LABELS.pf, value: inr(deductionsDetail.pf), section: "deduction" },
    { label: PAYSLIP_DEDUCTION_LABELS.esi, value: inr(deductionsDetail.esi), section: "deduction" },
    { label: PAYSLIP_DEDUCTION_LABELS.tds, value: inr(deductionsDetail.tds), section: "deduction" },
    { label: PAYSLIP_DEDUCTION_LABELS.professionalTax, value: inr(deductionsDetail.professionalTax), section: "deduction" },
    { label: "Total deductions", value: inr(deductionsDetail.total), section: "deduction", highlight: true },
    { label: "Net salary", value: inr(netPay), highlight: true }
  );
  return rows;
}

export function applyPayslipOverrides(
  calc: PayslipCalculation,
  overrides?: PayslipOverrides,
  structureComponents?: ReturnType<typeof salaryToComponents>
): PayslipCalculation {
  if (
    overrides?.presentDays == null &&
    overrides?.paidLeaveDays == null &&
    overrides?.unpaidLeaveDays == null &&
    overrides?.absentDays == null &&
    !overrides?.deductionsDetail &&
    !(overrides?.earnings && overrides.earnings.incentive != null)
  ) {
    return calc;
  }

  const components = structureComponents ?? {
    basic: calc.earnings.basic,
    hra: calc.earnings.hra,
    da: calc.earnings.da,
    allowances: calc.earnings.allowances,
    incentive: 0,
    pf: calc.deductionsDetail.pf,
    esi: calc.deductionsDetail.esi,
    tds: calc.deductionsDetail.tds,
    professionalTax: calc.deductionsDetail.professionalTax,
  };

  const presentDays = overrides?.presentDays != null ? overrides.presentDays : calc.presentDays;
  const paidLeaveDays = overrides?.paidLeaveDays != null ? overrides.paidLeaveDays : calc.paidLeaveDays;
  const unpaidLeaveDays =
    overrides?.unpaidLeaveDays != null ? overrides.unpaidLeaveDays : calc.unpaidLeaveDays;
  const manualIncentive =
    overrides?.earnings?.incentive != null ? overrides.earnings.incentive : calc.earnings.incentive;

  const deductionOverrides = overrides?.deductionsDetail
    ? {
        pf: overrides.deductionsDetail.pf ?? calc.deductionsDetail.pf,
        esi: overrides.deductionsDetail.esi ?? calc.deductionsDetail.esi,
        tds: overrides.deductionsDetail.tds ?? calc.deductionsDetail.tds,
        professionalTax: overrides.deductionsDetail.professionalTax ?? calc.deductionsDetail.professionalTax,
      }
    : {
        pf: calc.deductionsDetail.pf,
        esi: calc.deductionsDetail.esi,
        tds: calc.deductionsDetail.tds,
        professionalTax: calc.deductionsDetail.professionalTax,
      };

  const result = computeAttendancePayroll({
    components,
    presentDays,
    paidLeaveDays,
    unpaidLeaveDays,
    manualIncentive,
    absentDays: overrides?.absentDays,
    deductionOverrides,
  });

  return {
    ...calc,
    workingDays: result.workingDays,
    presentDays: result.presentDays,
    paidLeaveDays: result.paidLeaveDays,
    unpaidLeaveDays: result.unpaidLeaveDays,
    absentDays: result.absentDays,
    attendanceRatio: result.attendanceRatio,
    monthlyGross: result.monthlyPackage,
    dayRate: result.dayRate,
    earnings: result.earnings,
    deductionsDetail: result.deductionsDetail,
    grossPay: result.grossPay,
    deductions: result.deductions,
    netPay: result.netPay,
    inHandSalary: result.inHandSalary,
    breakdown: buildBreakdown(result.earnings, result.deductionsDetail, result.netPay, result.unpaidLeaveDays),
  };
}

export function parseMonth(month: string): { year: number; month: number; label: string } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error("Invalid month. Use YYYY-MM");
  const label = payrollMonthTitle(y, m);
  return { year: y, month: m, label };
}

function inr(n: number) {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getLastCalendarMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function calculateEmployeePayroll(userId: string, month: string): Promise<PayslipCalculation> {
  const user = await User.findById(userId).select(
    "name email employeeId department role status joinDate accountNumber panNumber uanNumber"
  );
  if (!user) throw new Error("Employee not found");
  if (user.status !== "Active") throw new Error("Employee must be active to process payroll");

  const salary = await SalaryStructure.findOne({ userId: user._id });
  const validation = validateSalaryStructure(salary);
  if (!validation.valid) {
    throw new Error(
      `${validation.errors.join(" ")} Configure salary in HR → Employees → Salary Structure.`
    );
  }

  const components = salaryToComponents(salary)!;
  const monthlyPackage = computeMonthlyPackage(components);

  const { year, month: mo, label } = parseMonth(month);
  const { start, end } = payrollPeriodRange(year, mo);

  const attendance = await Attendance.find({
    userId: user._id,
    date: { $gte: start, $lte: end },
  });

  let presentDays = 0;
  for (const a of attendance) {
    if (a.status === "present") presentDays += 1;
    else if (a.status === "half_day") presentDays += 0.5;
  }

  const leaves = await LeaveRequest.find({
    userId: user._id,
    status: "approved",
    startDate: { $lte: end },
    endDate: { $gte: start },
  });

  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  for (const lv of leaves) {
    const days = countOverlapDays(start, end, lv.startDate, lv.endDate);
    if (lv.type === "unpaid") unpaidLeaveDays += days;
    else paidLeaveDays += days;
  }

  const payroll = computeAttendancePayroll({
    components,
    presentDays,
    paidLeaveDays,
    unpaidLeaveDays,
    manualIncentive: 0,
  });

  const earnings = payroll.earnings;
  const deductionsDetail = payroll.deductionsDetail;

  const breakdown = buildBreakdown(earnings, deductionsDetail, payroll.netPay, payroll.unpaidLeaveDays);

  return {
    userId: user._id.toString(),
    employeeName: user.name,
    employeeId: user.employeeId || "",
    department: user.department || "",
    role: user.role || "",
    email: user.email,
    joinDate: user.joinDate ? user.joinDate.toISOString().split("T")[0] : "",
    accountNumber: user.accountNumber || "",
    panNumber: user.panNumber || "",
    uanNumber: user.uanNumber || "",
    month,
    monthLabel: label,
    workingDays: payroll.workingDays,
    presentDays: payroll.presentDays,
    paidLeaveDays: payroll.paidLeaveDays,
    unpaidLeaveDays: payroll.unpaidLeaveDays,
    absentDays: payroll.absentDays,
    attendanceRatio: payroll.attendanceRatio,
    salaryConfigured: true,
    earnings,
    deductionsDetail,
    monthlyGross: monthlyPackage,
    dayRate: payroll.dayRate,
    grossPay: payroll.grossPay,
    deductions: payroll.deductions,
    netPay: payroll.netPay,
    inHandSalary: payroll.inHandSalary,
    breakdown,
  };
}

export async function buildPayslipPreviewPdf(body: Record<string, unknown>): Promise<Buffer> {
  const month = String(body.month || "");
  let monthLabel = String(body.monthLabel || "");
  if (!monthLabel && month) {
    monthLabel = parseMonth(month).label;
  }
  const earnings = resolvePayslipEarnings(body as Parameters<typeof resolvePayslipEarnings>[0]);
  const deductionsDetail = resolvePayslipDeductions(body as Parameters<typeof resolvePayslipDeductions>[0]);
  return buildPayslipPdf({
    employeeName: String(body.employeeName || ""),
    employeeId: String(body.employeeId || ""),
    role: String(body.role || ""),
    joinDate: String(body.joinDate || ""),
    accountNumber: String(body.accountNumber || ""),
    panNumber: String(body.panNumber || ""),
    uanNumber: String(body.uanNumber || ""),
    month: monthLabel || month,
    workingDays: Number(body.workingDays) || 0,
    presentDays: Number(body.presentDays) || 0,
    paidLeaveDays: Number(body.paidLeaveDays) || 0,
    unpaidLeaveDays: Number(body.unpaidLeaveDays) || 0,
    absentDays: Number(body.absentDays) || 0,
    earnings,
    deductionsDetail,
    grossPay: Number(body.grossPay) || earnings.total,
    deductions: Number(body.deductions) || deductionsDetail.total,
    netPay: Number(body.netPay) || 0,
  });
}

async function buildAndUploadPdf(calc: PayslipCalculation) {
  const pdfBuffer = await buildPayslipPdf({
    employeeName: calc.employeeName,
    employeeId: calc.employeeId,
    role: calc.role,
    joinDate: calc.joinDate,
    accountNumber: calc.accountNumber,
    panNumber: calc.panNumber,
    uanNumber: calc.uanNumber,
    month: calc.monthLabel,
    workingDays: calc.workingDays,
    presentDays: calc.presentDays,
    paidLeaveDays: calc.paidLeaveDays,
    unpaidLeaveDays: calc.unpaidLeaveDays,
    absentDays: calc.absentDays,
    earnings: calc.earnings,
    deductionsDetail: calc.deductionsDetail,
    grossPay: calc.grossPay,
    deductions: calc.deductions,
    netPay: calc.netPay,
  });
  const publicId = `${calc.month.replace("-", "_")}_${calc.userId}`;
  return uploadHrPdf(pdfBuffer, publicId);
}

export function formatPayslipResponse(
  slip: InstanceType<typeof Payslip>,
  email?: string,
  user?: {
    department?: string;
    joinDate?: Date;
    accountNumber?: string;
    panNumber?: string;
    uanNumber?: string;
  } | null
) {
  const joinDate =
    slip.joinDate ||
    (user?.joinDate ? user.joinDate.toISOString().split("T")[0] : "");
  return {
    id: slip._id.toString(),
    userId: slip.userId.toString(),
    month: slip.month,
    employeeName: slip.employeeName,
    employeeId: slip.employeeId || "",
    department: slip.department || user?.department || "",
    role: slip.role || "",
    joinDate,
    accountNumber: slip.accountNumber || user?.accountNumber || "",
    panNumber: slip.panNumber || user?.panNumber || "",
    uanNumber: slip.uanNumber || user?.uanNumber || "",
    email: email || "",
    grossPay: slip.grossPay,
    deductions: slip.deductions,
    netPay: slip.netPay,
    inHandSalary: slip.netPay,
    earnings: resolvePayslipEarnings(slip),
    deductionsDetail: resolvePayslipDeductions(slip),
    presentDays: slip.presentDays,
    workingDays: slip.workingDays,
    paidLeaveDays: slip.paidLeaveDays ?? 0,
    unpaidLeaveDays: slip.unpaidLeaveDays,
    absentDays: slip.absentDays,
    status: slip.status,
    publishedAt: slip.publishedAt,
    pdfUrl: slip.pdfUrl || "",
    emailedAt: slip.emailedAt,
    createdAt: slip.createdAt,
    updatedAt: slip.updatedAt,
  };
}

export async function saveEmployeePayslipDraft(
  userId: string,
  month: string,
  generatedByUserId: string,
  overrides?: PayslipOverrides
) {
  const salary = await SalaryStructure.findOne({ userId });
  const structureComponents = salaryToComponents(salary);

  let calc = await calculateEmployeePayroll(userId, month);
  if (overrides) calc = applyPayslipOverrides(calc, overrides, structureComponents ?? undefined);
  const uploaded = await buildAndUploadPdf(calc);

  const existing = await Payslip.findOne({ userId, month });
  if (existing?.cloudinaryPublicId && existing.cloudinaryPublicId !== uploaded.public_id) {
    await deleteCloudinaryAsset(existing.cloudinaryPublicId);
  }

  const payload = {
    userId,
    month,
    employeeName: calc.employeeName,
    employeeId: calc.employeeId,
    department: calc.department,
    role: calc.role,
    joinDate: calc.joinDate,
    accountNumber: calc.accountNumber,
    panNumber: calc.panNumber,
    uanNumber: calc.uanNumber,
    grossPay: calc.grossPay,
    deductions: calc.deductions,
    netPay: calc.netPay,
    earnings: calc.earnings,
    deductionsDetail: calc.deductionsDetail,
    presentDays: calc.presentDays,
    workingDays: calc.workingDays,
    paidLeaveDays: calc.paidLeaveDays,
    unpaidLeaveDays: calc.unpaidLeaveDays,
    absentDays: calc.absentDays,
    status: "draft" as const,
    publishedAt: undefined,
    generatedBy: generatedByUserId,
    pdfUrl: uploaded.secure_url,
    cloudinaryPublicId: uploaded.public_id,
  };

  const slip = existing
    ? await Payslip.findByIdAndUpdate(
        existing._id,
        { $set: payload, $unset: { publishedAt: 1 } },
        { new: true }
      )
    : await Payslip.create(payload);

  if (!slip) throw new Error("Failed to save payslip draft");
  return { slip, calc };
}

export async function publishAllPayslipsForMonth(month: string) {
  const drafts = await Payslip.find({ month, status: "draft" });
  const published: InstanceType<typeof Payslip>[] = [];
  for (const slip of drafts) {
    published.push(await publishEmployeePayslip(slip._id.toString()));
  }
  return published;
}

export async function publishEmployeePayslip(payslipId: string) {
  const slip = await Payslip.findById(payslipId);
  if (!slip) throw new Error("Payslip not found");
  if (slip.status === "published") throw new Error("Payslip is already published");
  if (slip.status === "superseded") throw new Error("Cannot publish a superseded payslip");

  await Payslip.updateMany(
    { userId: slip.userId, status: "published" },
    { $set: { status: "superseded" } }
  );

  slip.status = "published";
  slip.publishedAt = new Date();
  await slip.save();
  return slip;
}

export async function deletePayslipDraft(payslipId: string) {
  const slip = await Payslip.findById(payslipId);
  if (!slip) throw new Error("Payslip not found");
  if (slip.status !== "draft") throw new Error("Only draft payslips can be deleted");
  if (slip.cloudinaryPublicId) await deleteCloudinaryAsset(slip.cloudinaryPublicId);
  await slip.deleteOne();
}

export async function getEmployeeSalaryStatus(userId: string) {
  const salary = await SalaryStructure.findOne({ userId });
  const validation = validateSalaryStructure(salary);
  return {
    configured: validation.valid,
    errors: validation.errors,
    salary: salary
      ? {
          basic: salary.basic,
          hra: salary.hra,
          da: salary.da,
          allowances: salary.allowances,
          incentive: salary.incentive,
          pf: salary.pf,
          esi: salary.esi,
          tds: salary.tds,
          professionalTax: salary.professionalTax,
          monthlyGross: salary.monthlyGross,
        }
      : null,
  };
}
