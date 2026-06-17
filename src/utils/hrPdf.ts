import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { COMPANY_ADDRESS, COMPANY_NAME } from "./companyInfo";
import {
  OFFER_COMPANY_LEGAL,
  OFFER_OFFICE_LOCATION,
  OFFER_STATIC_SECTIONS,
  OFFER_TAGLINE,
  annualCtc,
  offerIntroParagraph,
  offerReportingLine,
} from "./offerLetterContent";
import { resolvePayslipDeductions, resolvePayslipEarnings } from "./payslipNormalize";

export type PayslipPdfData = {
  employeeName: string;
  employeeId: string;
  role: string;
  joinDate?: string;
  accountNumber?: string;
  panNumber?: string;
  uanNumber?: string;
  month: string;
  workingDays: number;
  presentDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  earnings: { basic: number; hra: number; da: number; allowances: number; incentive: number; total: number };
  deductionsDetail: { pf: number; esi: number; tds: number; professionalTax: number; lop: number; total: number };
  grossPay: number;
  deductions: number;
  netPay: number;
};

export type OfferLetterPdfData = {
  candidateName: string;
  role: string;
  department: string;
  monthlyGross: number;
  basic?: number;
  hra?: number;
  da?: number;
  allowances?: number;
  pf?: number;
  esi?: number;
  tds?: number;
  professionalTax?: number;
  joinDate: string;
  notes: string;
  employeeId?: string;
};

const MARGIN = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_W = CONTENT_W / 2;

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function inr(n: unknown) {
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  return `Rs. ${safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LOGO_W = 100;
const LOGO_H = 48;

function tryDrawLogo(doc: PDFKit.PDFDocument, x: number, y: number): boolean {
  const candidates = [
    path.join(process.cwd(), "assets", "kas_img.png"),
    path.join(process.cwd(), "..", "kas_frontend", "public", "kas_img.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        doc.image(p, x, y, { width: LOGO_W, height: LOGO_H, fit: [LOGO_W, LOGO_H] });
        return true;
      } catch {
        /* fall through */
      }
    }
  }
  return false;
}

const PDF_HEADER_W = 875;
const PDF_HEADER_H = 197;
const PDF_FOOTER_W = 707;
const PDF_FOOTER_H = 82;
const OFFER_HEADER_H = (PAGE_W * PDF_HEADER_H) / PDF_HEADER_W;
const OFFER_FOOTER_W = PAGE_W;
const OFFER_FOOTER_H = (OFFER_FOOTER_W * PDF_FOOTER_H) / PDF_FOOTER_W;
const OFFER_FOOTER_Y = PAGE_H - OFFER_FOOTER_H;
const SECTION_COLOR = "#1B4F8C";
const BODY_BOTTOM = OFFER_FOOTER_Y - 14;

function resolvePdfHeaderPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "assets", "pdf_header.png"),
    path.join(process.cwd(), "..", "kas_backend", "assets", "pdf_header.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolvePdfFooterPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "assets", "pdf_footer.png"),
    path.join(process.cwd(), "..", "kas_backend", "assets", "pdf_footer.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function drawPdfHeaderBanner(doc: PDFKit.PDFDocument): number {
  const headerPath = resolvePdfHeaderPath();
  if (headerPath) {
    doc.image(headerPath, 0, 0, { width: PAGE_W, height: OFFER_HEADER_H });
    return OFFER_HEADER_H + 18;
  }
  return drawOfferLetterhead(doc, "EMPLOYMENT OFFER LETTER");
}

function drawPdfFooterBanner(doc: PDFKit.PDFDocument): void {
  const footerPath = resolvePdfFooterPath();
  if (footerPath) {
    doc.image(footerPath, 0, OFFER_FOOTER_Y, {
      width: OFFER_FOOTER_W,
      height: OFFER_FOOTER_H,
    });
    return;
  }
  doc.font("Helvetica-BoldOblique").fontSize(9).fillColor("#000000").text(OFFER_TAGLINE, MARGIN, PAGE_H - 40, {
    width: CONTENT_W,
    align: "center",
  });
}

function formatOfferDate(d = new Date()) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function ensureOfferSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed <= BODY_BOTTOM) return y;
  doc.addPage();
  return drawPdfHeaderBanner(doc);
}

function drawOfferSectionTitle(doc: PDFKit.PDFDocument, y: number, title: string): number {
  y = ensureOfferSpace(doc, y, 28);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(SECTION_COLOR).text(title, MARGIN, y, { width: CONTENT_W });
  return doc.y + 8;
}

function drawOfferParagraphs(doc: PDFKit.PDFDocument, y: number, paragraphs: string[]): number {
  doc.font("Helvetica").fontSize(9).fillColor("#000000");
  for (const paragraph of paragraphs) {
    y = ensureOfferSpace(doc, y, 40);
    doc.text(paragraph, MARGIN, y, { width: CONTENT_W, align: "justify", lineGap: 2 });
    y = doc.y + 8;
  }
  return y;
}

function drawOfferBullets(doc: PDFKit.PDFDocument, y: number, items: string[]): number {
  doc.font("Helvetica").fontSize(9).fillColor("#000000");
  for (const item of items) {
    y = ensureOfferSpace(doc, y, 20);
    doc.text(`• ${item}`, MARGIN + 8, y, { width: CONTENT_W - 8, lineGap: 1 });
    y = doc.y + 4;
  }
  return y;
}

function formatJoinDate(joinDate?: string) {
  if (!joinDate) return "—";
  const d = new Date(joinDate);
  if (Number.isNaN(d.getTime())) return joinDate;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function drawPayslipLetterhead(doc: PDFKit.PDFDocument, periodLabel: string) {
  const top = 40;
  const textLeft = MARGIN + LOGO_W + 14;
  const textWidth = CONTENT_W - LOGO_W - 14;

  tryDrawLogo(doc, MARGIN, top);

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
  doc.text(COMPANY_NAME, textLeft, top + 4, { width: textWidth, align: "right" });
  doc.font("Helvetica").fontSize(7.5).fillColor("#444444");
  doc.text(COMPANY_ADDRESS, textLeft, top + 20, { width: textWidth, align: "right" });
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000000");
  doc.text(`SALARY PAYSLIP — ${periodLabel.toUpperCase()}`, textLeft, top + 36, { width: textWidth, align: "right" });

  const ruleY = top + LOGO_H + 8;
  doc.moveTo(MARGIN, ruleY).lineTo(MARGIN + CONTENT_W, ruleY).lineWidth(1.5).strokeColor("#000000").stroke();
  return ruleY + 12;
}

function drawOfferLetterhead(doc: PDFKit.PDFDocument, title: string) {
  const top = 40;
  const textLeft = MARGIN + LOGO_W + 14;
  const textWidth = CONTENT_W - LOGO_W - 14;

  tryDrawLogo(doc, MARGIN, top);

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
  doc.text(COMPANY_NAME, textLeft, top + 4, { width: textWidth, align: "right" });
  doc.font("Helvetica").fontSize(7.5).fillColor("#444444");
  doc.text(COMPANY_ADDRESS, textLeft, top + 20, { width: textWidth, align: "right" });
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000000");
  doc.text(title, textLeft, top + 36, { width: textWidth, align: "right" });

  const ruleY = top + LOGO_H + 8;
  doc.moveTo(MARGIN, ruleY).lineTo(MARGIN + CONTENT_W, ruleY).lineWidth(1.5).strokeColor("#000000").stroke();
  return ruleY + 12;
}

function drawMoneyTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: [string, number][],
  totalLabel: string,
  total: number
): number {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000").text(title, x, y);
  doc.moveTo(x, y + 12).lineTo(x + w - 8, y + 12).lineWidth(0.75).strokeColor("#666666").stroke();

  let rowY = y + 18;
  doc.font("Helvetica").fontSize(8.5).fillColor("#222222");
  for (const [label, amount] of rows) {
    doc.text(label, x, rowY, { width: w * 0.58 });
    doc.text(inr(amount), x, rowY, { width: w - 8, align: "right" });
    rowY += 14;
  }

  doc.moveTo(x, rowY + 2).lineTo(x + w - 8, rowY + 2).lineWidth(0.75).strokeColor("#333333").stroke();
  rowY += 8;
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000000");
  doc.text(totalLabel, x, rowY, { width: w * 0.58 });
  doc.text(inr(total), x, rowY, { width: w - 8, align: "right" });
  return rowY + 16;
}

export async function buildPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  const earnings = resolvePayslipEarnings(data);
  const deductionsDetail = resolvePayslipDeductions(data);
  const period = data.month;

  const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
  let y = drawPayslipLetterhead(doc, period);

  // Employee info — two columns
  doc.font("Helvetica").fontSize(8.5).fillColor("#000000");
  const leftX = MARGIN;
  const rightX = MARGIN + CONTENT_W / 2 + 8;
  doc.font("Helvetica-Bold").text("Employee Name:", leftX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.employeeName}`);
  doc.font("Helvetica-Bold").text("Joining Date:", rightX, y, { continued: true });
  doc.font("Helvetica").text(` ${formatJoinDate(data.joinDate)}`);
  y += 14;
  doc.font("Helvetica-Bold").text("Employee ID:", leftX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.employeeId || "—"}`);
  doc.font("Helvetica-Bold").text("Pay Period:", rightX, y, { continued: true });
  doc.font("Helvetica").text(` ${period}`);
  y += 14;
  doc.font("Helvetica-Bold").text("Account Number:", leftX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.accountNumber || "—"}`);
  doc.font("Helvetica-Bold").text("Attendance:", rightX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.presentDays} present / ${data.workingDays} working days`);
  y += 14;
  doc.font("Helvetica-Bold").text("Pan Number:", leftX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.panNumber || "—"}`);
  doc.font("Helvetica-Bold").text("LOP Days:", rightX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.absentDays ?? 0}`);
  y += 14;
  doc.font("Helvetica-Bold").text("UAN Number:", leftX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.uanNumber || "—"}`);
  y += 18;

  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
  y += 10;

  // Side-by-side earnings & deductions
  const midX = MARGIN + COL_W;
  doc.moveTo(midX, y).lineTo(midX, y + 145).lineWidth(0.5).strokeColor("#cccccc").stroke();

  const earnEnd = drawMoneyTable(
    doc,
    MARGIN + 4,
    y,
    COL_W,
    "EARNINGS",
    [
      ["Basic Pay", earnings.basic],
      ["HRA", earnings.hra],
      ["DA", earnings.da],
      ["Allowances", earnings.allowances],
      ["Incentive", earnings.incentive],
    ],
    "Gross Salary",
    earnings.total
  );

  const dedEnd = drawMoneyTable(
    doc,
    midX + 8,
    y,
    COL_W,
    "DEDUCTIONS",
    [
      ["Provident Fund", deductionsDetail.pf],
      ["ESI", deductionsDetail.esi],
      ["TDS", deductionsDetail.tds],
      ["Professional Tax", deductionsDetail.professionalTax],
      ["Loss of Pay", deductionsDetail.lop],
    ],
    "Total Deductions",
    deductionsDetail.total
  );

  y = Math.max(earnEnd, dedEnd) + 4;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
  y += 8;

  // Net salary bar
  doc.rect(MARGIN, y, CONTENT_W, 26).fill("#f5f5f5");
  doc.rect(MARGIN, y, CONTENT_W, 26).lineWidth(1).strokeColor("#000000").stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000");
  doc.text("IN-HAND SALARY (NET PAYABLE)", MARGIN + 10, y + 8);
  doc.font("Helvetica-Bold").fontSize(14).text(inr(data.netPay), MARGIN, y + 6, { width: CONTENT_W - 10, align: "right" });
  y += 36;

  // Footer
  const footerY = PAGE_H - MARGIN - 72;
  doc.moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_W, footerY).lineWidth(0.5).strokeColor("#cccccc").stroke();

  const generated = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.font("Helvetica").fontSize(7.5).fillColor("#666666");
  doc.text(`Generated on: ${generated}`, MARGIN, footerY + 10);
  doc.text("This is a system-generated document. For queries, contact HR.", MARGIN, footerY + 22);

  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
  doc.text(`For ${COMPANY_NAME}`, MARGIN + CONTENT_W - 160, footerY + 10, { width: 160, align: "right" });
  doc.moveTo(MARGIN + CONTENT_W - 160, footerY + 44).lineTo(MARGIN + CONTENT_W, footerY + 44).lineWidth(0.5).strokeColor("#999999").stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor("#444444");
  doc.text("Authorized Signatory", MARGIN + CONTENT_W - 160, footerY + 48, { width: 160, align: "right" });
  doc.text("Human Resources", MARGIN + CONTENT_W - 160, footerY + 58, { width: 160, align: "right" });

  return pdfToBuffer(doc);
}

export async function buildOfferLetterPdf(data: OfferLetterPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ margin: MARGIN, size: "A4", bufferPages: true });
  let y = drawPdfHeaderBanner(doc);

  doc.font("Helvetica").fontSize(9).fillColor("#000000").text(`Date: ${formatOfferDate()}`, MARGIN, y, {
    width: CONTENT_W,
    align: "right",
  });
  y += 22;

  const salutation = data.candidateName.startsWith("Mr.") || data.candidateName.startsWith("Ms.")
    ? `Dear ${data.candidateName},`
    : `Dear Mr./Ms. ${data.candidateName},`;
  doc.font("Helvetica").fontSize(9.5).text(salutation, MARGIN, y);
  y += 16;

  y = drawOfferParagraphs(doc, y, [offerIntroParagraph(data.role, data.department)]);
  y += 4;

  y = drawOfferSectionTitle(doc, y, "1. POSITION & COMPENSATION");
  const compensationRows: [string, string][] = [
    ["Designation", data.role],
    ...(data.department ? [["Department", data.department] as [string, string]] : []),
    ["Location", OFFER_OFFICE_LOCATION],
    ["Reporting", offerReportingLine()],
    ["Annual CTC", inr(annualCtc(data.monthlyGross))],
    ["Monthly Gross Salary", inr(data.monthlyGross)],
    ["Date of Joining", formatJoinDate(data.joinDate)],
  ];
  if (data.employeeId) compensationRows.splice(1, 0, ["Employee ID", data.employeeId]);

  doc.font("Helvetica").fontSize(9).fillColor("#000000");
  for (const [label, value] of compensationRows) {
    y = ensureOfferSpace(doc, y, 16);
    doc.font("Helvetica-Bold").text(`${label}: `, MARGIN, y, { continued: true, width: CONTENT_W });
    doc.font("Helvetica").text(value);
    y = doc.y + 4;
  }
  y += 6;

  for (const section of OFFER_STATIC_SECTIONS) {
    y = drawOfferSectionTitle(doc, y, section.title);
    if ("body" in section && section.body) {
      y = drawOfferParagraphs(doc, y, [...section.body]);
    }
    if ("bullets" in section && section.bullets) {
      y = drawOfferBullets(doc, y, [...section.bullets]);
    }
    if ("closing" in section && section.closing) {
      y = drawOfferParagraphs(doc, y, [section.closing]);
    }
    y += 4;
  }

  if (data.notes?.trim()) {
    y = drawOfferSectionTitle(doc, y, "10. Additional Terms");
    y = drawOfferParagraphs(doc, y, [data.notes.trim()]);
  }

  y = ensureOfferSpace(doc, y, 220);
  if (y > BODY_BOTTOM - 200) {
    doc.addPage();
    y = drawPdfHeaderBanner(doc);
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text("Acceptance of Offer", MARGIN, y, {
    width: CONTENT_W,
    align: "center",
    underline: true,
  });
  y = doc.y + 14;

  y = drawOfferParagraphs(doc, y, [
    "Please sign and return a copy of this letter as confirmation of your acceptance.",
    "We look forward to having you as part of our team and are confident in your contribution to our continued growth and success.",
  ]);

  y = ensureOfferSpace(doc, y, 90);
  doc.font("Helvetica-Bold").fontSize(9).text(`For ${OFFER_COMPANY_LEGAL}`, MARGIN, y);
  y += 36;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + 180, y).lineWidth(0.5).strokeColor("#999999").stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#444444").text("Authorized Signatory", MARGIN, y + 4);
  y += 36;

  doc.font("Helvetica-BoldOblique").fontSize(10).fillColor("#000000").text("Employee Acknowledgment", MARGIN, y, {
    width: CONTENT_W,
    align: "center",
    underline: true,
  });
  y = doc.y + 12;

  y = drawOfferParagraphs(doc, y, [
    `I, ${data.candidateName}, have read and understood the terms and conditions mentioned in this letter and hereby accept this offer of employment.`,
  ]);

  y = ensureOfferSpace(doc, y, 70);
  doc.font("Helvetica-Bold").fontSize(9).text("Employee Signature:", MARGIN, y);
  y += 28;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + 220, y).lineWidth(0.5).strokeColor("#999999").stroke();
  y += 10;
  doc.font("Helvetica-Bold").fontSize(9).text("Date:", MARGIN, y);
  y += 28;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + 140, y).lineWidth(0.5).strokeColor("#999999").stroke();

  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i += 1) {
    doc.switchToPage(pageRange.start + i);
    drawPdfFooterBanner(doc);
  }

  return pdfToBuffer(doc);
}
