import express from "express";
import { authenticateAdmin } from "../middleware/auth";
import Contact from "../models/Contact";
import Demo from "../models/Demo";

const router = express.Router();

// All admin routes require authentication
router.use(authenticateAdmin);

// GET all form submissions (contacts and demos)
router.get("/submissions", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    const demos = await Demo.find().sort({ createdAt: -1 });

    res.json({
      contacts,
      demos,
      totalContacts: contacts.length,
      totalDemos: demos.length,
    });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// GET all contact submissions
router.get("/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json(contacts);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// GET all demo submissions
router.get("/demos", async (req, res) => {
  try {
    const demos = await Demo.find().sort({ createdAt: -1 });
    res.json(demos);
  } catch (error) {
    console.error("Error fetching demos:", error);
    res.status(500).json({ error: "Failed to fetch demos" });
  }
});

// GET statistics
router.get("/stats", async (req, res) => {
  try {
    const totalContacts = await Contact.countDocuments();
    const newContacts = await Contact.countDocuments({ status: "New" });
    const readContacts = await Contact.countDocuments({ status: "Read" });
    const repliedContacts = await Contact.countDocuments({ status: "Replied" });
    const totalDemos = await Demo.countDocuments();
    const pendingDemos = await Demo.countDocuments({ status: "Pending" });
    const contactedDemos = await Demo.countDocuments({ status: "Contacted" });

    res.json({
      contacts: {
        total: totalContacts,
        new: newContacts,
        read: readContacts,
        replied: repliedContacts,
        contacted: repliedContacts, // For backward compatibility
      },
      demos: {
        total: totalDemos,
        pending: pendingDemos,
        contacted: contactedDemos,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

export default router;

















