import mongoose, { Schema, Document } from "mongoose";

export interface IIntegration extends Document {
  key: string;
  accessToken?: string;
  pageId?: string;
  // Google Ads webhook (key: google_ads)
  webhookUrl?: string;
  webhookSecret?: string;
  updatedAt: Date;
}

const IntegrationSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    accessToken: { type: String, default: "" },
    pageId: { type: String, default: "" },
    webhookUrl: { type: String, default: "" },
    webhookSecret: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IIntegration>("Integration", IntegrationSchema);
