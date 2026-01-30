import express from "express";
import mongoose from "mongoose";
import Lead from "../models/Lead";
import Project from "../models/Project";
import AMCContract from "../models/AMC";
import Quotation from "../models/Quotation";

const router = express.Router();

router.get("/stats", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const leads = await Lead.find();
    const projects = await Project.find();
    const amcContracts = await AMCContract.find();
    const quotations = await Quotation.find();

    const totalLeads = leads.length;
    const activeProjects = projects.filter(p => p.status === "On Track").length;
    const amcCount = amcContracts.filter(a => a.status === "Active").length;
    
    // Calculate revenue from won leads and approved quotations
    const wonLeadsValue = leads
      .filter(l => l.stage === "Order Closed")
      .reduce((sum, lead) => sum + lead.value, 0);
    const approvedQuotationsValue = quotations
      .filter(q => q.status === "Approved")
      .reduce((sum, q) => sum + q.totalAmount, 0);
    const totalRevenue = wonLeadsValue + approvedQuotationsValue;

    res.json({
      totalLeads,
      activeProjects,
      amcContracts: amcCount,
      revenue: totalRevenue,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

export default router;






















