import mongoose, { Schema, Document } from "mongoose";

export interface IExpense extends Document {
  projectId: mongoose.Types.ObjectId;
  amount: number;
  description: string;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, default: "Expense" },
  },
  { timestamps: true }
);

export default mongoose.model<IExpense>("Expense", ExpenseSchema);
