import mongoose, { Schema, Document } from "mongoose";

export interface IAMCContract extends Document {
  contractId?: string; // AMC Contract ID / Number
  customerName: string;
  elevatorName?: string; // Elevator / Product Name
  amcType?: "Comprehensive" | "Non-Comprehensive"; // AMC Type
  projectName: string;
  elevatorId: string;
  contractStartDate: Date;
  contractEndDate: Date;
  duration: number;
  amcAmount?: number; // AMC Amount
  amountType?: "Yearly" | "Monthly"; // Yearly / Monthly
  paymentStatus?: "Paid" | "Pending" | "Overdue"; // Payment Status
  paymentMode?: "Cash" | "UPI" | "Bank Transfer" | "Cheque"; // Payment Mode
  invoiceNumber?: string; // Invoice Number
  invoiceDate?: Date; // Invoice Date
  gstAmount?: number; // GST Amount
  netRevenue?: number; // Net Revenue (after tax)
  nextPaymentDueDate?: Date; // Next Payment Due Date
  remarks?: string; // Remarks / Notes
  nextServiceDate: Date;
  serviceFrequency: string;
  assignedTechnician: string;
  status: "Active" | "Expired" | "Pending Renewal";
  totalValue: number;
  servicesCompleted: number;
  servicesPending: number;
  // Advanced fields
  monthWiseRevenue?: { [key: string]: number }; // Month-wise revenue
  yearWiseRevenue?: { [key: string]: number }; // Year-wise revenue
  totalAMCIncome?: number; // Total AMC income
  pendingAmount?: number; // Pending amount summary
}

const AMCContractSchema = new Schema<IAMCContract>(
  {
    contractId: {
      type: String,
    },
    customerName: {
      type: String,
      required: true,
    },
    elevatorName: {
      type: String,
    },
    amcType: {
      type: String,
      enum: ["Comprehensive", "Non-Comprehensive"],
    },
    projectName: {
      type: String,
      required: true,
    },
    elevatorId: {
      type: String,
      required: true,
    },
    contractStartDate: {
      type: Date,
      required: true,
    },
    contractEndDate: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    amcAmount: {
      type: Number,
    },
    amountType: {
      type: String,
      enum: ["Yearly", "Monthly"],
    },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Pending", "Overdue"],
    },
    paymentMode: {
      type: String,
      enum: ["Cash", "UPI", "Bank Transfer", "Cheque"],
    },
    invoiceNumber: {
      type: String,
    },
    invoiceDate: {
      type: Date,
    },
    gstAmount: {
      type: Number,
    },
    netRevenue: {
      type: Number,
    },
    nextPaymentDueDate: {
      type: Date,
    },
    remarks: {
      type: String,
    },
    nextServiceDate: {
      type: Date,
      required: true,
    },
    serviceFrequency: {
      type: String,
      required: true,
    },
    assignedTechnician: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "Expired", "Pending Renewal"],
      default: "Active",
    },
    totalValue: {
      type: Number,
      required: true,
    },
    servicesCompleted: {
      type: Number,
      default: 0,
    },
    servicesPending: {
      type: Number,
      default: 0,
    },
    monthWiseRevenue: {
      type: Map,
      of: Number,
    },
    yearWiseRevenue: {
      type: Map,
      of: Number,
    },
    totalAMCIncome: {
      type: Number,
    },
    pendingAmount: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAMCContract>("AMCContract", AMCContractSchema);





