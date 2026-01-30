import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string; // Store password (in production, hash it)
  role: "Admin" | "Sales Executive" | "Service Engineer" | "Project Manager" | "Accounts" | "Manager" | "Technician" | "Accountant";
  permissions: string[]; // Custom permissions array
  status: "Active" | "Inactive" | "Pending";
  lastLogin: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["Admin", "Sales Executive", "Service Engineer", "Project Manager", "Accounts", "Manager", "Technician", "Accountant"],
      default: "Sales Executive",
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Pending"],
      default: "Pending",
    },
    lastLogin: {
      type: String,
      default: new Date().toISOString().split("T")[0],
    },
  },
  {
    timestamps: true,
  }
);

// Note: No need to explicitly create index on email since `unique: true` already creates it

export default mongoose.model<IUser>("User", UserSchema);

