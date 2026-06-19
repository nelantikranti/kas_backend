/** HR payroll always uses 30 days for day-rate calculation. */
export const PAYROLL_TWD = 30;

/** Pay period for YYYY-MM: 26th of previous month → 25th of selected month. */
export function payrollPeriodRange(year: number, month: number) {
  const start = new Date(year, month - 2, 26);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month - 1, 25);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatPeriodDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function payrollPeriodLabel(year: number, month: number): string {
  const { start, end } = payrollPeriodRange(year, month);
  return `${formatPeriodDate(start)} – ${formatPeriodDate(end)}`;
}

export function payrollMonthTitle(year: number, month: number): string {
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  return `${monthName} (${payrollPeriodLabel(year, month)})`;
}

export function countOverlapDays(
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
