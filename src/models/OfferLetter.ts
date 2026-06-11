import mongoose, { Schema, Document } from "mongoose";

export interface IOfferLetter extends Document {
  candidateName: string;
  candidateEmail: string;
  role: string;
  department: string;
  monthlyGross: number;
  joinDate: string;
  notes: string;
  sentAt?: Date;
  sentBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OfferLetterSchema = new Schema<IOfferLetter>(
  {
    candidateName: { type: String, required: true, trim: true },
    candidateEmail: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, required: true, trim: true },
    department: { type: String, default: "" },
    monthlyGross: { type: Number, required: true, min: 0 },
    joinDate: { type: String, required: true },
    notes: { type: String, default: "" },
    sentAt: { type: Date },
    sentBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IOfferLetter>("OfferLetter", OfferLetterSchema);
