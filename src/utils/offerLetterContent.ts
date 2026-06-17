import { COMPANY_NAME } from "./companyInfo";

export const OFFER_OFFICE_LOCATION = "Hyderabad";
export const OFFER_COMPANY_LEGAL = "KAS Elevators Co. Pvt. Ltd";
export const OFFER_TAGLINE =
  "Welcome to KAS Elevators – Engineering Excellence, Elevating Lifestyles";

export const OFFER_STATIC_SECTIONS = [
  {
    title: "2. Working Hours & Days",
    body: [
      "Your working schedule will be Monday to Saturday (6 days/week), from 09:00 AM to 6:30 PM, with Sunday as weekly off.",
      "You are expected to adhere to the dress code and maintain professional conduct at all times.",
    ],
  },
  {
    title: "3. Probation & Confirmation",
    body: [
      "You will be on probation for a period of six (6) months from your date of joining.",
      "Upon satisfactory performance, your employment will be confirmed in writing.",
    ],
  },
  {
    title: "4. Leave & Holidays",
    bullets: [
      "Paid Leaves: 12 days per annum",
      "Casual Leaves: 6 days per annum",
      "Public Holidays as per company calendar",
    ],
  },
  {
    title: "5. Salary Payment & Tax Deductions",
    body: [
      "Your salary will be processed by the 5th of every month.",
      "Statutory deductions such as TDS, PF, ESI, and Professional Tax will be applicable as per law.",
    ],
  },
  {
    title: "6. Confidentiality & Non-Disclosure Agreement (NDA)",
    body: [
      "You shall not disclose any confidential information, trade secrets, or proprietary data of the company during or after your employment.",
    ],
  },
  {
    title: "7. Code of Conduct & Company Property",
    body: [
      "You are expected to maintain the highest standards of professional behavior.",
      "All company property (laptops, tools, documents, etc.) must be returned upon termination of employment.",
    ],
  },
  {
    title: "8. Notice Period & Termination",
    body: [
      "Either party may terminate employment by giving thirty (30) days written notice or salary in lieu thereof.",
    ],
  },
  {
    title: "9. Company Policies",
    bullets: [
      "Employee Code of Conduct",
      "Data Protection and Confidentiality Policy",
      "Anti-Harassment and Equal Opportunity Policy",
      "Leave and Attendance Policy",
      "Health and Safety Guidelines",
    ],
    closing:
      "Your employment shall be governed by the policies, rules, and regulations of the company as amended from time to time.",
  },
] as const;

export function offerIntroParagraph(role: string, department?: string) {
  const dept = department ? ` in the ${department} department` : "";
  return `With reference to your application and subsequent discussions, we are pleased to offer you the position of ${role}${dept} at ${OFFER_COMPANY_LEGAL}, ${OFFER_OFFICE_LOCATION}. We believe your skills and experience will be a valuable addition to our team.`;
}

export function offerReportingLine() {
  return "As per organizational structure";
}

export function annualCtc(monthlyGross: number) {
  return monthlyGross * 12;
}
