import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { COMPANY_ADDRESS, COMPANY_NAME } from "./companyInfo";
import { resolvePayslipDeductions, resolvePayslipEarnings } from "./payslipNormalize";
import { computeInHandSalary } from "./payrollTotals";

export type PayslipPdfData = {
  employeeName: string;
  employeeId: string;
  role: string;
  month: string;
  workingDays: number;
  presentDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  earnings: { basic: number; hra: number; da: number; allowances: number; total: number };
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
  doc.font("Helvetica-Bold").text("Pay Period:", rightX, y, { continued: true });
  doc.font("Helvetica").text(` ${period}`);
  y += 14;
  doc.font("Helvetica-Bold").text("Employee ID:", leftX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.employeeId || "—"}`);
  doc.font("Helvetica-Bold").text("Working Days:", rightX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.presentDays}`);
  y += 14;
  doc.font("Helvetica-Bold").text("Role:", leftX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.role || "—"}`);
  doc.font("Helvetica-Bold").text("LOP Days:", rightX, y, { continued: true });
  doc.font("Helvetica").text(` ${data.absentDays ?? 0}`);
  y += 18;

  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.5).strokeColor("#cccccc").stroke();
  y += 10;

  // Side-by-side earnings & deductions
  const midX = MARGIN + COL_W;
  doc.moveTo(midX, y).lineTo(midX, y + 130).lineWidth(0.5).strokeColor("#cccccc").stroke();

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

function formatJoinDate(joinDate: string) {
  const d = new Date(joinDate);
  if (Number.isNaN(d.getTime())) return joinDate;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number, col1: string, col2: string, col3: string) {
  doc.rect(MARGIN, y, CONTENT_W, 18).fill("#f5f5f5");
  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(8);
  doc.text(col1, MARGIN + 8, y + 5);
  doc.text(col2, MARGIN + 200, y + 5);
  doc.text(col3, MARGIN + 380, y + 5, { width: 110, align: "right" });
}

function drawTableRow(doc: PDFKit.PDFDocument, y: number, c2: string, amt: string, bold = false) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor("#000000");
  doc.text(c2, MARGIN + 200, y);
  doc.text(amt, MARGIN + 380, y, { width: 110, align: "right" });
  doc.moveTo(MARGIN, y + 14).lineTo(MARGIN + CONTENT_W, y + 14).lineWidth(0.5).strokeColor("#dddddd").stroke();
}

export async function buildOfferLetterPdf(data: OfferLetterPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
  let y = drawOfferLetterhead(doc, "LETTER OF EMPLOYMENT OFFER");

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  doc.font("Helvetica").fontSize(9).fillColor("#444444").text(`Date: ${today}`, MARGIN, y);
  y += 20;

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(`Dear ${data.candidateName},`, MARGIN, y);
  y += 16;
  doc.font("Helvetica").fontSize(9.5).text(
    `We are pleased to offer you employment with ${COMPANY_NAME} for the position of ${data.role}${
      data.department ? ` in the ${data.department} department` : ""
    }.`,
    MARGIN,
    y,
    { width: CONTENT_W, align: "justify", lineGap: 3 }
  );
  y = doc.y + 14;

  doc.font("Helvetica-Bold").fontSize(9.5).text("1. Position & Department", MARGIN, y);
  y += 14;
  doc.font("Helvetica").fontSize(9);
  doc.text(`Designation: ${data.role}`, MARGIN, y);
  y += 12;
  if (data.department) {
    doc.text(`Department: ${data.department}`, MARGIN, y);
    y += 12;
  }
  if (data.employeeId) {
    doc.text(`Employee ID: ${data.employeeId}`, MARGIN, y);
    y += 12;
  }
  doc.text(`Date of joining: ${formatJoinDate(data.joinDate)}`, MARGIN, y);
  y += 18;

  doc.font("Helvetica-Bold").fontSize(9.5).text("2. Compensation", MARGIN, y);
  y += 12;
  drawTableHeader(doc, y, "Component", "Description", "Amount");
  y += 22;
  const inHand = computeInHandSalary(
    { basic: data.basic || 0, hra: data.hra || 0, da: data.da || 0, allowances: data.allowances || 0 },
    { pf: data.pf || 0, esi: data.esi || 0, tds: data.tds || 0, professionalTax: data.professionalTax || 0, lop: 0 }
  );
  const statutory =
    (data.pf || 0) + (data.esi || 0) + (data.tds || 0) + (data.professionalTax || 0);
  drawTableRow(doc, y, "Total Package (Gross)", inr(data.monthlyGross));
  y += 18;
  drawTableRow(doc, y, "Deductions (Statutory)", inr(statutory));
  y += 18;
  drawTableRow(doc, y, "In-Hand Salary", inr(inHand.inHandSalary), true);
  y += 24;

  doc.font("Helvetica-Bold").fontSize(9.5).text("3. Terms of Employment", MARGIN, y);
  y += 14;
  doc.font("Helvetica").fontSize(9).text(
    "This offer is subject to verification of documents and completion of onboarding. Employment is governed by company policies as amended from time to time.",
    MARGIN,
    y,
    { width: CONTENT_W, align: "justify", lineGap: 3 }
  );
  y = doc.y + 10;

  if (data.notes) {
    doc.font("Helvetica-Bold").text("Additional terms:", MARGIN, y);
    y += 12;
    doc.font("Helvetica").text(data.notes, MARGIN, y, { width: CONTENT_W, lineGap: 2 });
    y = doc.y + 10;
  }

  const footerY = PAGE_H - MARGIN - 80;
  doc.font("Helvetica").fontSize(9).text(
    "We look forward to welcoming you aboard.",
    MARGIN,
    Math.min(y + 10, footerY - 50),
    { width: CONTENT_W }
  );

  doc.font("Helvetica-Bold").text(`For ${COMPANY_NAME}`, MARGIN, footerY);
  doc.moveTo(MARGIN, footerY + 36).lineTo(MARGIN + 180, footerY + 36).lineWidth(0.5).strokeColor("#999999").stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#666666");
  doc.text("Authorized Signatory · Human Resources", MARGIN, footerY + 40);

  return pdfToBuffer(doc);
}
