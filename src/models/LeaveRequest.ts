import mongoose, { Schema, Document, Types } from "mongoose";

export type LeaveStatus = "pending" | "approved" | "rejected";
export type LeaveType = "casual" | "sick" | "earned" | "unpaid" | "other";

export interface ILeaveRequest extends Document {
  userId: Types.ObjectId;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: LeaveStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveRequestSchema = new Schema<ILeaveRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["casual", "sick", "earned", "unpaid", "other"],
      default: "casual",
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: "" },
  },
  { timestamps: true }
);

LeaveRequestSchema.index({ userId: 1, startDate: -1 });

export default mongoose.model<ILeaveRequest>("LeaveRequest", LeaveRequestSchema);
