import mongoose, { Schema, Document } from "mongoose";

export type ProjectStage = 
  | "First Technical Visit"
  | "Drawings Prepared"
  | "Client Confirmation of Drawings"
  | "Interior Selection"
  | "Moved to Factory"
  | "Ready for Dispatch"
  | "Installation Team Scheduled"
  | "Installation in Progress"
  | "Testing & Final Handover";

export interface IProject extends Document {
  // 1. Project Basic Details
  projectId?: string;
  projectName: string;
  customerName: string;
  projectType?: "New Installation" | "Modernization";
  siteAddress?: string;
  city?: string;
  salesPersonName?: string;
  orderDate?: Date;
  expectedCompletionDate?: Date;
  projectStatus?: "Planning" | "In Progress" | "On Hold" | "Completed";
  
  // 2. Lift / Technical Details
  liftType?: "MRL" | "Hydraulic" | "Gearless";
  numberOfLifts?: number;
  capacity?: string;
  numberOfStops?: number;
  speed?: string;
  doorType?: string;
  powerRequirement?: string;
  shaftStatus?: "Ready" | "Under Construction";
  
  // 3. Commercial & Order Details
  quotationId: string;
  orderValue?: number;
  advanceAmountReceived?: number;
  balanceAmount?: number;
  paymentMilestones?: string[];
  invoiceNumbers?: string[];
  gstDetails?: string;
  paymentStatus?: "Paid" | "Partial" | "Pending";
  
  // 4. Installation Progress Tracking
  materialDispatchDate?: Date;
  materialReceivedDate?: Date;
  machineInstallationStatus?: "Pending" | "In Progress" | "Completed";
  guideRailInstallation?: "Pending" | "In Progress" | "Completed";
  wiringElectricalWork?: "Pending" | "In Progress" | "Completed";
  cabinInstallation?: "Pending" | "In Progress" | "Completed";
  doorInstallation?: "Pending" | "In Progress" | "Completed";
  testingCommissioning?: "Pending" | "In Progress" | "Completed";
  safetyInspectionStatus?: "Pending" | "In Progress" | "Completed";
  governmentApproval?: string;
  
  // 5. Team & Responsibility
  siteEngineerName?: string;
  installationTechnician?: string;
  supervisor?: string;
  contactNumbers?: string;
  assignedDate?: Date;
  
  // 6. Issues & Delays
  issues?: Array<{
    description: string;
    issueType: "Material Delay" | "Civil Work Pending" | "Payment Delay" | "Other";
    raisedDate: Date;
    expectedResolutionDate?: Date;
    currentStatus: "Open" | "In Progress" | "Resolved";
  }>;
  
  // 7. Handover & Closure
  installationCompletionDate?: Date;
  handoverDate?: Date;
  clientSignOff?: boolean;
  warrantyStartDate?: Date;
  warrantyEndDate?: Date;
  amcOffered?: boolean;
  amcLinked?: string;
  
  // 8. Documents
  documents?: Array<{
    type: "Purchase Order" | "Drawings" | "Test Certificates" | "Handover Documents" | "Photos" | "Videos";
    fileName: string;
    fileUrl: string;
    uploadedDate: Date;
  }>;
  
  // Legacy fields
  location: string;
  elevatorType: string;
  currentStage: ProjectStage;
  startDate: Date;
  expectedCompletion: Date;
  progress: number;
  assignedEngineer: string;
  status: "On Track" | "Delayed" | "On Hold";
}

const ProjectSchema = new Schema<IProject>(
  {
    // 1. Project Basic Details
    projectId: { type: String },
    projectName: { type: String, required: true },
    customerName: { type: String, required: true },
    projectType: { type: String, enum: ["New Installation", "Modernization"] },
    siteAddress: { type: String },
    city: { type: String },
    salesPersonName: { type: String },
    orderDate: { type: Date },
    expectedCompletionDate: { type: Date },
    projectStatus: { type: String, enum: ["Planning", "In Progress", "On Hold", "Completed"], default: "Planning" },
    
    // 2. Lift / Technical Details
    liftType: { type: String, enum: ["MRL", "Hydraulic", "Gearless"] },
    numberOfLifts: { type: Number },
    capacity: { type: String },
    numberOfStops: { type: Number },
    speed: { type: String },
    doorType: { type: String },
    powerRequirement: { type: String },
    shaftStatus: { type: String, enum: ["Ready", "Under Construction"] },
    
    // 3. Commercial & Order Details
    quotationId: { type: String, required: true },
    orderValue: { type: Number },
    advanceAmountReceived: { type: Number },
    balanceAmount: { type: Number },
    paymentMilestones: [{ type: String }],
    invoiceNumbers: [{ type: String }],
    gstDetails: { type: String },
    paymentStatus: { type: String, enum: ["Paid", "Partial", "Pending"], default: "Pending" },
    
    // 4. Installation Progress Tracking
    materialDispatchDate: { type: Date },
    materialReceivedDate: { type: Date },
    machineInstallationStatus: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
    guideRailInstallation: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
    wiringElectricalWork: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
    cabinInstallation: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
    doorInstallation: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
    testingCommissioning: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
    safetyInspectionStatus: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
    governmentApproval: { type: String },
    
    // 5. Team & Responsibility
    siteEngineerName: { type: String },
    installationTechnician: { type: String },
    supervisor: { type: String },
    contactNumbers: { type: String },
    assignedDate: { type: Date },
    
    // 6. Issues & Delays
    issues: [{
      description: { type: String, required: true },
      issueType: { type: String, enum: ["Material Delay", "Civil Work Pending", "Payment Delay", "Other"], required: true },
      raisedDate: { type: Date, required: true },
      expectedResolutionDate: { type: Date },
      currentStatus: { type: String, enum: ["Open", "In Progress", "Resolved"], default: "Open" },
    }],
    
    // 7. Handover & Closure
    installationCompletionDate: { type: Date },
    handoverDate: { type: Date },
    clientSignOff: { type: Boolean, default: false },
    warrantyStartDate: { type: Date },
    warrantyEndDate: { type: Date },
    amcOffered: { type: Boolean, default: false },
    amcLinked: { type: String },
    
    // 8. Documents
    documents: [{
      type: { type: String, enum: ["Purchase Order", "Drawings", "Test Certificates", "Handover Documents", "Photos", "Videos"], required: true },
      fileName: { type: String, required: true },
      fileUrl: { type: String, required: true },
      uploadedDate: { type: Date, required: true },
    }],
    
    // Legacy fields
    location: { type: String, required: true },
    elevatorType: { type: String, required: true },
    currentStage: {
      type: String,
      enum: ["First Technical Visit", "Drawings Prepared", "Client Confirmation of Drawings", "Interior Selection", "Moved to Factory", "Ready for Dispatch", "Installation Team Scheduled", "Installation in Progress", "Testing & Final Handover"],
      default: "First Technical Visit",
    },
    startDate: { type: Date, required: true },
    expectedCompletion: { type: Date, required: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    assignedEngineer: { type: String, required: true },
    status: { type: String, enum: ["On Track", "Delayed", "On Hold"], default: "On Track" },
  },
  {
    timestamps: true,
  }
);

// Calculate progress based on stage
ProjectSchema.pre("save", function() {
  const stages: ProjectStage[] = [
    "First Technical Visit",
    "Drawings Prepared",
    "Client Confirmation of Drawings",
    "Interior Selection",
    "Moved to Factory",
    "Ready for Dispatch",
    "Installation Team Scheduled",
    "Installation in Progress",
    "Testing & Final Handover",
  ];
  
  // Only calculate progress if currentStage is set
  if (this.currentStage) {
    const stageIndex = stages.indexOf(this.currentStage);
    if (stageIndex !== -1) {
      this.progress = Math.round(((stageIndex + 1) / stages.length) * 100);
    } else {
      // If stage not found in array, set to 0 or keep existing progress
      console.warn(`Stage "${this.currentStage}" not found in stages array. Keeping existing progress: ${this.progress || 0}`);
      if (this.progress === undefined || this.progress === null) {
        this.progress = 0;
      }
    }
  } else {
    // No currentStage set, default to 0
    this.progress = 0;
  }
  
  // Ensure progress is within valid range
  if (this.progress < 0) this.progress = 0;
  if (this.progress > 100) this.progress = 100;
});

export default mongoose.model<IProject>("Project", ProjectSchema);





