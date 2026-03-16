// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudinary = require("cloudinary");

// Configure both v1 and v2 API (v2 is exposed as cloudinary.v2)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Export v2 for use in routes — v2 has proper Promise support
export const cloudinaryV2 = cloudinary.v2 as typeof import("cloudinary").v2;

export default cloudinary;
