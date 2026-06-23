import crypto from "crypto";
import fs from "fs";
import path from "path";

const UPLOADS_ROOT = path.join(__dirname, "../../uploads");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getLeadDocumentAbsolutePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const absolute = path.resolve(UPLOADS_ROOT, normalized);
  const uploadsRootResolved = path.resolve(UPLOADS_ROOT);
  if (!absolute.startsWith(uploadsRootResolved)) {
    throw new Error("Invalid document path");
  }
  return absolute;
}

export function isRemoteDocumentUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}

export function saveLeadDocumentLocally(
  buffer: Buffer,
  leadId: string,
  originalName: string
): { fileUrl: string; bytes: number } {
  const safeLeadId = leadId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(UPLOADS_ROOT, "lead_documents", safeLeadId);
  ensureDir(dir);

  const ext = path.extname(originalName).toLowerCase();
  const baseName = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80) || "document";
  const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${baseName}${ext}`;
  const filePath = path.join(dir, uniqueName);

  fs.writeFileSync(filePath, buffer);

  const relativePath = path.posix.join("lead_documents", safeLeadId, uniqueName);
  return { fileUrl: relativePath, bytes: buffer.length };
}

export function deleteLeadDocumentFile(fileUrl: string): void {
  if (isRemoteDocumentUrl(fileUrl)) return;

  try {
    const absolutePath = getLeadDocumentAbsolutePath(fileUrl);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (error) {
    console.warn("Failed to delete local lead document:", fileUrl, error);
  }
}
