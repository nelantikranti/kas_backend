import mongoose, { Schema, Document } from "mongoose";

export interface IRolePermissionOverride extends Document {
  role: string;
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
      trim: true,
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

