import mongoose, { Schema, Document, Types } from "mongoose";

export interface ISalaryStructure extends Document {
  userId: Types.ObjectId;
  monthlyGross: number;
  basic: number;
  hra: number;
  da: number;
  allowances: number;
  incentive: number;
  pf: number;
  esi: number;
  tds: number;
  professionalTax: number;
  effectiveFrom?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SalaryStructureSchema = new Schema<ISalaryStructure>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    monthlyGross: { type: Number, required: true, min: 0, default: 0 },
    basic: { type: Number, default: 0, min: 0 },
    hra: { type: Number, default: 0, min: 0 },
    da: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    incentive: { type: Number, default: 0, min: 0 },
    pf: { type: Number, default: 0, min: 0 },
    esi: { type: Number, default: 0, min: 0 },
    tds: { type: Number, default: 0, min: 0 },
    professionalTax: { type: Number, default: 0, min: 0 },
    effectiveFrom: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<ISalaryStructure>("SalaryStructure", SalaryStructureSchema);
