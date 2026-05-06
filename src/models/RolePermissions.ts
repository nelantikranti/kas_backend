import mongoose, { Schema, Document } from "mongoose";

export type RoleName =
  | "Admin"
  | "Sales Executive"
  | "Service Engineer"
  | "Project Manager"
  | "Accounts"
  | "Manager"
  | "Technician"
  | "Accountant";

export interface IRolePermissions extends Document {
  role: RoleName;
  permissions: string[];
  updatedAt: Date;
  createdAt: Date;
}

const RolePermissionsSchema = new Schema<IRolePermissions>(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      enum: ["Admin", "Sales Executive", "Service Engineer", "Project Manager", "Accounts", "Manager", "Technician", "Accountant"],
    },
    permissions: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model<IRolePermissions>("RolePermissions", RolePermissionsSchema);

