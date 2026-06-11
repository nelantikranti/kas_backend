import nodemailer from "nodemailer";

const COMPANY_NAME = process.env.COMPANY_NAME || "KAS Home Elevators";

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
}

export function isMailConfigured(): boolean {
  return !!getTransport();
}

export async function sendEmailWithPdf(options: {
  to: string;
  subject: string;
  text: string;
  filename: string;
  pdfBuffer: Buffer;
}): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    throw new Error("Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env");
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || `noreply@${COMPANY_NAME.replace(/\s/g, "").toLowerCase()}.com`;

  await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    attachments: [
      {
        filename: options.filename,
        content: options.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export { COMPANY_NAME };
