import User from "../models/User";
import SalaryStructure from "../models/SalaryStructure";
import Attendance from "../models/Attendance";
import LeaveRequest from "../models/LeaveRequest";
import Payslip from "../models/Payslip";
import { buildPayslipPdf } from "../utils/hrPdf";
import { uploadHrPdf, deleteCloudinaryAsset } from "../utils/hrUpload";
import {
  computeGross,
  computeStatutoryTotal,
  round2,
  salaryToComponents,
  validateSalaryStructure,
} from "../utils/salaryStructure";
import { resolvePayslipDeductions, resolvePayslipEarnings } from "../utils/payslipNormalize";
import { computeInHandSalary } from "../utils/payrollTotals";

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
  unpaidLeaveDays: number;
  absentDays: number;
  attendanceRatio: number;
  salaryConfigured: boolean;
  earnings: { basic: number; hra: number; da: number; allowances: number; incentive: number; total: number };
  deductionsDetail: { pf: number; esi: number; tds: number; professionalTax: number; lop: number; total: number };
  monthlyGross: number;
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
  absentDays?: number;
};

export function applyPayslipOverrides(calc: PayslipCalculation, overrides?: PayslipOverrides): PayslipCalculation {
  if (!overrides?.earnings && !overrides?.deductionsDetail && overrides?.presentDays == null) return calc;
  const totals = computeInHandSalary(
    { ...calc.earnings, ...(overrides.earnings || {}) },
    { ...calc.deductionsDetail, ...(overrides.deductionsDetail || {}) },
    { monthlyGross: calc.monthlyGross }
  );
  const presentDays = overrides?.presentDays != null ? overrides.presentDays : calc.presentDays;
  const absentDays =
    overrides?.absentDays != null
      ? overrides.absentDays
      : Math.max(0, calc.workingDays - presentDays - calc.unpaidLeaveDays);
  return {
    ...calc,
    earnings: totals.earnings,
    deductionsDetail: totals.deductionsDetail,
    grossPay: totals.grossPay,
    deductions: totals.deductions,
    netPay: totals.netPay,
    inHandSalary: totals.inHandSalary,
    presentDays,
    absentDays,
    attendanceRatio: calc.workingDays > 0 ? round2(presentDays / calc.workingDays) : 0,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseMonth(month: string): { year: number; month: number; label: string } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error("Invalid month. Use YYYY-MM");
  const label = new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  return { year: y, month: m, label };
}

function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function countOverlapDays(
  rangeStart: Date,
  rangeEnd: Date,
  leaveStart: Date,
  leaveEnd: Date
): number {
  const s = new Date(Math.max(rangeStart.getTime(), leaveStart.getTime()));
  const e = new Date(Math.min(rangeEnd.getTime(), leaveEnd.getTime()));
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function getLastCalendarMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function inr(n: number) {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const monthlyGross = computeGross(components);

  const { year, month: mo, label } = parseMonth(month);
  const { start, end } = monthRange(year, mo);
  const workingDays = daysInMonth(year, mo);

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

  let unpaidLeaveDays = 0;
  for (const lv of leaves) {
    const days = countOverlapDays(start, end, lv.startDate, lv.endDate);
    if (lv.type === "unpaid") unpaidLeaveDays += days;
  }

  const absentDays = Math.max(0, workingDays - presentDays - unpaidLeaveDays);
  const attendanceRatio = workingDays > 0 ? round2(presentDays / workingDays) : 0;

  const earnedBasic = round2(components.basic * attendanceRatio);
  const earnedHra = round2(components.hra * attendanceRatio);
  const earnedDa = round2(components.da * attendanceRatio);
  const earnedAllowances = round2(components.allowances * attendanceRatio);
  const earnedIncentive = round2(components.incentive * attendanceRatio);
  const totalEarnings = round2(earnedBasic + earnedHra + earnedDa + earnedAllowances + earnedIncentive);

  const lop = round2(Math.max(0, monthlyGross - totalEarnings));
  const statutory = computeStatutoryTotal(components);
  const totalDeductions = round2(statutory + lop);
  const netPay = round2(Math.max(0, totalEarnings - statutory));

  const earnings = {
    basic: earnedBasic,
    hra: earnedHra,
    da: earnedDa,
    allowances: earnedAllowances,
    incentive: earnedIncentive,
    total: totalEarnings,
  };
  const deductionsDetail = {
    pf: components.pf,
    esi: components.esi,
    tds: components.tds,
    professionalTax: components.professionalTax,
    lop,
    total: totalDeductions,
  };

  const breakdown: PayslipCalculation["breakdown"] = [
    { label: "Basic Pay", value: inr(earnedBasic), section: "earning" },
    { label: "HRA", value: inr(earnedHra), section: "earning" },
    { label: "DA", value: inr(earnedDa), section: "earning" },
    { label: "Allowances", value: inr(earnedAllowances), section: "earning" },
    { label: "Incentive", value: inr(earnedIncentive), section: "earning" },
    { label: "Gross earnings", value: inr(totalEarnings), section: "earning", highlight: true },
    { label: "Provident Fund", value: inr(components.pf), section: "deduction" },
    { label: "ESI", value: inr(components.esi), section: "deduction" },
    { label: "TDS", value: inr(components.tds), section: "deduction" },
    { label: "Professional Tax", value: inr(components.professionalTax), section: "deduction" },
    { label: "Loss of Pay", value: inr(lop), section: "deduction" },
    { label: "Total deductions", value: inr(totalDeductions), section: "deduction", highlight: true },
    { label: "Net salary", value: inr(netPay), highlight: true },
  ];

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
    workingDays,
    presentDays,
    unpaidLeaveDays,
    absentDays,
    attendanceRatio,
    salaryConfigured: true,
    earnings,
    deductionsDetail,
    monthlyGross,
    grossPay: totalEarnings,
    deductions: totalDeductions,
    netPay,
    inHandSalary: netPay,
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
  let calc = await calculateEmployeePayroll(userId, month);
  if (overrides) calc = applyPayslipOverrides(calc, overrides);
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
