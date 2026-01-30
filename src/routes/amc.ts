import express from "express";
import mongoose from "mongoose";
import AMCContract from "../models/AMC";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const contracts = await AMCContract.find().sort({ createdAt: -1 });
    // Convert MongoDB _id to id for frontend compatibility
    const formattedContracts = contracts.map(contract => ({
      id: contract._id.toString(),
      customerName: contract.customerName,
      projectName: contract.projectName,
      elevatorId: contract.elevatorId,
      contractStartDate: contract.contractStartDate.toISOString().split("T")[0],
      contractEndDate: contract.contractEndDate.toISOString().split("T")[0],
      duration: contract.duration,
      nextServiceDate: contract.nextServiceDate.toISOString().split("T")[0],
      serviceFrequency: contract.serviceFrequency,
      assignedTechnician: contract.assignedTechnician,
      status: contract.status,
      totalValue: contract.totalValue,
      servicesCompleted: contract.servicesCompleted,
      servicesPending: contract.servicesPending,
    }));
    res.json(formattedContracts);
  } catch (error) {
    console.error("Error fetching AMC contracts:", error);
    res.status(500).json({ error: "Failed to fetch AMC contracts" });
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

    const contract = await AMCContract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: "AMC contract not found" });
    }
    // Convert MongoDB _id to id for frontend compatibility
    res.json({
      id: contract._id.toString(),
      customerName: contract.customerName,
      projectName: contract.projectName,
      elevatorId: contract.elevatorId,
      contractStartDate: contract.contractStartDate.toISOString().split("T")[0],
      contractEndDate: contract.contractEndDate.toISOString().split("T")[0],
      duration: contract.duration,
      nextServiceDate: contract.nextServiceDate.toISOString().split("T")[0],
      serviceFrequency: contract.serviceFrequency,
      assignedTechnician: contract.assignedTechnician,
      status: contract.status,
      totalValue: contract.totalValue,
      servicesCompleted: contract.servicesCompleted,
      servicesPending: contract.servicesPending,
    });
  } catch (error) {
    console.error("Error fetching AMC contract:", error);
    res.status(500).json({ error: "Failed to fetch AMC contract" });
  }
});

router.post("/", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const contract = new AMCContract({
      ...req.body,
      contractStartDate: req.body.contractStartDate ? new Date(req.body.contractStartDate) : new Date(),
      contractEndDate: req.body.contractEndDate ? new Date(req.body.contractEndDate) : new Date(),
      nextServiceDate: req.body.nextServiceDate ? new Date(req.body.nextServiceDate) : new Date(),
    });
    const savedContract = await contract.save();
    
    console.log("✅ AMC contract saved to database:", {
      id: savedContract._id,
      customerName: savedContract.customerName,
    });

    // Convert MongoDB _id to id for frontend compatibility
    res.status(201).json({
      id: savedContract._id.toString(),
      customerName: savedContract.customerName,
      projectName: savedContract.projectName,
      elevatorId: savedContract.elevatorId,
      contractStartDate: savedContract.contractStartDate.toISOString().split("T")[0],
      contractEndDate: savedContract.contractEndDate.toISOString().split("T")[0],
      duration: savedContract.duration,
      nextServiceDate: savedContract.nextServiceDate.toISOString().split("T")[0],
      serviceFrequency: savedContract.serviceFrequency,
      assignedTechnician: savedContract.assignedTechnician,
      status: savedContract.status,
      totalValue: savedContract.totalValue,
      servicesCompleted: savedContract.servicesCompleted,
      servicesPending: savedContract.servicesPending,
    });
  } catch (error: any) {
    console.error("Error creating AMC contract:", error);
    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return res.status(503).json({ 
        error: "Database connection error. Please try again later." 
      });
    }
    res.status(400).json({ error: "Failed to create AMC contract" });
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

    // Convert date strings to Date objects if present
    const updateData = { ...req.body };
    if (updateData.contractStartDate) {
      updateData.contractStartDate = new Date(updateData.contractStartDate);
    }
    if (updateData.contractEndDate) {
      updateData.contractEndDate = new Date(updateData.contractEndDate);
    }
    if (updateData.nextServiceDate) {
      updateData.nextServiceDate = new Date(updateData.nextServiceDate);
    }

    const contract = await AMCContract.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!contract) {
      return res.status(404).json({ error: "AMC contract not found" });
    }
    
    // Convert MongoDB _id to id for frontend compatibility
    res.json({
      id: contract._id.toString(),
      customerName: contract.customerName,
      projectName: contract.projectName,
      elevatorId: contract.elevatorId,
      contractStartDate: contract.contractStartDate.toISOString().split("T")[0],
      contractEndDate: contract.contractEndDate.toISOString().split("T")[0],
      duration: contract.duration,
      nextServiceDate: contract.nextServiceDate.toISOString().split("T")[0],
      serviceFrequency: contract.serviceFrequency,
      assignedTechnician: contract.assignedTechnician,
      status: contract.status,
      totalValue: contract.totalValue,
      servicesCompleted: contract.servicesCompleted,
      servicesPending: contract.servicesPending,
    });
  } catch (error) {
    console.error("Error updating AMC contract:", error);
    res.status(400).json({ error: "Failed to update AMC contract" });
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

    const contract = await AMCContract.findByIdAndDelete(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: "AMC contract not found" });
    }
    res.json({ message: "AMC contract deleted successfully" });
  } catch (error) {
    console.error("Error deleting AMC contract:", error);
    res.status(500).json({ error: "Failed to delete AMC contract" });
  }
});

export default router;






















