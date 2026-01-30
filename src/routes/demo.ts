import express from "express";
import mongoose from "mongoose";
import Demo from "../models/Demo";
import Notification from "../models/Notification";

const router = express.Router();

// POST create demo request
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, company, elevatorType, message } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: "Name, email, and phone are required" });
    }

    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.error("MongoDB is not connected. ReadyState:", mongoose.connection.readyState);
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const demoRequest = new Demo({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      company: company ? company.trim() : "",
      elevatorType: elevatorType || "",
      message: message ? message.trim() : "",
      status: "Pending",
    });

    // Save to MongoDB database
    const savedDemo = await demoRequest.save();
    
    console.log("✅ Demo request saved to database:", {
      id: savedDemo._id,
      name: savedDemo.name,
      email: savedDemo.email,
      phone: savedDemo.phone,
    });

    // Create notification for all admins (userId = null means all users)
    try {
      const notification = new Notification({
        userId: null, // Global notification for all users
        message: `New demo request received from ${savedDemo.name}`,
        type: "demo",
        relatedId: savedDemo._id.toString(),
        read: false,
      });
      await notification.save();
    } catch (notifError) {
      console.error("Failed to create notification:", notifError);
      // Don't fail the request if notification creation fails
    }

    res.status(201).json({ 
      message: "Demo request submitted successfully",
      id: savedDemo._id.toString(),
      success: true
    });
  } catch (error: any) {
    console.error("Error creating demo request:", error);
    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return res.status(503).json({ 
        error: "Database connection error. Please try again later." 
      });
    }
    res.status(400).json({ error: "Failed to create demo request" });
  }
});

// GET all demo requests (admin only - should be protected)
router.get("/", async (req, res) => {
  try {
    const demos = await Demo.find().sort({ createdAt: -1 });
    // Convert MongoDB _id to id for frontend compatibility
    const formattedDemos = demos.map(demo => ({
      id: demo._id.toString(),
      name: demo.name,
      email: demo.email,
      phone: demo.phone,
      company: demo.company || "",
      message: demo.message || "",
      status: demo.status,
      createdAt: demo.createdAt,
      updatedAt: demo.updatedAt,
    }));
    res.json(formattedDemos);
  } catch (error) {
    console.error("Error fetching demo requests:", error);
    res.status(500).json({ error: "Failed to fetch demo requests" });
  }
});

// GET demo request by ID
router.get("/:id", async (req, res) => {
  try {
    const demo = await Demo.findById(req.params.id);
    if (!demo) {
      return res.status(404).json({ error: "Demo request not found" });
    }
    // Convert MongoDB _id to id for frontend compatibility
    res.json({
      id: demo._id.toString(),
      name: demo.name,
      email: demo.email,
      phone: demo.phone,
      company: demo.company || "",
      message: demo.message || "",
      status: demo.status,
      createdAt: demo.createdAt,
      updatedAt: demo.updatedAt,
    });
  } catch (error) {
    console.error("Error fetching demo request:", error);
    res.status(500).json({ error: "Failed to fetch demo request" });
  }
});

// PUT update demo request status
router.put("/:id", async (req, res) => {
  try {
    const demo = await Demo.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!demo) {
      return res.status(404).json({ error: "Demo request not found" });
    }
    // Convert MongoDB _id to id for frontend compatibility
    res.json({
      id: demo._id.toString(),
      name: demo.name,
      email: demo.email,
      phone: demo.phone,
      company: demo.company || "",
      message: demo.message || "",
      status: demo.status,
      createdAt: demo.createdAt,
      updatedAt: demo.updatedAt,
    });
  } catch (error) {
    console.error("Error updating demo request:", error);
    res.status(400).json({ error: "Failed to update demo request" });
  }
});

// DELETE demo request
router.delete("/:id", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const demoId = req.params.id;
    const demo = await Demo.findByIdAndDelete(demoId);
    
    if (!demo) {
      return res.status(404).json({ error: "Demo request not found" });
    }

    // Delete related notifications
    try {
      await Notification.deleteMany({
        type: "demo",
        relatedId: demoId,
      });
    } catch (notifError) {
      console.error("Failed to delete related notifications:", notifError);
      // Continue even if notification deletion fails
    }

    res.json({ message: "Demo request deleted successfully" });
  } catch (error) {
    console.error("Error deleting demo request:", error);
    res.status(500).json({ error: "Failed to delete demo request" });
  }
});

export default router;





