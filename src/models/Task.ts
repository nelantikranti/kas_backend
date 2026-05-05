import mongoose, { Schema, Document, Types } from "mongoose";

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export interface ITask extends Document {
  title: string;
  description?: string;
  assignedTo: Types.ObjectId;
  assignedBy: Types.ObjectId;
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: Date;
  dueDate?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    startDate: { type: Date },
    dueDate: { type: Date, index: true },
    completedAt: { type: Date, index: true },
  },
  { timestamps: true }
);

// Common query patterns: by assignee + status + date filters
TaskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
TaskSchema.index({ assignedTo: 1, status: 1, completedAt: 1 });

export default mongoose.model<ITask>("Task", TaskSchema);

