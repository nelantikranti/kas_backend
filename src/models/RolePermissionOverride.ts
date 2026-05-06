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

export interface IRolePermissionOverride extends Document {
  role: RoleName;
  permissions: string[];
  updatedAt: Date;
  createdAt: Date;
}

const RolePermissionOverrideSchema = new Schema<IRolePermissionOverride>(
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

// IMPORTANT: Use a dedicated collection name to avoid clashing with any legacy
// "rolepermissions" collection/indexes that may exist in the database.
export default mongoose.model<IRolePermissionOverride>(
  "RolePermissionOverride",
  RolePermissionOverrideSchema,
  "role_permission_overrides"
);

