import path from "path";
import { cloudinaryV2 } from "../config/cloudinary";

export function uploadHrPdf(
  buffer: Buffer,
  publicId: string
): Promise<{ secure_url: string; public_id: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinaryV2.uploader.upload_stream(
      {
        folder: "kas_crm/hr/payslips",
        public_id: publicId,
        resource_type: "raw",
        overwrite: true,
        access_mode: "public",
      },
      (err: unknown, result: { secure_url?: string; public_id?: string; bytes?: number } | undefined) => {
        if (err) {
          reject(new Error((err as Error)?.message || "Cloudinary upload failed"));
          return;
        }
        if (!result?.secure_url || !result?.public_id) {
          reject(new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          bytes: result.bytes || 0,
        });
      }
    );
    uploadStream.end(buffer);
  });
}

export async function deleteCloudinaryAsset(publicId: string): Promise<void> {
  try {
    await cloudinaryV2.uploader.destroy(publicId, { resource_type: "raw" });
  } catch (e) {
    console.warn("Cloudinary delete failed:", publicId, e);
  }
}

export function uploadHrDocument(
  buffer: Buffer,
  originalName: string
): Promise<{ secure_url: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const ext = path.extname(originalName).toLowerCase();
    const imageExts = [".jpg", ".jpeg", ".png"];
    const resourceType: "image" | "raw" = imageExts.includes(ext) ? "image" : "raw";

    const uploadStream = cloudinaryV2.uploader.upload_stream(
      {
        folder: "kas_crm/hr",
        resource_type: resourceType,
        use_filename: false,
      },
      (err: unknown, result: { secure_url?: string; bytes?: number } | undefined) => {
        if (err) {
          reject(new Error((err as Error)?.message || "Cloudinary upload failed"));
          return;
        }
        if (!result?.secure_url) {
          reject(new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve({ secure_url: result.secure_url, bytes: result.bytes || 0 });
      }
    );
    uploadStream.end(buffer);
  });
}
