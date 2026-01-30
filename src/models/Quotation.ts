import mongoose, { Schema, Document } from "mongoose";

export interface IQuotation extends Document {
  leadId: string;
  leadName: string;
  projectAddress?: string;
  contactNumber?: string;
  elevatorType: string;
  modelNumber?: string;
  floors: number;
  capacity: number;
  speed: number;
  shaftType?: string;
  application?: string;
  cabinType?: string;
  doorType?: string;
  features: string[];
  // Cost breakdown - Standard rates
  standardRates: {
    basicCost: number;
    shaftMasonry: number;
    shaftFilling: number;
    installation: number;
    extraTravelHeight: number;
    premiumCabin: number;
    multiColorLED: number;
    glassDoor: number;
    premiumRALColor: number;
    customizedCabinSize: number;
    transportation: number;
    advancedFeatures: number;
  };
  // Cost breakdown - Signature rates (what customer pays)
  signatureRates: {
    basicCost: number;
    shaftMasonry: number;
    shaftFilling: number;
    installation: number;
    extraTravelHeight: number;
    premiumCabin: number;
    multiColorLED: number;
    glassDoor: number;
    premiumRALColor: number;
    customizedCabinSize: number;
    transportation: number;
    advancedFeatures: number;
  };
  // Calculated totals
  standardTotal: number;
  standardGST: number;
  standardNet: number;
  signatureTotal: number;
  signatureGST: number;
  signatureNet: number;
  // Payment terms
  timeOfDelivery?: string;
  paymentTerms?: {
    percentage1: number;
    amount1: number;
    percentage2: number;
    amount2: number;
  };
  // Legacy fields (for backward compatibility)
  basePrice: number;
  installationCost: number;
  tax: number;
  totalAmount: number;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: Date;
  validUntil: Date;
  version: number;
}

const QuotationSchema = new Schema<IQuotation>(
  {
    leadId: {
      type: String,
      required: true,
    },
    leadName: {
      type: String,
      required: true,
    },
    projectAddress: {
      type: String,
      default: "",
    },
    contactNumber: {
      type: String,
      default: "",
    },
    elevatorType: {
      type: String,
      required: true,
    },
    modelNumber: {
      type: String,
      default: "KAS-GX630",
    },
    floors: {
      type: Number,
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
    },
    speed: {
      type: Number,
      required: true,
    },
    shaftType: {
      type: String,
      default: "G S",
    },
    application: {
      type: String,
      default: "Outdoor",
    },
    cabinType: {
      type: String,
      default: "Standard",
    },
    doorType: {
      type: String,
      default: "Automatic Door",
    },
    features: {
      type: [String],
      default: [],
    },
    standardRates: {
      basicCost: { type: Number, default: 1450000 },
      shaftMasonry: { type: Number, default: 0 },
      shaftFilling: { type: Number, default: 0 },
      installation: { type: Number, default: 60000 },
      extraTravelHeight: { type: Number, default: 0 },
      premiumCabin: { type: Number, default: 80000 },
      multiColorLED: { type: Number, default: 25000 },
      glassDoor: { type: Number, default: 75000 },
      premiumRALColor: { type: Number, default: 45000 },
      customizedCabinSize: { type: Number, default: 40000 },
      transportation: { type: Number, default: 50000 },
      advancedFeatures: { type: Number, default: 112000 },
    },
    signatureRates: {
      basicCost: { type: Number, default: 1440000 },
      shaftMasonry: { type: Number, default: 0 },
      shaftFilling: { type: Number, default: 0 },
      installation: { type: Number, default: 0 },
      extraTravelHeight: { type: Number, default: 0 },
      premiumCabin: { type: Number, default: 0 },
      multiColorLED: { type: Number, default: 0 },
      glassDoor: { type: Number, default: 0 },
      premiumRALColor: { type: Number, default: 0 },
      customizedCabinSize: { type: Number, default: 0 },
      transportation: { type: Number, default: 0 },
      advancedFeatures: { type: Number, default: 0 },
    },
    standardTotal: {
      type: Number,
      default: 1937000,
    },
    standardGST: {
      type: Number,
      default: 348660,
    },
    standardNet: {
      type: Number,
      default: 2285660,
    },
    signatureTotal: {
      type: Number,
      default: 1440000,
    },
    signatureGST: {
      type: Number,
      default: 259200,
    },
    signatureNet: {
      type: Number,
      default: 1699200,
    },
    timeOfDelivery: {
      type: String,
      default: "3 months from customer's confirmation of drawings and finishes.",
    },
    paymentTerms: {
      percentage1: { type: Number, default: 50 },
      amount1: { type: Number, default: 0 },
      percentage2: { type: Number, default: 50 },
      amount2: { type: Number, default: 0 },
    },
    // Legacy fields (for backward compatibility)
    basePrice: {
      type: Number,
      default: function() {
        return (this as any).signatureTotal || 1440000;
      },
    },
    installationCost: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: function() {
        return (this as any).signatureGST || 259200;
      },
    },
    totalAmount: {
      type: Number,
      default: function() {
        return (this as any).signatureNet || 1699200;
      },
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    validUntil: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IQuotation>("Quotation", QuotationSchema);













