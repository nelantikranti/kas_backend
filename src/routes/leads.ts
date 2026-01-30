import express from "express";
import mongoose from "mongoose";
import Lead from "../models/Lead";
import Project from "../models/Project";
import Quotation from "../models/Quotation";

const router = express.Router();

// Function to drop the problematic id_1 index
const dropIdIndex = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      const collection = mongoose.connection.collection('leads');
      const indexes = await collection.indexes();
      
      // Find any index on the 'id' field (not _id)
      const idIndexes = indexes.filter((idx: any) => {
        // Check if index is on 'id' field (not '_id')
        if (idx.key && idx.key.id !== undefined && !idx.key._id) {
          return true;
        }
        // Check by name patterns
        if (idx.name === 'id_1' || (idx.name && idx.name.includes('id') && !idx.name.includes('_id'))) {
          return true;
        }
        return false;
      });
      
      // Drop all id indexes found
      for (const idIndex of idIndexes) {
        try {
          if (idIndex.name) {
            await collection.dropIndex(idIndex.name);
            console.log(`✅ Dropped problematic index '${idIndex.name}' from leads collection`);
          }
        } catch (dropError: any) {
          if (dropError.code !== 27) { // 27 = IndexNotFound
            console.warn(`⚠️  Could not drop index '${idIndex.name || 'unknown'}':`, dropError.message);
          }
        }
      }
      
      return idIndexes.length > 0;
    }
  } catch (error: any) {
    // Ignore errors if collection doesn't exist yet
    if (error.code !== 26) { // 26 = NamespaceNotFound
      console.warn('⚠️  Could not check/drop id index:', error.message);
    }
  }
  return false;
};

// Drop the index when this module loads (if connected)
if (mongoose.connection.readyState === 1) {
  dropIdIndex();
}

// Also try when connection is established
mongoose.connection.on('connected', () => {
  dropIdIndex();
});

// GET all leads
router.get("/", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const leads = await Lead.find().sort({ createdAt: -1 });
    // Convert MongoDB _id to id for frontend compatibility
    const formattedLeads = leads.map(lead => ({
      id: lead._id.toString(),
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      stage: lead.stage,
      value: lead.value,
      assignedTo: lead.assignedTo,
      createdAt: lead.createdAt.toISOString().split("T")[0],
      lastContact: lead.lastContact.toISOString().split("T")[0],
      notes: lead.notes,
    }));
    res.json(formattedLeads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// GET lead by ID
router.get("/:id", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    // Convert MongoDB _id to id for frontend compatibility
    res.json({
      id: lead._id.toString(),
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      stage: lead.stage,
      value: lead.value,
      assignedTo: lead.assignedTo,
      createdAt: lead.createdAt.toISOString().split("T")[0],
      lastContact: lead.lastContact.toISOString().split("T")[0],
      notes: lead.notes,
    });
  } catch (error) {
    console.error("Error fetching lead:", error);
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// POST create new lead
router.post("/", async (req, res) => {
  // Extract and prepare lead data outside try block for retry logic
  const rawStage = (req.body.stage || "").toString().trim();
  const stageMapping: { [key: string]: string } = {
    "New Lead": "New Lead",
    "Lead Contacted": "Lead Contacted",
    "Meeting Scheduled": "Meeting Scheduled",
    "Meeting Completed": "Meeting Completed",
    "Quotation Sent": "Quotation Sent",
    "Manager Deliberation": "Manager Deliberation",
    "Order Closed": "Order Closed",
    "Order Lost": "Order Lost",
    // Legacy mappings for backward compatibility
    "new lead": "New Lead",
    "lead contacted": "Lead Contacted",
    "new": "New Lead",
    "contacted": "Lead Contacted",
    "follow-up": "Meeting Scheduled",
    "quotation sent": "Quotation Sent",
    "negotiation": "Manager Deliberation",
    "won": "Order Closed",
    "lost": "Order Lost",
  };

  // Get mapped stage, try exact match first, then lowercase, then default
  let mappedStage = stageMapping[rawStage];
  if (!mappedStage && rawStage) {
    mappedStage = stageMapping[rawStage.toLowerCase()];
  }
  if (!mappedStage) {
    mappedStage = "New Lead"; // Default to "New Lead"
  }

  // Remove id and _id from request body to prevent conflicts with MongoDB's _id
  const { id, _id, ...leadData } = req.body;

  // Helper function to create and save a lead
  const createLead = async () => {
    const lead = new Lead({
      name: leadData.name,
      company: leadData.company || "",
      email: leadData.email,
      phone: leadData.phone,
      source: leadData.source || "Website",
      stage: mappedStage as any,
      value: leadData.value || 0,
      assignedTo: leadData.assignedTo,
      notes: leadData.notes || "",
      lastContact: leadData.lastContact ? new Date(leadData.lastContact) : new Date(),
    });
    
    // Validate before saving
    const validationError = lead.validateSync();
    if (validationError) {
      const errorMessages = Object.values(validationError.errors || {}).map((err: any) => err.message).join(", ");
      throw { name: 'ValidationError', errors: validationError.errors, message: errorMessages || validationError.message };
    }
    
    return await lead.save();
  };

  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    // Proactively try to drop the problematic index before creating the lead
    await dropIdIndex();

    console.log("Stage mapping:", { rawStage, mappedStage });
    
    const savedLead = await createLead();
    
    console.log("✅ Lead saved to database:", {
      id: savedLead._id,
      name: savedLead.name,
      email: savedLead.email,
    });

    // Convert MongoDB _id to id for frontend compatibility
    return res.status(201).json({
      id: savedLead._id.toString(),
      name: savedLead.name,
      company: savedLead.company,
      email: savedLead.email,
      phone: savedLead.phone,
      source: savedLead.source,
      stage: savedLead.stage,
      value: savedLead.value,
      assignedTo: savedLead.assignedTo,
      createdAt: savedLead.createdAt.toISOString().split("T")[0],
      lastContact: savedLead.lastContact.toISOString().split("T")[0],
      notes: savedLead.notes,
    });
  } catch (error: any) {
    console.error("Error creating lead:", error);
    
    // Handle MongoDB validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message);
      return res.status(400).json({ 
        error: "Validation failed",
        details: validationErrors.join(", ")
      });
    }
    
    // Handle MongoDB duplicate key errors - specifically for id field
    if (error.code === 11000 || (error.name === 'MongoServerError' && error.code === 11000)) {
      const keyPattern = error.keyPattern || {};
      
      // If the error is about the 'id' field, try to drop the index and retry
      if (keyPattern.id !== undefined) {
        console.log('⚠️  Duplicate key error on id field - attempting to drop index and retry...');
        
        try {
          const dropped = await dropIdIndex();
          
          if (dropped) {
            // Retry saving the lead after dropping the index
            try {
              const savedLead = await createLead();
              
              console.log("✅ Lead saved to database after index cleanup:", {
                id: savedLead._id,
                name: savedLead.name,
                email: savedLead.email,
              });

              return res.status(201).json({
                id: savedLead._id.toString(),
                name: savedLead.name,
                company: savedLead.company,
                email: savedLead.email,
                phone: savedLead.phone,
                source: savedLead.source,
                stage: savedLead.stage,
                value: savedLead.value,
                assignedTo: savedLead.assignedTo,
                createdAt: savedLead.createdAt.toISOString().split("T")[0],
                lastContact: savedLead.lastContact.toISOString().split("T")[0],
                notes: savedLead.notes,
              });
            } catch (retryError: any) {
              console.error("Error retrying lead creation:", retryError);
              return res.status(400).json({ 
                error: "Failed to create lead after fixing index",
                details: retryError.message
              });
            }
          }
        } catch (dropError: any) {
          console.error("Error dropping index:", dropError);
        }
      }
      
      const keyValue = error.keyValue || {};
      return res.status(400).json({ 
        error: "Duplicate key error",
        details: `A lead with this ${Object.keys(keyPattern).join(', ')} already exists. ${keyPattern.id ? 'Note: The id field should not be provided when creating a new lead.' : ''}`
      });
    }
    
    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return res.status(503).json({ 
        error: "Database connection error. Please try again later." 
      });
    }
    
    // Return more detailed error message
    const errorMessage = error.message || "Failed to create lead";
    return res.status(400).json({ 
      error: errorMessage,
      details: error.toString()
    });
  }
});

// PUT update lead
router.put("/:id", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    // Get the lead first to check previous stage
    const existingLead = await Lead.findById(req.params.id);
    if (!existingLead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const previousStage = existingLead.stage;
    const newStage = req.body.stage;

    // Convert date strings to Date objects if present
    const updateData = { ...req.body };
    if (updateData.lastContact) {
      updateData.lastContact = new Date(updateData.lastContact);
    }

    // Remove _id if present (MongoDB doesn't allow updating _id)
    delete updateData._id;
    
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // If stage changed to "Order Closed", automatically create a project
    if (previousStage !== "Order Closed" && newStage === "Order Closed") {
      try {
        console.log(`🔄 Lead "${lead.name}" changed to "Order Closed". Creating project...`);
        
        // Find quotation for this lead to get technical details
        const quotation = await Quotation.findOne({ 
          leadId: lead._id.toString() 
        }).sort({ createdAt: -1 }); // Get most recent quotation

        // Check if project already exists for this lead (by customer name or quotationId)
        const existingProject = await Project.findOne({ 
          $or: [
            { customerName: lead.name },
            { quotationId: quotation?._id?.toString() || lead._id.toString() }
          ]
        });

        if (existingProject) {
          console.log(`ℹ️  Project already exists for lead "${lead.name}". Skipping creation.`);
        } else {

          // Prepare project data from lead
          const now = new Date();
          const startDate = now;
          const expectedCompletion = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days from now

          const projectData: any = {
            projectName: `${lead.company || lead.name} - Elevator Installation`,
            customerName: lead.name,
            location: lead.company || "To be confirmed",
            elevatorType: quotation?.elevatorType || "Passenger Elevator",
            quotationId: quotation?._id?.toString() || lead._id.toString(), // Use quotation ID or lead ID
            assignedEngineer: lead.assignedTo || "To be assigned",
            startDate: startDate,
            expectedCompletion: expectedCompletion,
            status: "On Track" as const,
            currentStage: "First Technical Visit" as const,
            // Additional fields from quotation if available
            salesPersonName: lead.assignedTo,
            orderDate: now,
            projectStatus: "Planning",
          };

          // Add quotation details if available
          if (quotation) {
            projectData.liftType = quotation.elevatorType;
            projectData.numberOfLifts = 1; // Default, can be updated later
            projectData.capacity = `${quotation.capacity} kg`;
            projectData.numberOfStops = quotation.floors;
            projectData.speed = `${quotation.speed} m/s`;
            projectData.orderValue = quotation.totalAmount;
            projectData.paymentStatus = "Pending";
          }

          // Remove id fields to avoid duplicate key errors
          delete projectData.id;
          delete projectData._id;

          const { id, _id, ...cleanProjectData } = projectData;
          const project = new Project(cleanProjectData);
          
          const savedProject = await project.save();
          
          console.log(`✅ Project created successfully from lead "${lead.name}":`, {
            projectId: savedProject._id,
            projectName: savedProject.projectName,
            customerName: savedProject.customerName,
          });
        }
      } catch (projectError: any) {
        // Log error but don't fail the lead update
        console.error("⚠️  Failed to create project from lead:", projectError.message);
        console.error("Lead update succeeded, but project creation failed. You can create project manually.");
      }
    }
    
    // Convert MongoDB _id to id for frontend compatibility
    res.json({
      id: lead._id.toString(),
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      stage: lead.stage,
      value: lead.value,
      assignedTo: lead.assignedTo,
      createdAt: lead.createdAt.toISOString().split("T")[0],
      lastContact: lead.lastContact.toISOString().split("T")[0],
      notes: lead.notes,
    });
  } catch (error: any) {
    console.error("Error updating lead:", error);
    
    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({ 
        error: "Validation error", 
        details: error.message 
      });
    }
    
    // Handle cast errors (invalid ID format)
    if (error.name === "CastError") {
      return res.status(400).json({ 
        error: "Invalid lead ID format" 
      });
    }
    
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// DELETE lead
router.delete("/:id", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    res.json({ message: "Lead deleted successfully" });
  } catch (error) {
    console.error("Error deleting lead:", error);
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

export default router;






















