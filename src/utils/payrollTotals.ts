import { round2 } from "./salaryStructure";

export type EarningsInput = {
  basic: number;
  hra: number;
  da: number;
  allowances: number;
  total?: number;
};

export type DeductionsInput = {
  pf: number;
  esi: number;
  tds: number;
  professionalTax: number;
  lop: number;
  total?: number;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function sumEarnings(e: EarningsInput) {
  const basic = n(e.basic);
  const hra = n(e.hra);
  const da = n(e.da);
  const allowances = n(e.allowances);
  const total = round2(basic + hra + da + allowances);
  return { basic, hra, da, allowances, total };
}

export function sumDeductions(d: DeductionsInput) {
  const pf = n(d.pf);
  const esi = n(d.esi);
  const tds = n(d.tds);
  const professionalTax = n(d.professionalTax);
  const lop = n(d.lop);
  const total = round2(pf + esi + tds + professionalTax + lop);
  return { pf, esi, tds, professionalTax, lop, total };
}

export type PayrollTotalsOptions = {
  monthlyGross?: number;
  recalcLopFromPackage?: boolean;
};

/** In-hand = gross − total deductions when LOP is a normal deduction; else gross − statutory only. */
export function computeInHandSalary(
  earnings: EarningsInput,
  deductions: DeductionsInput,
  options?: PayrollTotalsOptions
) {
  const e = sumEarnings(earnings);
  const pf = n(deductions.pf);
  const esi = n(deductions.esi);
  const tds = n(deductions.tds);
  const professionalTax = n(deductions.professionalTax);
  const statutory = round2(pf + esi + tds + professionalTax);

  const monthlyGross = options?.monthlyGross;
  let lop = round2(n(deductions.lop));
  if (options?.recalcLopFromPackage && monthlyGross != null && monthlyGross > 0) {
    lop = round2(Math.max(0, monthlyGross - e.total));
  }

  const totalDeductions = round2(statutory + lop);
  const inHand =
    lop <= e.total
      ? round2(Math.max(0, e.total - totalDeductions))
      : round2(Math.max(0, e.total - statutory));
  const deductionsDetail = { pf, esi, tds, professionalTax, lop, total: totalDeductions };
  return {
    earnings: e,
    deductionsDetail,
    grossPay: e.total,
    deductions: totalDeductions,
    netPay: inHand,
    inHandSalary: inHand,
  };
}
