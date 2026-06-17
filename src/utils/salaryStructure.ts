import type { ISalaryStructure } from "../models/SalaryStructure";

export type SalaryComponents = {
  basic: number;
  hra: number;
  da: number;
  allowances: number;
  incentive: number;
  pf: number;
  esi: number;
  tds: number;
  professionalTax: number;
};

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeGross(components: Pick<SalaryComponents, "basic" | "hra" | "da" | "allowances" | "incentive">) {
  return round2(components.basic + components.hra + components.da + components.allowances + (components.incentive || 0));
}

export function computeStatutoryTotal(components: Pick<SalaryComponents, "pf" | "esi" | "tds" | "professionalTax">) {
  return round2(components.pf + components.esi + components.tds + components.professionalTax);
}

export function salaryToComponents(sal: ISalaryStructure | null | undefined): SalaryComponents | null {
  if (!sal) return null;
  return {
    basic: sal.basic ?? 0,
    hra: sal.hra ?? 0,
    da: sal.da ?? 0,
    allowances: sal.allowances ?? 0,
    incentive: sal.incentive ?? 0,
    pf: sal.pf ?? 0,
    esi: sal.esi ?? 0,
    tds: sal.tds ?? 0,
    professionalTax: sal.professionalTax ?? 0,
  };
}

export function validateSalaryStructure(sal: ISalaryStructure | null | undefined): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!sal) {
    return { valid: false, errors: ["Salary structure is not configured for this employee."] };
  }
  const basic = Number(sal.basic) || 0;
  if (basic <= 0) errors.push("Basic pay is required and must be greater than zero.");
  const gross = computeGross({
    basic,
    hra: Number(sal.hra) || 0,
    da: Number(sal.da) || 0,
    allowances: Number(sal.allowances) || 0,
    incentive: Number(sal.incentive) || 0,
  });
  if (gross <= 0) errors.push("Total earnings (Basic + HRA + DA + Allowances + Incentive) must be greater than zero.");
  const storedGross = Number(sal.monthlyGross) || 0;
  if (storedGross > 0 && Math.abs(storedGross - gross) > 1) {
    errors.push(`Monthly gross (₹${storedGross}) must equal Basic + HRA + DA + Allowances + Incentive (₹${gross}).`);
  }
  return { valid: errors.length === 0, errors };
}

export function parseSalaryPayload(body: Record<string, unknown>) {
  const basic = Number(body.basic) || 0;
  const hra = Number(body.hra) || 0;
  const da = Number(body.da) || 0;
  const allowances = Number(body.allowances) || 0;
  const incentive = Number(body.incentive) || 0;
  const pf = Number(body.pf) || 0;
  const esi = Number(body.esi) || 0;
  const tds = Number(body.tds) || 0;
  const professionalTax = Number(body.professionalTax) || 0;
  const monthlyGross = computeGross({ basic, hra, da, allowances, incentive });
  return { basic, hra, da, allowances, incentive, pf, esi, tds, professionalTax, monthlyGross };
}
