import mongoose, { Schema, Document } from "mongoose";

export interface IDemo extends Document {
  name: string;
  email: string;
  phone: string;
  company?: string;
  elevatorType?: string;
  message?: string;
  status: "Pending" | "Contacted" | "Completed";
  createdAt: Date;
  updatedAt: Date;
}

const DemoSchema = new Schema<IDemo>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      default: "",
    },
    elevatorType: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Pending", "Contacted", "Completed"],
      default: "Pending",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IDemo>("Demo", DemoSchema);

















