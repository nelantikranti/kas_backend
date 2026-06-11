import mongoose, { Schema, Document, Types } from "mongoose";
import { USER_ROLES, type UserRole } from "../constants/hr";

export interface OnboardingChecklistItem {
  key: string;
  label: string;
  completed: boolean;
  completedAt?: Date;
}

export interface EmployeeDocument {
  _id?: Types.ObjectId;
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
  uploadedAt: Date;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  permissionSource?: "role" | "custom";
  permissions: string[];
  status: "Active" | "Inactive" | "Pending";
  lastLogin: string;
  phone?: string;
  employeeId?: string;
  department?: string;
  joinDate?: Date;
  managerId?: Types.ObjectId;
  onboarding?: {
    checklist: OnboardingChecklistItem[];
    documents: EmployeeDocument[];
    completedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OnboardingChecklistItemSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { _id: false }
);

const EmployeeDocumentSchema = new Schema(
  {
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: {
      type: String,
      default: "Sales Executive",
      required: true,
    },
    permissionSource: {
      type: String,
      enum: ["role", "custom"],
      default: "role",
    },
    permissions: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Pending"],
      default: "Pending",
    },
    lastLogin: {
      type: String,
      default: new Date().toISOString().split("T")[0],
    },
    phone: { type: String, default: "" },
    employeeId: { type: String, default: "", index: true },
    department: { type: String, default: "" },
    joinDate: { type: Date },
    managerId: { type: Schema.Types.ObjectId, ref: "User" },
    onboarding: {
      checklist: { type: [OnboardingChecklistItemSchema], default: [] },
      documents: { type: [EmployeeDocumentSchema], default: [] },
      completedAt: { type: Date },
    },
  },
  { timestamps: true }
);

// Force fresh schema on hot-reload (mongoose caches enum lists on first register)
if (mongoose.models.User) {
  mongoose.deleteModel("User");
}

export default mongoose.model<IUser>("User", UserSchema);
