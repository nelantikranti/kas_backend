import type { PayslipDeductionsDetail, PayslipEarnings } from "../models/Payslip";

type SlipLike = {
  grossPay?: number;
  deductions?: number;
  netPay?: number;
  earnings?: PayslipEarnings | null;
  deductionsDetail?: PayslipDeductionsDetail | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeEarningsRow(e: PayslipEarnings, grossPay: number): PayslipEarnings {
  const basic = num(e.basic);
  const hra = num(e.hra);
  const da = num(e.da);
  const allowances = num(e.allowances);
  const incentive = num(e.incentive);
  const total = num(e.total) > 0 ? num(e.total) : basic + hra + da + allowances + incentive || num(grossPay);
  return { basic, hra, da, allowances, incentive, total };
}

function normalizeDeductionsRow(d: PayslipDeductionsDetail, deductions: number): PayslipDeductionsDetail {
  const pf = num(d.pf);
  const esi = num(d.esi);
  const tds = num(d.tds);
  const professionalTax = num(d.professionalTax);
  const lop = num(d.lop);
  const total = num(d.total) > 0 ? num(d.total) : pf + esi + tds + professionalTax + lop || num(deductions);
  return { pf, esi, tds, professionalTax, lop, total };
}

function hasEarningsBreakdown(e?: PayslipEarnings | null): boolean {
  if (!e) return false;
  return num(e.total) > 0 || num(e.basic) > 0 || num(e.hra) > 0 || num(e.da) > 0 || num(e.allowances) > 0 || num(e.incentive) > 0;
}

function hasDeductionsBreakdown(d?: PayslipDeductionsDetail | null): boolean {
  if (!d) return false;
  return (
    num(d.total) > 0 ||
    num(d.pf) > 0 ||
    num(d.esi) > 0 ||
    num(d.tds) > 0 ||
    num(d.professionalTax) > 0 ||
    num(d.lop) > 0
  );
}

export function resolvePayslipEarnings(slip: SlipLike): PayslipEarnings {
  const grossPay = num(slip.grossPay);
  if (hasEarningsBreakdown(slip.earnings)) {
    return normalizeEarningsRow(slip.earnings!, grossPay);
  }
  const netPay = num(slip.netPay);
  const deductions = num(slip.deductions);
  const gross = grossPay > 0 ? grossPay : netPay > 0 ? netPay + deductions : 0;
  if (gross > 0) {
    return { basic: gross, hra: 0, da: 0, allowances: 0, incentive: 0, total: gross };
  }
  return { basic: 0, hra: 0, da: 0, allowances: 0, incentive: 0, total: 0 };
}

export function resolvePayslipDeductions(slip: SlipLike): PayslipDeductionsDetail {
  const deductions = num(slip.deductions);
  if (hasDeductionsBreakdown(slip.deductionsDetail)) {
    return normalizeDeductionsRow(slip.deductionsDetail!, deductions);
  }
  return { pf: 0, esi: 0, tds: 0, professionalTax: 0, lop: deductions, total: deductions };
}
