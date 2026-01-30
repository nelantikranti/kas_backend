import express from "express";
import mongoose from "mongoose";
import Contact from "../models/Contact";
import Notification from "../models/Notification";

const router = express.Router();

// POST create contact message
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !phone || !subject || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.error("MongoDB is not connected. ReadyState:", mongoose.connection.readyState);
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const contactMessage = new Contact({
      name,
      email,
      phone,
      subject,
      message,
      status: "New",
    });

    await contactMessage.save();
    
    // Create notification for all admins (userId = null means all users)
    try {
      const notification = new Notification({
        userId: null, // Global notification for all users
        message: `New contact form submission from ${contactMessage.name}`,
        type: "contact",
        relatedId: contactMessage._id.toString(),
        read: false,
      });
      await notification.save();
    } catch (notifError) {
      console.error("Failed to create notification:", notifError);
      // Don't fail the request if notification creation fails
    }
    
    res.status(201).json({ 
      message: "Contact message submitted successfully",
      id: contactMessage._id 
    });
  } catch (error: any) {
    console.error("Error creating contact message:", error);
    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return res.status(503).json({ 
        error: "Database connection error. Please try again later." 
      });
    }
    res.status(400).json({ error: "Failed to submit contact message" });
  }
});

// GET all contact messages (admin only - should be protected)
router.get("/", async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    console.error("Error fetching contact messages:", error);
    res.status(500).json({ error: "Failed to fetch contact messages" });
  }
});

// GET contact message by ID
router.get("/:id", async (req, res) => {
  try {
    const message = await Contact.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: "Contact message not found" });
    }
    res.json(message);
  } catch (error) {
    console.error("Error fetching contact message:", error);
    res.status(500).json({ error: "Failed to fetch contact message" });
  }
});

// PUT update contact message status
router.put("/:id", async (req, res) => {
  try {
    const message = await Contact.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!message) {
      return res.status(404).json({ error: "Contact message not found" });
    }
    res.json(message);
  } catch (error) {
    console.error("Error updating contact message:", error);
    res.status(400).json({ error: "Failed to update contact message" });
  }
});

// DELETE contact message
router.delete("/:id", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const contactId = req.params.id;
    const contact = await Contact.findByIdAndDelete(contactId);
    
    if (!contact) {
      return res.status(404).json({ error: "Contact message not found" });
    }

      // Delete related notifications
      try {
        await Notification.deleteMany({
          type: "contact",
          relatedId: contactId,
        });
      } catch (notifError) {
        console.error("Failed to delete related notifications:", notifError);
        // Continue even if notification deletion fails
      }

    res.json({ message: "Contact message deleted successfully" });
  } catch (error) {
    console.error("Error deleting contact message:", error);
    res.status(500).json({ error: "Failed to delete contact message" });
  }
});

export default router;
