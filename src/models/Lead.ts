import mongoose, { Schema, Document } from "mongoose";

export interface ILead extends Document {
  leadId: string;
  name: string;
  company: string;
  /** Indian state (e.g. Tamil Nadu, Andhra Pradesh) */
  state?: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  /** Contact outcome: Ask To call back, DNP, Not required */
  contactStatus?: string;
  value: number;
  assignedTo: string;
  /** When set, visibility and reassignment use this id (stable vs display name). */
  assignedToUserId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  lastContact: Date;
  notes: string;
  /** Captured when stage is changed to "Order Lost". */
  orderLostReason?: string;
  /** Free-text for "Other" reason (optional). */
  orderLostReasonOther?: string;
  // Optional reference to a group this lead belongs to
  group?: mongoose.Types.ObjectId | null;
  contactReport?: {
    contactConfirmation: {
      successful: boolean;
    };
    contactDetails: {
      mode: string;
      dateTime: Date;
      spokenTo: string;
    };
    propertyDetails: {
      type: string;
      floors: string;
      usage: string;
    };
    siteReadiness: {
      pitAvailable: string;
      pitDepth: string;
      shaftAvailable: string;
      shaftType: string;
      shaftSize: string;
      machineRoom: string;
    };
    elevatorPreference: {
      type: string;
      brand: string;
    };
    clientIntent: {
      interestLevel: string;
      budget: string;
      timeline: string;
    };
    nextAction: {
      type: string;
      meetingTime?: string;
      followUpDate?: string;
    };
    salesOwner: {
      name: string;
      remarks: string;
    };
  };
  documents?: Array<{
    fileName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    uploadedDate: Date;
  }>;
}

const LeadSchema = new Schema<ILead>(
  {
    leadId: {
      type: String,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      default: "",
    },
    state: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      default: "Website",
    },
    stage: {
      type: String,
      default: "New Lead",
    },
    contactStatus: {
      type: String,
      default: "",
      enum: ["", "Ask To call back", "DNP", "Not required"],
    },
    value: {
      type: Number,
      default: 0,
    },
    assignedTo: {
      type: String,
      required: true,
    },
    assignedToUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
      sparse: true,
    },
    lastContact: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: "",
    },
    orderLostReason: {
      type: String,
      default: "",
      trim: true,
    },
    orderLostReasonOther: {
      type: String,
      default: "",
      trim: true,
    },
    group: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    contactReport: {
      contactConfirmation: {
        successful: { type: Boolean, default: false },
      },
      contactDetails: {
        mode: { type: String, default: "" },
        dateTime: { type: Date, default: Date.now },
        spokenTo: { type: String, default: "" },
      },
      propertyDetails: {
        type: { type: String, default: "" },
        floors: { type: String, default: "" },
        usage: { type: String, default: "" },
      },
      siteReadiness: {
        pitAvailable: { type: String, default: "" },
        pitDepth: { type: String, default: "" },
        shaftAvailable: { type: String, default: "" },
        shaftType: { type: String, default: "" },
        shaftSize: { type: String, default: "" },
        machineRoom: { type: String, default: "" },
      },
      elevatorPreference: {
        type: { type: String, default: "" },
        brand: { type: String, default: "" },
      },
      clientIntent: {
        interestLevel: { type: String, default: "" },
        budget: { type: String, default: "" },
        timeline: { type: String, default: "" },
      },
      nextAction: {
        type: { type: String, default: "" },
        meetingTime: { type: String, default: "" },
        followUpDate: { type: String, default: "" },
      },
      salesOwner: {
        name: { type: String, default: "" },
        remarks: { type: String, default: "" },
      },
    },
    documents: [{
      fileName: { type: String, required: true },
      fileType: { type: String, default: "application/octet-stream" },
      fileSize: { type: Number, default: 0 },
      fileUrl: { type: String, required: true },
      uploadedDate: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: true,
    strict: true, // Ignore fields not in schema (like 'id')
  }
);

// Performance: speed up duplicate checks and searches.
LeadSchema.index({ phone: 1 });
LeadSchema.index({ email: 1 });
// Support the default listing sort (createdAt desc) via an index so large
// collections don't trigger an in-memory sort that exceeds MongoDB's 32MB limit.
LeadSchema.index({ createdAt: -1 });

// Clean up the problematic id_1 index that causes duplicate key errors
// This index was likely created in a previous version but is no longer needed
const cleanupIdIndex = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      const collection = mongoose.connection.collection('leads');
      const indexes = await collection.indexes();
      const idIndex = indexes.find((idx: any) =>
        idx.name === 'id_1' || (idx.key && idx.key.id === 1 && idx.unique)
      );

      if (idIndex && idIndex.name) {
        await collection.dropIndex(idIndex.name);
        console.log('✅ Dropped problematic id_1 index from leads collection');
      }
    }
  } catch (error: any) {
    // Ignore errors if index doesn't exist or collection doesn't exist yet
    if (error.code !== 27 && error.code !== 26) { // 27 = IndexNotFound, 26 = NamespaceNotFound
      console.warn('⚠️  Could not drop id_1 index:', error.message);
    }
  }
};

const Lead = mongoose.model<ILead>("Lead", LeadSchema);

let didAttemptLeadIdIndexCleanup = false;
const cleanupIdIndexOnce = () => {
  if (didAttemptLeadIdIndexCleanup) return;
  didAttemptLeadIdIndexCleanup = true;
  void cleanupIdIndex();
};

if (mongoose.connection.readyState === 1) {
  cleanupIdIndexOnce();
}

mongoose.connection.on("connected", cleanupIdIndexOnce);

export default Lead;

