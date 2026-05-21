import mongoose, { Schema, Document, Types } from "mongoose";

export type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected";

export interface ITimesheetEntry extends Document {
  userId: Types.ObjectId;
  date: Date;
  hours: number;
  projectId?: Types.ObjectId;
  taskId?: Types.ObjectId;
  description: string;
  status: TimesheetStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TimesheetEntrySchema = new Schema<ITimesheetEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    hours: { type: Number, required: true, min: 0.25, max: 24 },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    taskId: { type: Schema.Types.ObjectId, ref: "Task" },
    description: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      default: "draft",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

TimesheetEntrySchema.index({ userId: 1, date: 1, projectId: 1 });

export default mongoose.model<ITimesheetEntry>("TimesheetEntry", TimesheetEntrySchema);
