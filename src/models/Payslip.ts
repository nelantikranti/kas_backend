import mongoose, { Schema, Document, Types } from "mongoose";

export type PayslipStatus = "draft" | "published" | "superseded";

export interface PayslipEarnings {
  basic: number;
  hra: number;
  da: number;
  allowances: number;
  incentive: number;
  total: number;
}

export interface PayslipDeductionsDetail {
  pf: number;
  esi: number;
  tds: number;
  professionalTax: number;
  lop: number;
  total: number;
}

export interface IPayslip extends Document {
  payrollRunId?: Types.ObjectId;
  userId: Types.ObjectId;
  month: string;
  employeeName: string;
  employeeId?: string;
  department?: string;
  role?: string;
  joinDate?: string;
  accountNumber?: string;
  panNumber?: string;
  uanNumber?: string;
  grossPay: number;
  deductions: number;
  netPay: number;
  earnings: PayslipEarnings;
  deductionsDetail: PayslipDeductionsDetail;
  presentDays: number;
  workingDays: number;
  paidLeaveDays?: number;
  unpaidLeaveDays: number;
  absentDays: number;
  status: PayslipStatus;
  generatedBy?: Types.ObjectId;
  publishedAt?: Date;
  pdfUrl?: string;
  cloudinaryPublicId?: string;
  emailedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EarningsSchema = new Schema(
  {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    da: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    incentive: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const DeductionsSchema = new Schema(
  {
    pf: { type: Number, default: 0 },
    esi: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    lop: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const PayslipSchema = new Schema<IPayslip>(
  {
    payrollRunId: { type: Schema.Types.ObjectId, ref: "PayrollRun" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    month: { type: String, required: true, index: true },
    employeeName: { type: String, required: true },
    employeeId: { type: String, default: "" },
    department: { type: String, default: "" },
    role: { type: String, default: "" },
    joinDate: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    panNumber: { type: String, default: "" },
    uanNumber: { type: String, default: "" },
    grossPay: { type: Number, required: true },
    deductions: { type: Number, default: 0 },
    netPay: { type: Number, required: true },
    earnings: { type: EarningsSchema, default: () => ({}) },
    deductionsDetail: { type: DeductionsSchema, default: () => ({}) },
    presentDays: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    unpaidLeaveDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "published", "superseded"],
      default: "draft",
      index: true,
    },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    pdfUrl: { type: String, default: "" },
    cloudinaryPublicId: { type: String, default: "" },
    emailedAt: { type: Date },
  },
  { timestamps: true }
);

// One payslip record per employee per month (draft is updated in place; publish supersedes prior published).
PayslipSchema.index({ userId: 1, month: 1 }, { unique: true });

export default mongoose.model<IPayslip>("Payslip", PayslipSchema);
