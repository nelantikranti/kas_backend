import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  userId?: string; // If null, notification is for all users
  message: string;
  type: "demo" | "quotation" | "project" | "amc" | "lead" | "contact" | "signup" | "system";
  relatedId?: string; // ID of related entity (lead, quotation, etc.)
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: String,
      default: null, // null means notification for all users
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["demo", "quotation", "project", "amc", "lead", "contact", "signup", "system"],
      default: "system",
    },
    relatedId: {
      type: String,
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default mongoose.model<INotification>("Notification", NotificationSchema);

