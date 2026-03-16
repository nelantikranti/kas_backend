import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import http from "http";
import https from "https";
import { cloudinaryV2 as cloudinary } from "../config/cloudinary";
import Project from "../models/Project";
import Expense from "../models/Expense";
import { authenticate } from "../middleware/auth";
import { checkPermission, checkAnyPermission } from "../middleware/permissions";
import { PERMISSIONS } from "../utils/permissions";

// Ensure TypeScript knows about the global Node.js console
declare const console: any;

// Use memory storage so multer buffers the file in RAM, then we stream it to Cloudinary.
// This avoids multer-storage-cloudinary which is incompatible with multer v2.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".dwg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed: ${ext}`));
  },
});

// Upload a buffer to Cloudinary using v2 API (proper Promise support)
function uploadToCloudinary(
  buffer: Buffer,
  originalName: string
): Promise<{ secure_url: string; public_id: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    const ext = path.extname(originalName).toLowerCase();
    const imageExts = [".jpg", ".jpeg", ".png"];
    const resourceType: "image" | "raw" = imageExts.includes(ext) ? "image" : "raw";
    const publicId = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${path.basename(originalName, ext)}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "kas_crm/documents",
        resource_type: resourceType,
        public_id: publicId,
        use_filename: false,
      },
      (err: any, result: any) => {
        if (err) {
          reject(new Error(err?.message || "Cloudinary upload failed"));
          return;
        }
        if (!result) {
          reject(new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve({ secure_url: result.secure_url, public_id: result.public_id, bytes: result.bytes });
      }
    );

    // Handle stream errors explicitly
    uploadStream.on("error", (streamErr: any) => {
      reject(new Error(streamErr?.message || "Upload stream error"));
    });

    uploadStream.end(buffer);
  });
}

const router = express.Router();

const PROJECT_READ_PERMISSIONS = [
  PERMISSIONS.PROJECTS_VIEW,
  PERMISSIONS.PROJECTS_CREATE,
  PERMISSIONS.PROJECTS_EDIT,
  PERMISSIONS.PROJECTS_DELETE,
  PERMISSIONS.PROJECTS_ASSIGN,
  PERMISSIONS.DOCUMENT_UPLOAD,
  PERMISSIONS.DOCUMENT_DELETE,
  PERMISSIONS.EXPENSE_VIEW,
  PERMISSIONS.EXPENSE_ADD,
  PERMISSIONS.EXPENSE_EDIT,
  PERMISSIONS.EXPENSE_DELETE,
  PERMISSIONS.LEADS_VIEW,
  PERMISSIONS.LEADS_EDIT,
];

// Helper function to format dates for frontend
const formatDate = (date: Date | undefined) => date ? date.toISOString().split("T")[0] : undefined;

router.get("/", authenticate, checkAnyPermission(PROJECT_READ_PERMISSIONS), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const projects = await Project.find().sort({ createdAt: -1 });
    // Convert MongoDB _id to id and format all fields for frontend compatibility
    const formattedProjects = projects.map(project => {
      const projectObj = project.toObject({ versionKey: false });
      return {
        ...projectObj,
        id: projectObj._id.toString(),
        _id: undefined,
        __v: undefined,
        startDate: formatDate(project.startDate),
        expectedCompletion: formatDate(project.expectedCompletion),
        orderDate: formatDate(project.orderDate),
        expectedCompletionDate: formatDate(project.expectedCompletionDate),
        materialDispatchDate: formatDate(project.materialDispatchDate),
        materialReceivedDate: formatDate(project.materialReceivedDate),
        assignedDate: formatDate(project.assignedDate),
        installationCompletionDate: formatDate(project.installationCompletionDate),
        handoverDate: formatDate(project.handoverDate),
        warrantyStartDate: formatDate(project.warrantyStartDate),
        warrantyEndDate: formatDate(project.warrantyEndDate),
        issues: (projectObj.issues || []).map((issue: any) => ({
          ...issue,
          id: issue._id?.toString(),
          _id: undefined,
          raisedDate: formatDate(issue.raisedDate),
          expectedResolutionDate: formatDate(issue.expectedResolutionDate),
        })),
        documents: (projectObj.documents || []).map((doc: any) => ({
          ...doc,
          id: doc._id?.toString(),
          _id: undefined,
          uploadedDate: formatDate(doc.uploadedDate),
        })),
      };
    });
    if (!res.headersSent) {
      res.json(formattedProjects);
    } else {
      console.warn("Response already sent for /api/projects GET");
    }
  } catch (error) {
    console.error("Error fetching projects:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch projects" });
    } else {
      console.warn("Cannot send error response for /api/projects because headers already sent");
    }
  }
});

// Project expenses - require any expense permission (view, delete, edit, or add) to fetch list
router.get("/:id/expenses", authenticate, checkAnyPermission([PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_DELETE, PERMISSIONS.EXPENSE_EDIT, PERMISSIONS.EXPENSE_ADD]), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const expenses = await Expense.find({ projectId: req.params.id }).sort({ createdAt: -1 });
    const formatted = expenses.map((e) => {
      const o = e.toObject();
      return { id: o._id.toString(), projectId: o.projectId?.toString(), amount: o.amount, description: o.description || "Expense" };
    });
    res.json(formatted);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

router.post("/:id/expenses", authenticate, checkPermission(PERMISSIONS.EXPENSE_ADD), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const { amount, description } = req.body;
    if (amount === undefined || amount === null || Number(amount) < 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }
    const expense = new Expense({
      projectId: req.params.id,
      amount: Number(amount),
      description: typeof description === "string" ? description.trim() || "Expense" : "Expense",
    });
    await expense.save();
    const o = expense.toObject();
    res.status(201).json({ id: o._id.toString(), projectId: o.projectId?.toString(), amount: o.amount, description: o.description });
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

router.put("/:id/expenses/:expenseId", authenticate, checkPermission(PERMISSIONS.EXPENSE_EDIT), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const { amount, description } = req.body;
    if (amount === undefined || amount === null || Number(amount) < 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }
    const updated = await Expense.findOneAndUpdate(
      { _id: req.params.expenseId, projectId: req.params.id },
      {
        amount: Number(amount),
        description: typeof description === "string" ? description.trim() || "Expense" : "Expense",
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Expense not found" });
    const o = updated.toObject();
    res.json({ id: o._id.toString(), projectId: o.projectId?.toString(), amount: o.amount, description: o.description });
  } catch (error) {
    console.error("Error updating expense:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

router.delete("/:id/expenses/:expenseId", authenticate, checkPermission(PERMISSIONS.EXPENSE_DELETE), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }
    const deleted = await Expense.findOneAndDelete({ _id: req.params.expenseId, projectId: req.params.id });
    if (!deleted) return res.status(404).json({ error: "Expense not found" });
    res.json({ message: "Expense deleted" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// Helper function to convert date strings to Date objects
const convertDates = (data: any) => {
  const dateFields = [
    'orderDate', 'expectedCompletionDate', 'materialDispatchDate', 'materialReceivedDate',
    'assignedDate', 'installationCompletionDate', 'handoverDate', 'warrantyStartDate',
    'warrantyEndDate', 'startDate', 'expectedCompletion'
  ];
  
  const converted = { ...data };
  
  dateFields.forEach(field => {
    if (converted[field] !== undefined && converted[field] !== null) {
      // Handle both date strings and Date objects
      if (typeof converted[field] === 'string') {
        const dateStr = converted[field].trim();
        // Skip empty strings, invalid patterns like "23e", "1.", etc.
        if (dateStr === '' || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
          console.warn(`Invalid date format for field ${field}: ${dateStr}`);
          delete converted[field];
          return;
        }
        try {
          const date = new Date(dateStr);
          // Check if date is valid
          if (!isNaN(date.getTime()) && date.toISOString().startsWith(dateStr.substring(0, 10))) {
            converted[field] = date;
          } else {
            console.warn(`Invalid date for field ${field}: ${dateStr}`);
            delete converted[field];
          }
        } catch (e) {
          console.warn(`Error parsing date for field ${field}: ${dateStr}`, e);
          delete converted[field];
        }
      } else if (converted[field] instanceof Date) {
        // Already a Date object, validate it
        if (isNaN(converted[field].getTime())) {
          console.warn(`Invalid Date object for field ${field}`);
          delete converted[field];
        }
      } else {
        // Invalid value type, remove it
        console.warn(`Invalid value type for date field ${field}: ${typeof converted[field]}`);
        delete converted[field];
      }
    }
  });
  
  // Convert issues dates
  if (converted.issues && Array.isArray(converted.issues)) {
    converted.issues = converted.issues.map((issue: any) => ({
      ...issue,
      raisedDate: issue.raisedDate ? new Date(issue.raisedDate) : new Date(),
      expectedResolutionDate: issue.expectedResolutionDate ? new Date(issue.expectedResolutionDate) : undefined,
    }));
  }
  
  // Convert documents dates
  if (converted.documents && Array.isArray(converted.documents)) {
    converted.documents = converted.documents.map((doc: any) => ({
      ...doc,
      uploadedDate: doc.uploadedDate ? new Date(doc.uploadedDate) : new Date(),
    }));
  }
  
  return converted;
};

router.post("/", authenticate, checkPermission(PERMISSIONS.PROJECTS_CREATE), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.error("❌ MongoDB connection check failed. ReadyState:", mongoose.connection.readyState);
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running.",
        details: `Connection state: ${mongoose.connection.readyState} (1=connected, 0=disconnected, 2=connecting, 3=disconnecting)`
      });
    }
    
    // Verify connection is actually working by pinging the database
    if (!mongoose.connection.db) {
      console.error("❌ MongoDB connection.db is undefined");
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running.",
        details: "Connection state indicates connected but database instance is not available."
      });
    }
    
    try {
      await mongoose.connection.db.admin().ping();
    } catch (pingError: any) {
      console.error("❌ MongoDB ping failed:", pingError.message);
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running.",
        details: "Connection check passed but database ping failed. MongoDB may be unreachable."
      });
    }

    // Validate request body exists
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ 
        error: "Invalid request body. Expected a JSON object." 
      });
    }

    console.log("📥 Received project creation request:", JSON.stringify(req.body, null, 2));
    
    let projectData;
    try {
      projectData = convertDates(req.body);
    } catch (dateError: any) {
      console.error("Error converting dates:", dateError);
      return res.status(400).json({ 
        error: "Invalid date format in request data",
        details: dateError.message || "Please check all date fields"
      });
    }
    
    console.log("🔄 After date conversion:", JSON.stringify(projectData, null, 2));
    
    // Remove MongoDB _id and id fields to prevent duplicate key errors
    // MongoDB will automatically generate _id for new documents
    delete projectData._id;
    delete projectData.id;
    
    // Trim string fields
    if (typeof projectData.projectName === 'string') projectData.projectName = projectData.projectName.trim();
    if (typeof projectData.customerName === 'string') projectData.customerName = projectData.customerName.trim();
    if (typeof projectData.location === 'string') projectData.location = projectData.location.trim();
    if (typeof projectData.elevatorType === 'string') projectData.elevatorType = projectData.elevatorType.trim();
    if (typeof projectData.quotationId === 'string') projectData.quotationId = projectData.quotationId.trim();
    if (typeof projectData.assignedEngineer === 'string') projectData.assignedEngineer = projectData.assignedEngineer.trim();
    
    // Validate and sanitize numeric fields - ensure they are valid numbers or undefined
    const numericFields = ['numberOfLifts', 'numberOfStops', 'orderValue', 'advanceAmountReceived', 'balanceAmount', 'progress'];
    numericFields.forEach(field => {
      if (projectData[field] !== undefined && projectData[field] !== null) {
        if (typeof projectData[field] === 'string') {
          // Try to parse string to number, remove non-numeric characters except decimal point
          const cleaned = projectData[field].toString().replace(/[^\d.-]/g, '');
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed) && isFinite(parsed)) {
            projectData[field] = parsed;
          } else {
            // Invalid value, remove it
            console.warn(`Invalid numeric value for ${field}: ${projectData[field]}, removing it`);
            delete projectData[field];
          }
        } else if (typeof projectData[field] === 'number') {
          // Already a number, validate it's finite
          if (!isFinite(projectData[field])) {
            console.warn(`Invalid numeric value for ${field}: ${projectData[field]}, removing it`);
            delete projectData[field];
          }
        } else {
          // Invalid type, remove it
          console.warn(`Invalid type for numeric field ${field}: ${typeof projectData[field]}, removing it`);
          delete projectData[field];
        }
      }
    });
    
    // Ensure progress is between 0 and 100
    if (projectData.progress !== undefined && projectData.progress !== null) {
      if (typeof projectData.progress === 'number') {
        projectData.progress = Math.max(0, Math.min(100, projectData.progress));
      }
    }

    // Validate required fields before processing
    if (!projectData.quotationId || projectData.quotationId === "") {
      return res.status(400).json({ error: "quotationId is required" });
    }
    if (!projectData.projectName || projectData.projectName === "") {
      return res.status(400).json({ error: "projectName is required" });
    }
    if (!projectData.customerName || projectData.customerName === "") {
      return res.status(400).json({ error: "customerName is required" });
    }
    if (!projectData.location || projectData.location === "") {
      return res.status(400).json({ error: "location is required" });
    }
    if (!projectData.elevatorType || projectData.elevatorType === "") {
      return res.status(400).json({ error: "elevatorType is required" });
    }
    if (!projectData.assignedEngineer || projectData.assignedEngineer === "") {
      return res.status(400).json({ error: "assignedEngineer is required" });
    }

    // Ensure required legacy fields are set
    if (!projectData.location && projectData.siteAddress) {
      projectData.location = projectData.siteAddress;
    }
    if (!projectData.elevatorType && projectData.liftType) {
      projectData.elevatorType = projectData.liftType;
    }
    
    // Handle dates - ensure they are valid Date objects
    const now = new Date();
    
    // Check if startDate is missing or invalid (including empty string)
    if (!projectData.startDate || 
        (typeof projectData.startDate === 'string' && projectData.startDate.trim() === '') ||
        !(projectData.startDate instanceof Date) || 
        isNaN(projectData.startDate.getTime())) {
      if (projectData.orderDate && projectData.orderDate instanceof Date && !isNaN(projectData.orderDate.getTime())) {
        projectData.startDate = projectData.orderDate;
      } else {
        projectData.startDate = now;
      }
    }
    
    // Check if expectedCompletion is missing or invalid (including empty string)
    if (!projectData.expectedCompletion || 
        (typeof projectData.expectedCompletion === 'string' && projectData.expectedCompletion.trim() === '') ||
        !(projectData.expectedCompletion instanceof Date) || 
        isNaN(projectData.expectedCompletion.getTime())) {
      if (projectData.expectedCompletionDate && projectData.expectedCompletionDate instanceof Date && !isNaN(projectData.expectedCompletionDate.getTime())) {
        projectData.expectedCompletion = projectData.expectedCompletionDate;
      } else {
        // Set expected completion to 90 days from start date
        const startDate = projectData.startDate instanceof Date ? projectData.startDate : now;
        projectData.expectedCompletion = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);
      }
    }
    
    // Ensure currentStage is set
    if (!projectData.currentStage) {
      projectData.currentStage = "First Technical Visit";
    }
    
    // Progress will be calculated automatically by the pre-save hook based on currentStage
    // Remove progress if it's invalid to let the schema default/pre-save hook handle it
    if (projectData.progress !== undefined && projectData.progress !== null) {
      if (typeof projectData.progress !== 'number' || !isFinite(projectData.progress)) {
        delete projectData.progress; // Let the schema default handle it
      }
    }
    
    // CRITICAL: Remove id field completely before creating document to avoid duplicate key error
    // MongoDB uses _id as primary key, not id - the id field should never be set
    delete projectData.id;
    delete projectData._id;
    
    // Create a clean object with only allowed fields (exclude id completely)
    const { id, _id, ...cleanProjectData } = projectData;
    
    const project = new Project(cleanProjectData);
    
    // Validate before saving - validateSync throws an error, doesn't return one
    try {
      project.validateSync();
    } catch (validationError: any) {
      console.error("Project validation error:", validationError);
      const errorMessages = Object.values(validationError.errors || {}).map((err: any) => err.message).join(", ");
      return res.status(400).json({ 
        error: "Validation failed", 
        details: errorMessages || validationError.message 
      });
    }
    
    // Final connection check before save
    if (mongoose.connection.readyState !== 1) {
      console.error("❌ MongoDB disconnected right before save. ReadyState:", mongoose.connection.readyState);
      return res.status(503).json({ 
        error: "Database connection lost. Please try again.",
        details: "Connection was active but disconnected before saving. This may indicate network issues or MongoDB server problems."
      });
    }
    
    const savedProject = await project.save();
    
    console.log("✅ Project saved to database:", {
      id: savedProject._id,
      projectName: savedProject.projectName,
      currentStage: savedProject.currentStage,
      progress: savedProject.progress,
    });

    // Log activity: project created
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performerId: string | undefined = undefined;
      let performerName = "Unknown";
      let performerRole: string | undefined = undefined;
      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        performerId = parts[1];
        const performer = await (await import("../models/User")).default.findById(performerId).select("name role");
        if (performer) {
          performerName = performer.name;
          performerRole = performer.role;
        }
      }
      const { logActivity } = await import("../middleware/activityLogger");
      await logActivity({
        userId: undefined,
        userName: savedProject.projectName,
        userRole: undefined,
        performedBy: performerId,
        performedByName: performerName,
        performedByRole: performerRole,
        targetId: savedProject._id.toString(),
        actionType: "Create",
        moduleName: "Projects",
        description: `Created project ${savedProject.projectName}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log project creation activity:", err);
    }

    // Convert MongoDB _id to id and format dates for frontend compatibility
    const savedObj = savedProject.toObject({ versionKey: false });
    res.status(201).json({
      ...savedObj,
      id: savedObj._id.toString(),
      _id: undefined,
      __v: undefined,
      startDate: formatDate(savedProject.startDate),
      expectedCompletion: formatDate(savedProject.expectedCompletion),
      orderDate: formatDate(savedProject.orderDate),
      expectedCompletionDate: formatDate(savedProject.expectedCompletionDate),
      materialDispatchDate: formatDate(savedProject.materialDispatchDate),
      materialReceivedDate: formatDate(savedProject.materialReceivedDate),
      assignedDate: formatDate(savedProject.assignedDate),
      installationCompletionDate: formatDate(savedProject.installationCompletionDate),
      handoverDate: formatDate(savedProject.handoverDate),
      warrantyStartDate: formatDate(savedProject.warrantyStartDate),
      warrantyEndDate: formatDate(savedProject.warrantyEndDate),
      issues: (savedObj.issues || []).map((issue: any) => ({
        ...issue,
        id: issue._id?.toString(),
        _id: undefined,
        raisedDate: formatDate(issue.raisedDate),
        expectedResolutionDate: formatDate(issue.expectedResolutionDate),
      })),
      documents: (savedObj.documents || []).map((doc: any) => ({
        ...doc,
        id: doc._id?.toString(),
        _id: undefined,
        uploadedDate: formatDate(doc.uploadedDate),
      })),
    });
  } catch (error: any) {
    console.error("Error creating project:", error);
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error stack:", error?.stack);
    console.error("Request body was:", JSON.stringify(req.body, null, 2));
    
    // Make sure response hasn't been sent already
    if (res.headersSent) {
      console.error("Response already sent, cannot send error");
      return;
    }
    
    // Handle validation errors
    if (error?.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err?.message || String(err));
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationErrors.join(", ")
      });
    }
    
    // Handle duplicate key errors (E11000) - specifically for id field
    if (error?.code === 11000 || (error?.name === 'MongoServerError' && error?.code === 11000)) {
      console.error("❌ Duplicate key error:", error.message);
      const duplicateField = error?.keyPattern ? Object.keys(error.keyPattern)[0] : 'unknown';
      
      // If it's the id field causing issues, try to drop the index and retry
      if (duplicateField === 'id' && mongoose.connection.db) {
        try {
          console.log("🔧 Attempting to fix: Dropping problematic 'id' index...");
          await mongoose.connection.db.collection('projects').dropIndex('id_1').catch((dropErr: any) => {
            if (dropErr.code !== 27) { // 27 = IndexNotFound
              console.error("Could not drop index:", dropErr.message);
            }
          });
          
          // Clean up documents with id: null
          await mongoose.connection.db.collection('projects').updateMany(
            { $or: [{ id: null }, { id: { $exists: false } }] },
            { $unset: { id: "" } }
          ).catch(() => {});
          
          console.log("✅ Index cleanup attempted. Please try creating the project again.");
        } catch (fixError: any) {
          console.error("Could not fix index automatically:", fixError.message);
        }
      }
      
      return res.status(409).json({ 
        error: "Duplicate key error",
        details: `A project with this ${duplicateField} already exists. ${duplicateField === 'id' ? 'The problematic index has been attempted to be fixed. Please try again.' : 'Please use a unique value.'}`
      });
    }
    
    // Handle MongoDB errors
    if (error?.name === 'MongoServerError' || error?.name === 'MongoNetworkError' || error?.name === 'MongooseServerSelectionError') {
      console.error("❌ MongoDB connection error details:", {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        readyState: mongoose.connection.readyState
      });
      
      // Check current connection state
      const connectionState = mongoose.connection.readyState;
      let details = "Database connection failed. ";
      
      if (connectionState === 0) {
        details += "MongoDB is disconnected. ";
      } else if (connectionState === 2) {
        details += "MongoDB is still connecting. ";
      } else if (connectionState === 3) {
        details += "MongoDB is disconnecting. ";
      }
      
      if (error?.message) {
        details += error.message;
      } else {
        details += "Please check if MongoDB is running and accessible.";
      }
      
      return res.status(503).json({ 
        error: "Database connection error. Please try again later.",
        details: details
      });
    }
    
    // Handle cast errors (invalid ObjectId, etc.)
    if (error?.name === 'CastError') {
      return res.status(400).json({ 
        error: "Invalid data format",
        details: error?.message || "One or more fields have invalid values"
      });
    }
    
    // Ensure we have a valid error message with details
    let errorMessage = "Failed to create project";
    let errorDetails = "";
    
    if (error?.message) {
      // Don't include "next is not a function" in the error message
      if (!error.message.includes('next is not a function')) {
        errorMessage = error.message;
        errorDetails = error.message;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetails = error;
    } else if (error?.toString && !error.toString().includes('next is not a function')) {
      errorMessage = error.toString();
      errorDetails = error.toString();
    }
    
    // Include additional context if available
    if (error?.errors && typeof error.errors === 'object') {
      const validationDetails = Object.values(error.errors || {}).map((err: any) => err?.message || String(err)).join(", ");
      if (validationDetails) {
        errorDetails = validationDetails;
      }
    }
    
    console.error("Final error response:", { error: errorMessage, details: errorDetails });
    
    return res.status(400).json({ 
      error: errorMessage, 
      details: errorDetails || "Please check all required fields are filled correctly"
    });
  }
});

router.put("/:id", authenticate, checkAnyPermission([PERMISSIONS.PROJECTS_EDIT, PERMISSIONS.PROJECTS_ASSIGN]), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const updateData = convertDates(req.body);
    // Never allow overwriting documents via the general update endpoint.
    // Documents have dedicated routes: POST/DELETE /:id/documents/:docId
    delete updateData.documents;

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    // Format dates for frontend compatibility
    const updatedObj = project.toObject({ versionKey: false });
    res.json({
      ...updatedObj,
      id: updatedObj._id.toString(),
      _id: undefined,
      __v: undefined,
      startDate: formatDate(project.startDate),
      expectedCompletion: formatDate(project.expectedCompletion),
      orderDate: formatDate(project.orderDate),
      expectedCompletionDate: formatDate(project.expectedCompletionDate),
      materialDispatchDate: formatDate(project.materialDispatchDate),
      materialReceivedDate: formatDate(project.materialReceivedDate),
      assignedDate: formatDate(project.assignedDate),
      installationCompletionDate: formatDate(project.installationCompletionDate),
      handoverDate: formatDate(project.handoverDate),
      warrantyStartDate: formatDate(project.warrantyStartDate),
      warrantyEndDate: formatDate(project.warrantyEndDate),
      issues: (updatedObj.issues || []).map((issue: any) => ({
        ...issue,
        id: issue._id?.toString(),
        _id: undefined,
        raisedDate: formatDate(issue.raisedDate),
        expectedResolutionDate: formatDate(issue.expectedResolutionDate),
      })),
      documents: (updatedObj.documents || []).map((doc: any) => ({
        ...doc,
        id: doc._id?.toString(),
        _id: undefined,
        uploadedDate: formatDate(doc.uploadedDate),
      })),
    });
    
    // Log activity: project updated
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performerId: string | undefined = undefined;
      let performerName = "Unknown";
      let performerRole: string | undefined = undefined;
      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        performerId = parts[1];
        const performer = await (await import("../models/User")).default.findById(performerId).select("name role");
        if (performer) {
          performerName = performer.name;
          performerRole = performer.role;
        }
      }
      const { logActivity } = await import("../middleware/activityLogger");
      await logActivity({
        userId: undefined,
        userName: project.projectName,
        userRole: undefined,
        performedBy: performerId,
        performedByName: performerName,
        performedByRole: performerRole,
        targetId: project._id.toString(),
        actionType: "Update",
        moduleName: "Projects",
        description: `Updated project ${project.projectName}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log project update activity:", err);
    }
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(400).json({ error: "Failed to update project" });
  }
});

// Allowed MIME types for document upload (server-side validation)
const ALLOWED_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".dwg": "application/acad",
};

// Upload a document for a project stage (multipart/form-data)
router.post("/:id/documents", authenticate, checkAnyPermission([PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.PROJECTS_EDIT, PERMISSIONS.PROJECTS_CREATE]), (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "File upload error" });
    }
    let cloudinaryPublicId: string | undefined;
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: "Database connection unavailable." });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const stage = req.body.stage;
      if (!stage) {
        return res.status(400).json({ error: "stage is required" });
      }

      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Server-side MIME type validation based on extension
      const ext = path.extname(req.file.originalname).toLowerCase();
      const expectedMime = ALLOWED_MIME_TYPES[ext];
      const safeFileType = expectedMime || "application/octet-stream";

      // Upload buffer to Cloudinary (after validating project exists)
      const cdnResult = await uploadToCloudinary(req.file.buffer, req.file.originalname);
      cloudinaryPublicId = cdnResult.public_id;

      if (!project.documents) project.documents = [];
      project.documents.push({
        stage,
        fileName: req.file.originalname,
        fileType: safeFileType,
        fileSize: req.file.size,
        fileUrl: cdnResult.secure_url,
        cloudinaryPublicId: cdnResult.public_id,
        uploadedDate: new Date(),
      } as any);

      try {
        await project.save();
      } catch (saveError) {
        try { await cloudinary.uploader.destroy(cloudinaryPublicId!); } catch (_) {}
        throw saveError;
      }

      const addedDoc = project.documents[project.documents.length - 1] as any;

      // Log activity: document uploaded
      try {
        const { logActivity } = await import("../middleware/activityLogger");
        await logActivity({
          userId: undefined,
          userName: project.projectName,
          userRole: undefined,
          performedBy: req.user?.id,
          performedByName: req.user?.email || "Unknown",
          performedByRole: req.user?.role,
          targetId: project._id.toString(),
          actionType: "Create",
          moduleName: "Projects",
          description: `Uploaded document "${req.file.originalname}" (stage: ${stage}) for project ${project.projectName}`,
          ipAddress: req.ip,
          deviceInfo: req.headers["user-agent"] as string,
          status: "Success",
        });
      } catch (logErr) {
        console.error("Failed to log document upload activity:", logErr);
      }

      res.status(201).json({
        id: addedDoc._id?.toString(),
        stage: addedDoc.stage,
        fileName: addedDoc.fileName,
        fileType: addedDoc.fileType,
        fileSize: addedDoc.fileSize,
        fileUrl: addedDoc.fileUrl,
        uploadedDate: formatDate(addedDoc.uploadedDate),
      });
    } catch (error) {
      if (cloudinaryPublicId) {
        try { await cloudinary.uploader.destroy(cloudinaryPublicId); } catch (_) {}
      }
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });
});

// Delete a document from a project
router.delete("/:id/documents/:docId", authenticate, checkAnyPermission([PERMISSIONS.DOCUMENT_DELETE, PERMISSIONS.PROJECTS_EDIT, PERMISSIONS.PROJECTS_DELETE]), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!project.documents) return res.status(404).json({ error: "Document not found" });

    const docId = req.params.docId;
    const docIndex = project.documents.findIndex(
      (doc: any) => doc._id?.toString() === docId || doc._id?.toHexString?.() === docId
    );
    if (docIndex === -1) return res.status(404).json({ error: "Document not found" });

    const doc = project.documents[docIndex] as any;
    const deletedFileName = doc.fileName;

    project.documents.splice(docIndex, 1);
    await project.save();

    // Delete the file from Cloudinary after successful DB save
    if (doc.cloudinaryPublicId) {
      try { await cloudinary.uploader.destroy(doc.cloudinaryPublicId); } catch (cdnErr) {
        console.error("Warning: Could not delete file from Cloudinary:", cdnErr);
      }
    }

    // Log activity: document deleted
    try {
      const { logActivity } = await import("../middleware/activityLogger");
      await logActivity({
        userId: undefined,
        userName: project.projectName,
        userRole: undefined,
        performedBy: req.user?.id,
        performedByName: req.user?.email || "Unknown",
        performedByRole: req.user?.role,
        targetId: project._id.toString(),
        actionType: "Delete",
        moduleName: "Projects",
        description: `Deleted document "${deletedFileName}" from project ${project.projectName}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (logErr) {
      console.error("Failed to log document delete activity:", logErr);
    }

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// Download a document file
router.get("/:id/documents/:docId/download", authenticate, checkAnyPermission(PROJECT_READ_PERMISSIONS), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const docId = req.params.docId;
    const doc = project.documents?.find(
      (d: any) => d._id?.toString() === docId || d._id?.toHexString?.() === docId
    ) as any;
    if (!doc) {
      const availableIds = project.documents?.map((d: any) => d._id?.toString()) ?? [];
      console.error(`[doc/download] Document not found: ${docId} in project ${req.params.id}. Available doc IDs: [${availableIds.join(", ")}]`);
      return res.status(404).json({ error: "Document not found" });
    }

    if (!doc.fileUrl) {
      return res.status(404).json({ error: "File not found" });
    }

    // For Cloudinary-stored files, generate a signed HTTPS download URL
    // For legacy disk-stored files (fileUrl is just a filename), fall back gracefully
    if (doc.fileUrl.startsWith("http")) {
      const imageExts = [".jpg", ".jpeg", ".png"];
      const ext = path.extname(doc.fileName || "").toLowerCase();
      const isImage = imageExts.includes(ext);

      // Cloudinary file: redirect with forced download attachment flag (resource_type must match upload: image vs raw)
      let downloadUrl = doc.cloudinaryPublicId
        ? cloudinary.url(doc.cloudinaryPublicId, {
            flags: "attachment",
            resource_type: isImage ? "image" : "raw",
            sign_url: true,
            secure: true, // always use HTTPS to avoid mixed content in browser
          })
        : doc.fileUrl;

      // Safety: if we ever stored a non-secure Cloudinary URL, normalize it to HTTPS
      if (downloadUrl.startsWith("http://")) {
        downloadUrl = downloadUrl.replace(/^http:\/\//i, "https://");
      }

      return res.redirect(downloadUrl);
    }

    // Legacy: local disk file (fallback for old uploads before Cloudinary migration)
    const filePath = path.join(__dirname, "../../uploads", doc.fileUrl);
    if (!fs.existsSync(filePath)) {
      console.error(`[doc/download] File not on disk: ${filePath}`);
      return res.status(404).json({ error: "File not found on server" });
    }
    res.download(filePath, doc.fileName);
  } catch (error) {
    console.error("Error downloading document:", error);
    res.status(500).json({ error: "Failed to download document" });
  }
});

// View (inline preview) a document file
router.get("/:id/documents/:docId/view", authenticate, checkAnyPermission(PROJECT_READ_PERMISSIONS), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }
    const project = await Project.findById(req.params.id);
    if (!project) {
      console.error(`[doc/view] Project not found: ${req.params.id}`);
      return res.status(404).json({ error: "Project not found" });
    }

    const docId = req.params.docId;
    const doc = project.documents?.find(
      (d: any) => d._id?.toString() === docId || d._id?.toHexString?.() === docId
    ) as any;
    if (!doc) {
      const availableIds = project.documents?.map((d: any) => d._id?.toString()) ?? [];
      console.error(`[doc/view] Document not found: ${docId} in project ${req.params.id}. Available doc IDs: [${availableIds.join(", ")}]`);
      return res.status(404).json({ error: "Document not found" });
    }

    if (!doc.fileUrl) {
      return res.status(404).json({ error: "File not found" });
    }

    // Cloudinary file: proxy the bytes through backend so frontend fetch()
    // gets a same-origin response it can render in the viewer.
    if (doc.fileUrl.startsWith("http")) {
      const ext = path.extname(doc.fileName || "").toLowerCase();
      const imageExts = [".jpg", ".jpeg", ".png"];
      const isImage = imageExts.includes(ext);

      const targetUrl = doc.cloudinaryPublicId
        ? cloudinary.url(doc.cloudinaryPublicId, {
            resource_type: isImage ? "image" : "raw",
          })
        : doc.fileUrl;

      try {
        const urlObj = new URL(targetUrl);
        const client = urlObj.protocol === "https:" ? https : http;

        client
          .get(urlObj, (upstream) => {
            const statusCode = upstream.statusCode ?? 500;
            if (statusCode >= 400) {
              console.error(`[doc/view] Upstream Cloudinary error: ${statusCode} for ${targetUrl}`);
              if (!res.headersSent) {
                res
                  .status(502)
                  .json({ error: "Failed to load document from storage" });
              }
              upstream.resume();
              return;
            }

            const contentType =
              (doc.fileType && doc.fileType !== "application/octet-stream")
                ? doc.fileType
                : upstream.headers["content-type"] ||
                  (isImage ? "image/*" : "application/pdf");

            res.setHeader("Content-Type", contentType);
            res.setHeader(
              "Content-Disposition",
              `inline; filename="${encodeURIComponent(doc.fileName)}"`
            );
            res.setHeader("Cache-Control", "private, max-age=3600");

            upstream.pipe(res);
          })
          .on("error", (err) => {
            console.error("[doc/view] Error streaming from Cloudinary:", err);
            if (!res.headersSent) {
              res
                .status(502)
                .json({ error: "Failed to load document from storage" });
            }
          });
      } catch (err) {
        console.error("[doc/view] Invalid Cloudinary URL:", err);
        return res
          .status(500)
          .json({ error: "Failed to prepare document for viewing" });
      }

      return;
    }

    // Legacy: local disk file (fallback for old uploads before Cloudinary migration)
    const filePath = path.join(__dirname, "../../uploads", doc.fileUrl);
    if (!fs.existsSync(filePath)) {
      console.error(`[doc/view] File not on disk: ${filePath}`);
      return res.status(404).json({ error: "File not found on server" });
    }

    const ext = path.extname(doc.fileName).toLowerCase();
    const mimeType = ALLOWED_MIME_TYPES[ext] || "application/octet-stream";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Error viewing document:", error);
    res.status(500).json({ error: "Failed to view document" });
  }
});

// Get single project by ID — must be registered AFTER all /:id/sub-routes to avoid swallowing them
router.get("/:id", authenticate, checkAnyPermission(PROJECT_READ_PERMISSIONS), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    // Convert MongoDB _id to id and format all fields for frontend compatibility
    const projectObj = project.toObject({ versionKey: false });
    res.json({
      ...projectObj,
      id: projectObj._id.toString(),
      _id: undefined,
      __v: undefined,
      startDate: formatDate(project.startDate),
      expectedCompletion: formatDate(project.expectedCompletion),
      orderDate: formatDate(project.orderDate),
      expectedCompletionDate: formatDate(project.expectedCompletionDate),
      materialDispatchDate: formatDate(project.materialDispatchDate),
      materialReceivedDate: formatDate(project.materialReceivedDate),
      assignedDate: formatDate(project.assignedDate),
      installationCompletionDate: formatDate(project.installationCompletionDate),
      handoverDate: formatDate(project.handoverDate),
      warrantyStartDate: formatDate(project.warrantyStartDate),
      warrantyEndDate: formatDate(project.warrantyEndDate),
      issues: (projectObj.issues || []).map((issue: any) => ({
        ...issue,
        id: issue._id?.toString(),
        _id: undefined,
        raisedDate: formatDate(issue.raisedDate),
        expectedResolutionDate: formatDate(issue.expectedResolutionDate),
      })),
      documents: (projectObj.documents || []).map((doc: any) => ({
        ...doc,
        id: doc._id?.toString(),
        _id: undefined,
        uploadedDate: formatDate(doc.uploadedDate),
      })),
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

router.delete("/:id", authenticate, checkPermission(PERMISSIONS.PROJECTS_DELETE), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    // Log activity: project deleted
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performerId: string | undefined = undefined;
      let performerName = "Unknown";
      let performerRole: string | undefined = undefined;
      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        performerId = parts[1];
        const performer = await (await import("../models/User")).default.findById(performerId).select("name role");
        if (performer) {
          performerName = performer.name;
          performerRole = performer.role;
        }
      }
      const { logActivity } = await import("../middleware/activityLogger");
      await logActivity({
        userId: undefined,
        userName: project.projectName,
        userRole: undefined,
        performedBy: performerId,
        performedByName: performerName,
        performedByRole: performerRole,
        targetId: project._id.toString(),
        actionType: "Delete",
        moduleName: "Projects",
        description: `Deleted project ${project.projectName}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log project delete activity:", err);
    }

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;






















