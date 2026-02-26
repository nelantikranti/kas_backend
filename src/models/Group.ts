import mongoose, { Schema, Document } from "mongoose";

export interface IGroup extends Document {
  groupName: string;
  totalLeads: number;
  selected: boolean; // named 'selected' to avoid clash with Document.isSelected()
  addedBy: mongoose.Types.ObjectId;
  assignedTeam: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    groupName: {
      type: String,
      required: true,
      trim: true,
    },
    totalLeads: {
      type: Number,
      default: 0,
    },
    selected: {
      type: Boolean,
      default: true,
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTeam: [{
      type: Schema.Types.ObjectId,
      ref: "User",
    }],
  },
  { timestamps: true }
);

export default mongoose.model<IGroup>("Group", GroupSchema);
