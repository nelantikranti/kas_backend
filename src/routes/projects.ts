import express from "express";
import mongoose from "mongoose";
import Project from "../models/Project";

const router = express.Router();

// Helper function to format dates for frontend
const formatDate = (date: Date | undefined) => date ? date.toISOString().split("T")[0] : undefined;

router.get("/", async (req, res) => {
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
      const projectObj = project.toObject();
      return {
        ...projectObj,
        id: project._id.toString(),
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
        issues: project.issues?.map((issue: any) => ({
          ...issue,
          raisedDate: formatDate(issue.raisedDate),
          expectedResolutionDate: formatDate(issue.expectedResolutionDate),
        })),
        documents: project.documents?.map((doc: any) => ({
          ...doc,
          uploadedDate: formatDate(doc.uploadedDate),
        })),
      };
    });
    res.json(formattedProjects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

router.get("/:id", async (req, res) => {
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
    const projectObj = project.toObject();
    res.json({
      ...projectObj,
      id: project._id.toString(),
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
      issues: project.issues?.map((issue: any) => ({
        ...issue,
        raisedDate: formatDate(issue.raisedDate),
        expectedResolutionDate: formatDate(issue.expectedResolutionDate),
      })),
      documents: project.documents?.map((doc: any) => ({
        ...doc,
        uploadedDate: formatDate(doc.uploadedDate),
      })),
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ error: "Failed to fetch project" });
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

router.post("/", async (req, res) => {
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

    // Convert MongoDB _id to id and format dates for frontend compatibility
    res.status(201).json({
      id: savedProject._id.toString(),
      ...savedProject.toObject(),
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
      issues: savedProject.issues?.map((issue: any) => ({
        ...issue,
        raisedDate: formatDate(issue.raisedDate),
        expectedResolutionDate: formatDate(issue.expectedResolutionDate),
      })),
      documents: savedProject.documents?.map((doc: any) => ({
        ...doc,
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

router.put("/:id", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const updateData = convertDates(req.body);

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    // Format dates for frontend compatibility
    res.json({
      id: project._id.toString(),
      ...project.toObject(),
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
      issues: project.issues?.map((issue: any) => ({
        ...issue,
        raisedDate: formatDate(issue.raisedDate),
        expectedResolutionDate: formatDate(issue.expectedResolutionDate),
      })),
      documents: project.documents?.map((doc: any) => ({
        ...doc,
        uploadedDate: formatDate(doc.uploadedDate),
      })),
    });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(400).json({ error: "Failed to update project" });
  }
});

router.delete("/:id", async (req, res) => {
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
    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;






















