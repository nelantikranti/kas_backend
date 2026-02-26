import mongoose, { Schema, Document } from "mongoose";

export interface IPipeline extends Document {
  pipelineName: string;
  group: mongoose.Types.ObjectId | null;
  addedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PipelineSchema = new Schema<IPipeline>(
  {
    pipelineName: {
      type: String,
      required: true,
      trim: true,
    },
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IPipeline>("Pipeline", PipelineSchema);
