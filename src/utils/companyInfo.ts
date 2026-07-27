export const COMPANY_NAME = process.env.COMPANY_NAME || "KAS Home Elevators Pvt. Ltd.";
export const COMPANY_BRAND = "KAS CRM";
export const COMPANY_ADDRESS =
  process.env.COMPANY_ADDRESS ||
  "Hyderabad, Telangana, India · www.kashomeelevators.com";

/** Mask all but the last 4 digits of a bank account number for payslip display. */
export function maskAccountNumber(account?: string | null): string {
  const raw = String(account || "").replace(/\s+/g, "");
  if (!raw) return "—";
  if (raw.length <= 4) return raw;
  return `${"*".repeat(raw.length - 4)}${raw.slice(-4)}`;
}
