import Payslip, { IPayslip } from "../models/Payslip";
import User from "../models/User";
import { buildPayslipPdf } from "../utils/hrPdf";
import { resolvePayslipDeductions, resolvePayslipEarnings } from "../utils/payslipNormalize";

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export async function buildPayslipPdfFromRecord(slip: IPayslip): Promise<Buffer> {
  const earnings = resolvePayslipEarnings(slip);
  const deductionsDetail = resolvePayslipDeductions(slip);
  const user = await User.findById(slip.userId).select(
    "role joinDate accountNumber panNumber uanNumber"
  );
  const role = slip.role || user?.role || "";
  const joinDate =
    slip.joinDate || (user?.joinDate ? user.joinDate.toISOString().split("T")[0] : "");
  const accountNumber = slip.accountNumber || user?.accountNumber || "";
  const panNumber = slip.panNumber || user?.panNumber || "";
  const uanNumber = slip.uanNumber || user?.uanNumber || "";

  return buildPayslipPdf({
    employeeName: slip.employeeName || "",
    employeeId: slip.employeeId || "",
    role,
    joinDate,
    accountNumber,
    panNumber,
    uanNumber,
    month: monthLabel(slip.month),
    workingDays: Number(slip.workingDays) || 0,
    presentDays: Number(slip.presentDays) || 0,
    unpaidLeaveDays: Number(slip.unpaidLeaveDays) || 0,
    absentDays: Number(slip.absentDays) || 0,
    earnings,
    deductionsDetail,
    grossPay: Number(slip.grossPay) || earnings.total,
    deductions: Number(slip.deductions) || deductionsDetail.total,
    netPay: Number(slip.netPay) || 0,
  });
}

export async function getPayslipPdfBuffer(slipId: string): Promise<Buffer> {
  const slip = await Payslip.findById(slipId);
  if (!slip) throw new Error("Payslip not found");
  return buildPayslipPdfFromRecord(slip);
}
