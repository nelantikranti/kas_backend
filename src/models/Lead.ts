import mongoose, { Schema, Document } from "mongoose";

export interface ILead extends Document {
  leadId: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  stage: "New Lead" | "Lead Contacted" | "Meeting Scheduled" | "Meeting Completed" | "Quotation Sent" | "Manager Deliberation" | "Order Closed" | "Order Lost";
  value: number;
  assignedTo: string;
  createdAt: Date;
  lastContact: Date;
  notes: string;
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
      enum: ["New Lead", "Lead Contacted", "Meeting Scheduled", "Meeting Completed", "Quotation Sent", "Manager Deliberation", "Order Closed", "Order Lost"],
      default: "New Lead",
    },
    value: {
      type: Number,
      default: 0,
    },
    assignedTo: {
      type: String,
      required: true,
    },
    lastContact: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: "",
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
  },
  {
    timestamps: true,
    strict: true, // Ignore fields not in schema (like 'id')
  }
);

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

// Try to clean up immediately if already connected
cleanupIdIndex();

// Also clean up when connection is established
mongoose.connection.on('connected', cleanupIdIndex);

export default Lead;

