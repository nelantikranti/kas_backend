import mongoose, { Schema, Document } from "mongoose";

export interface IPipelineStage {
  name: string;
  order: number;
}

export interface IPipeline extends Document {
  pipelineName: string;
  details?: string;
  group: mongoose.Types.ObjectId | null;
  stages: IPipelineStage[];
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
    details: {
      type: String,
      default: "",
      trim: true,
    },
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    stages: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          order: { type: Number, required: true },
        },
      ],
      default: [],
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
