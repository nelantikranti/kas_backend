import express, { Request, Response } from "express";
import Notification from "../models/Notification";
import Contact from "../models/Contact";
import Demo from "../models/Demo";

const router = express.Router();

// Get all notifications for a user (or all users if admin)
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    
    // Build query: get user-specific notifications or global notifications (userId = null)
    const query: any = {
      $or: [
        { userId: null }, // Global notifications
        ...(userId ? [{ userId }] : []), // User-specific notifications
      ],
    };

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 notifications

    // Filter notifications where related entities don't exist
    const validNotifications = [];
    for (const notif of notifications) {
      // If notification has a relatedId, check if the related entity exists
      if (notif.relatedId) {
        if (notif.type === "contact") {
          const contact = await Contact.findById(notif.relatedId);
          if (!contact) {
            // Related contact doesn't exist, skip this notification
            continue;
          }
        } else if (notif.type === "demo") {
          const demo = await Demo.findById(notif.relatedId);
          if (!demo) {
            // Related demo doesn't exist, skip this notification
            continue;
          }
        } else if (notif.type === "signup") {
          const User = (await import("../models/User")).default;
          const user = await User.findById(notif.relatedId);
          if (!user || user.status !== "Pending") {
            // Related user doesn't exist or is no longer pending, skip this notification
            continue;
          }
        }
        // For other types (quotation, project, amc, lead), we can add checks later if needed
      }
      
      // Transform _id to id for frontend compatibility
      validNotifications.push({
        id: notif._id.toString(),
        userId: notif.userId,
        message: notif.message,
        type: notif.type,
        relatedId: notif.relatedId,
        read: notif.read,
        createdAt: notif.createdAt,
        updatedAt: notif.updatedAt,
      });
    }

    res.json(validNotifications);
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Get unread count
router.get("/unread", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    
    const query: any = {
      read: false,
      $or: [
        { userId: null },
        ...(userId ? [{ userId }] : []),
      ],
    };

    const notifications = await Notification.find(query);
    
    // Filter notifications where related entities don't exist
    let validCount = 0;
    for (const notif of notifications) {
      // If notification has a relatedId, check if the related entity exists
      if (notif.relatedId) {
        if (notif.type === "contact") {
          const contact = await Contact.findById(notif.relatedId);
          if (!contact) continue;
        } else if (notif.type === "demo") {
          const demo = await Demo.findById(notif.relatedId);
          if (!demo) continue;
        } else if (notif.type === "signup") {
          const User = (await import("../models/User")).default;
          const user = await User.findById(notif.relatedId);
          if (!user || user.status !== "Pending") continue;
        }
      }
      validCount++;
    }

    res.json({ count: validCount });
  } catch (error) {
    console.error("Failed to get unread count:", error);
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

// Mark notification as read
router.patch("/:id/read", async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Transform _id to id for frontend compatibility
    res.json({
      id: notification._id.toString(),
      userId: notification.userId,
      message: notification.message,
      type: notification.type,
      relatedId: notification.relatedId,
      read: notification.read,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    });
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Mark all notifications as read
router.patch("/read-all", async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId as string | undefined;
    
    const query: any = {
      read: false,
      $or: [
        { userId: null },
        ...(userId ? [{ userId }] : []),
      ],
    };

    await Notification.updateMany(query, { read: true });
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

// Create a notification (for system use)
router.post("/", async (req: Request, res: Response) => {
  try {
    const { userId, message, type, relatedId } = req.body;

    const notification = new Notification({
      userId: userId || null,
      message,
      type: type || "system",
      relatedId: relatedId || null,
      read: false,
    });

    await notification.save();
    
    // Transform _id to id for frontend compatibility
    res.status(201).json({
      id: notification._id.toString(),
      userId: notification.userId,
      message: notification.message,
      type: notification.type,
      relatedId: notification.relatedId,
      read: notification.read,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// Delete notification
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Failed to delete notification:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

export default router;

