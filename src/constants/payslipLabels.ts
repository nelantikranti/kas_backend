export const PAYSLIP_DEDUCTION_LABELS = {
  pf: "Provident Fund",
  esi: "ESI",
  tds: "TDS",
  professionalTax: "Professional Tax",
  lop: "LOP",
} as const;

export function formatLopDeductionLabel(_unpaidLeaveDays?: number): string {
  return PAYSLIP_DEDUCTION_LABELS.lop;
}

export function buildPayslipDeductionRows(
  detail: { pf: number; esi: number; tds: number; professionalTax: number; lop: number },
  unpaidLeaveDays: number
): Array<[string, number]> {
  const rows: Array<[string, number]> = [];
  if (detail.lop > 0) {
    rows.push([formatLopDeductionLabel(unpaidLeaveDays), detail.lop]);
  }
  rows.push(
    [PAYSLIP_DEDUCTION_LABELS.pf, detail.pf],
    [PAYSLIP_DEDUCTION_LABELS.esi, detail.esi],
    [PAYSLIP_DEDUCTION_LABELS.tds, detail.tds],
    [PAYSLIP_DEDUCTION_LABELS.professionalTax, detail.professionalTax]
  );
  return rows;
}

export function statutoryDeductionTotal(detail: {
  pf: number;
  esi: number;
  tds: number;
  professionalTax: number;
}): number {
  return detail.pf + detail.esi + detail.tds + detail.professionalTax;
}
