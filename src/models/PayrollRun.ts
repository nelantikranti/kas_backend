import mongoose, { Schema, Document, Types } from "mongoose";

export type PayrollRunStatus = "draft" | "published";

export interface IPayrollRun extends Document {
  month: string;
  status: PayrollRunStatus;
  generatedBy: Types.ObjectId;
  employeeCount: number;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollRunSchema = new Schema<IPayrollRun>(
  {
    month: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employeeCount: { type: Number, default: 0 },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IPayrollRun>("PayrollRun", PayrollRunSchema);
