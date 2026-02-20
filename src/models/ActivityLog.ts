import mongoose, { Schema, Document } from "mongoose";

export interface IActivityLog extends Document {
  userId?: string;
  userName: string;
  userRole?: string;
  performedBy?: string; // id of user who performed the action
  performedByName?: string;
  performedByRole?: string;
  targetId?: string; // id of affected entity (lead, user, project, etc.)
  actionType: string;
  moduleName?: string;
  description?: string;
  ipAddress?: string;
  deviceInfo?: string;
  status?: string;
  createdAt: Date;
  updatedAt?: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: String, default: null },
    userName: { type: String, required: true },
    userRole: { type: String, default: null },
    performedBy: { type: String, default: null },
    performedByName: { type: String, default: null },
    performedByRole: { type: String, default: null },
    targetId: { type: String, default: null },
    actionType: { type: String, required: true },
    moduleName: { type: String, default: null },
    description: { type: String, default: null },
    ipAddress: { type: String, default: null },
    deviceInfo: { type: String, default: null },
    status: { type: String, default: "Success" },
  },
  {
    timestamps: true,
  }
);

// Indexes to speed up common queries
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ userId: 1 });
ActivityLogSchema.index({ actionType: 1 });
ActivityLogSchema.index({ moduleName: 1 });

export default mongoose.model<IActivityLog>("ActivityLog", ActivityLogSchema);



