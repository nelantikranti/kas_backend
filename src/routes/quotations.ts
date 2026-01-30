import express from "express";
import mongoose from "mongoose";
import Quotation from "../models/Quotation";
import { generateQuotationPDF } from "../utils/pdfGenerator";
import Notification from "../models/Notification";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const quotations = await Quotation.find().sort({ createdAt: -1 });
    // Convert MongoDB _id to id for frontend compatibility
    const formattedQuotations = quotations.map(quotation => ({
      id: quotation._id.toString(),
      leadId: quotation.leadId,
      leadName: quotation.leadName,
      projectAddress: quotation.projectAddress || "",
      contactNumber: quotation.contactNumber || "",
      elevatorType: quotation.elevatorType,
      modelNumber: quotation.modelNumber || "KAS-GX630",
      floors: quotation.floors,
      capacity: quotation.capacity,
      speed: quotation.speed,
      shaftType: quotation.shaftType || "G S",
      application: quotation.application || "Outdoor",
      cabinType: quotation.cabinType || "Standard",
      doorType: quotation.doorType || "Automatic Door",
      features: quotation.features,
      standardRates: quotation.standardRates,
      signatureRates: quotation.signatureRates,
      standardTotal: quotation.standardTotal,
      standardGST: quotation.standardGST,
      standardNet: quotation.standardNet,
      signatureTotal: quotation.signatureTotal,
      signatureGST: quotation.signatureGST,
      signatureNet: quotation.signatureNet,
      timeOfDelivery: quotation.timeOfDelivery || "",
      paymentTerms: quotation.paymentTerms,
      basePrice: quotation.basePrice,
      installationCost: quotation.installationCost,
      tax: quotation.tax,
      totalAmount: quotation.totalAmount,
      status: quotation.status,
      createdAt: quotation.createdAt.toISOString().split("T")[0],
      validUntil: quotation.validUntil.toISOString().split("T")[0],
      version: quotation.version,
    }));
    res.json(formattedQuotations);
  } catch (error) {
    console.error("Error fetching quotations:", error);
    res.status(500).json({ error: "Failed to fetch quotations" });
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

    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }
    // Convert MongoDB _id to id for frontend compatibility
    res.json({
      id: quotation._id.toString(),
      leadId: quotation.leadId,
      leadName: quotation.leadName,
      projectAddress: quotation.projectAddress || "",
      contactNumber: quotation.contactNumber || "",
      elevatorType: quotation.elevatorType,
      modelNumber: quotation.modelNumber || "KAS-GX630",
      floors: quotation.floors,
      capacity: quotation.capacity,
      speed: quotation.speed,
      shaftType: quotation.shaftType || "G S",
      application: quotation.application || "Outdoor",
      cabinType: quotation.cabinType || "Standard",
      doorType: quotation.doorType || "Automatic Door",
      features: quotation.features,
      standardRates: quotation.standardRates,
      signatureRates: quotation.signatureRates,
      standardTotal: quotation.standardTotal,
      standardGST: quotation.standardGST,
      standardNet: quotation.standardNet,
      signatureTotal: quotation.signatureTotal,
      signatureGST: quotation.signatureGST,
      signatureNet: quotation.signatureNet,
      timeOfDelivery: quotation.timeOfDelivery || "",
      paymentTerms: quotation.paymentTerms,
      basePrice: quotation.basePrice,
      installationCost: quotation.installationCost,
      tax: quotation.tax,
      totalAmount: quotation.totalAmount,
      status: quotation.status,
      createdAt: quotation.createdAt.toISOString().split("T")[0],
      validUntil: quotation.validUntil.toISOString().split("T")[0],
      version: quotation.version,
    });
  } catch (error) {
    console.error("Error fetching quotation:", error);
    res.status(500).json({ error: "Failed to fetch quotation" });
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

    const quotation = new Quotation({
      ...req.body,
      validUntil: req.body.validUntil ? new Date(req.body.validUntil) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    const savedQuotation = await quotation.save();
    
    console.log("✅ Quotation saved to database:", {
      id: savedQuotation._id,
      leadName: savedQuotation.leadName,
    });

    // Convert MongoDB _id to id for frontend compatibility
    res.status(201).json({
      id: savedQuotation._id.toString(),
      leadId: savedQuotation.leadId,
      leadName: savedQuotation.leadName,
      projectAddress: savedQuotation.projectAddress || "",
      contactNumber: savedQuotation.contactNumber || "",
      elevatorType: savedQuotation.elevatorType,
      modelNumber: savedQuotation.modelNumber || "KAS-GX630",
      floors: savedQuotation.floors,
      capacity: savedQuotation.capacity,
      speed: savedQuotation.speed,
      shaftType: savedQuotation.shaftType || "G S",
      application: savedQuotation.application || "Outdoor",
      cabinType: savedQuotation.cabinType || "Standard",
      doorType: savedQuotation.doorType || "Automatic Door",
      features: savedQuotation.features,
      standardRates: savedQuotation.standardRates,
      signatureRates: savedQuotation.signatureRates,
      standardTotal: savedQuotation.standardTotal,
      standardGST: savedQuotation.standardGST,
      standardNet: savedQuotation.standardNet,
      signatureTotal: savedQuotation.signatureTotal,
      signatureGST: savedQuotation.signatureGST,
      signatureNet: savedQuotation.signatureNet,
      timeOfDelivery: savedQuotation.timeOfDelivery || "",
      paymentTerms: savedQuotation.paymentTerms,
      basePrice: savedQuotation.basePrice,
      installationCost: savedQuotation.installationCost,
      tax: savedQuotation.tax,
      totalAmount: savedQuotation.totalAmount,
      status: savedQuotation.status,
      createdAt: savedQuotation.createdAt.toISOString().split("T")[0],
      validUntil: savedQuotation.validUntil.toISOString().split("T")[0],
      version: savedQuotation.version,
    });
  } catch (error: any) {
    console.error("Error creating quotation:", error);
    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return res.status(503).json({ 
        error: "Database connection error. Please try again later." 
      });
    }
    res.status(400).json({ error: "Failed to create quotation" });
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

    // Get current quotation to check if status is changing
    const currentQuotation = await Quotation.findById(req.params.id);
    if (!currentQuotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    // Convert date strings to Date objects if present
    const updateData: any = { ...req.body };
    if (updateData.validUntil) {
      updateData.validUntil = new Date(updateData.validUntil);
    }

    // Increment version if status is changing
    const isStatusChanging = updateData.status && currentQuotation.status !== updateData.status;
    if (isStatusChanging) {
      updateData.version = (currentQuotation.version || 1) + 1;
    }

    const quotation = await Quotation.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }
    
    // Create notification if quotation is approved
    if (req.body.status === "Approved" && quotation.status === "Approved") {
      try {
        const notification = new Notification({
          userId: null, // Global notification
          message: `Quotation approved for ${quotation.leadName}`,
          type: "quotation",
          relatedId: quotation._id.toString(),
          read: false,
        });
        await notification.save();
      } catch (notifError) {
        console.error("Failed to create notification:", notifError);
        // Don't fail the request if notification creation fails
      }
    }
    
    // Convert MongoDB _id to id for frontend compatibility
    res.json({
      id: quotation._id.toString(),
      leadId: quotation.leadId,
      leadName: quotation.leadName,
      projectAddress: quotation.projectAddress || "",
      contactNumber: quotation.contactNumber || "",
      elevatorType: quotation.elevatorType,
      modelNumber: quotation.modelNumber || "KAS-GX630",
      floors: quotation.floors,
      capacity: quotation.capacity,
      speed: quotation.speed,
      shaftType: quotation.shaftType || "G S",
      application: quotation.application || "Outdoor",
      cabinType: quotation.cabinType || "Standard",
      doorType: quotation.doorType || "Automatic Door",
      features: quotation.features,
      standardRates: quotation.standardRates,
      signatureRates: quotation.signatureRates,
      standardTotal: quotation.standardTotal,
      standardGST: quotation.standardGST,
      standardNet: quotation.standardNet,
      signatureTotal: quotation.signatureTotal,
      signatureGST: quotation.signatureGST,
      signatureNet: quotation.signatureNet,
      timeOfDelivery: quotation.timeOfDelivery || "",
      paymentTerms: quotation.paymentTerms,
      basePrice: quotation.basePrice,
      installationCost: quotation.installationCost,
      tax: quotation.tax,
      totalAmount: quotation.totalAmount,
      status: quotation.status,
      createdAt: quotation.createdAt.toISOString().split("T")[0],
      validUntil: quotation.validUntil.toISOString().split("T")[0],
      version: quotation.version,
    });
  } catch (error) {
    console.error("Error updating quotation:", error);
    res.status(400).json({ error: "Failed to update quotation" });
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

    const quotation = await Quotation.findByIdAndDelete(req.params.id);
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }
    res.json({ message: "Quotation deleted successfully" });
  } catch (error) {
    console.error("Error deleting quotation:", error);
    res.status(500).json({ error: "Failed to delete quotation" });
  }
});

router.get("/:id/pdf", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    // Convert to format expected by PDF generator
    const quotationData = {
      id: quotation._id.toString(),
      leadId: quotation.leadId,
      leadName: quotation.leadName,
      projectAddress: quotation.projectAddress,
      contactNumber: quotation.contactNumber,
      elevatorType: quotation.elevatorType,
      modelNumber: quotation.modelNumber,
      floors: quotation.floors,
      capacity: quotation.capacity,
      speed: quotation.speed,
      shaftType: quotation.shaftType,
      application: quotation.application,
      cabinType: quotation.cabinType,
      doorType: quotation.doorType,
      features: quotation.features,
      standardRates: quotation.standardRates,
      signatureRates: quotation.signatureRates,
      standardTotal: quotation.standardTotal,
      standardGST: quotation.standardGST,
      standardNet: quotation.standardNet,
      signatureTotal: quotation.signatureTotal,
      signatureGST: quotation.signatureGST,
      signatureNet: quotation.signatureNet,
      timeOfDelivery: quotation.timeOfDelivery,
      paymentTerms: quotation.paymentTerms,
      basePrice: quotation.basePrice,
      installationCost: quotation.installationCost,
      tax: quotation.tax,
      totalAmount: quotation.totalAmount,
      status: quotation.status,
      createdAt: quotation.createdAt.toISOString().split("T")[0],
      validUntil: quotation.validUntil.toISOString().split("T")[0],
      version: quotation.version,
    };

    console.log("📄 Generating PDF for quotation:", quotationData.id);
    console.log("📋 Quotation data:", JSON.stringify(quotationData, null, 2));

    const pdfBuffer = await generateQuotationPDF(quotationData);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      console.error("❌ PDF buffer is empty");
      return res.status(500).json({ error: "Failed to generate PDF: Empty buffer" });
    }

    console.log("✅ PDF generated successfully, size:", pdfBuffer.length, "bytes");

    // Set proper headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length.toString());
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Quotation-${quotationData.id}.pdf"`
    );
    // Allow CORS for PDF downloads
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Type");
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Error generating PDF:", error);
    res.status(500).json({ 
      error: "Failed to generate PDF", 
      message: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;






















