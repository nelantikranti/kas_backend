import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import Lead from "../models/Lead";
import User from "../models/User";
import Group from "../models/Group";
import { logActivity } from "../middleware/activityLogger";
import Project from "../models/Project";
import Quotation from "../models/Quotation";
import { authenticate } from "../middleware/auth";
import { checkPermission, checkAnyPermission } from "../middleware/permissions";
import { PERMISSIONS } from "../utils/permissions";
import {
  deleteLeadDocumentFile,
  getLeadDocumentAbsolutePath,
  isRemoteDocumentUrl,
  saveLeadDocumentLocally,
} from "../utils/leadDocumentStorage";
import {
  buildAssigneeMatchOrConditions,
  userCanAccessLead,
  resolveAssigneeFields,
  escapeRegex,
  canManageLeadAssignments,
} from "../utils/leadAssignee";

const router = express.Router();

const leadDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed: ${ext}`));
  },
});

const LEAD_DOCUMENT_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

async function storeLeadDocument(
  buffer: Buffer,
  leadId: string,
  originalName: string
): Promise<{ fileUrl: string; bytes: number }> {
  const storage = (process.env.LEAD_DOCUMENT_STORAGE || "local").toLowerCase();

  if (storage === "cloudinary") {
    const { cloudinaryV2: cloudinary } = await import("../config/cloudinary");
    const ext = path.extname(originalName).toLowerCase();
    const imageExts = [".jpg", ".jpeg", ".png"];
    const resourceType: "image" | "raw" = imageExts.includes(ext) ? "image" : "raw";

    const result = await new Promise<{ secure_url: string; bytes: number }>((resolve, reject) => {
      const timeoutMs = Number(process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS || 20000);
      const timer = setTimeout(() => reject(new Error("Cloudinary upload timed out")), timeoutMs);

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "kas_crm/lead_documents",
          resource_type: resourceType,
          use_filename: false,
        },
        (err: any, uploadResult: any) => {
          clearTimeout(timer);
          if (err) {
            reject(new Error(err?.message || "Cloudinary upload failed"));
            return;
          }
          if (!uploadResult?.secure_url) {
            reject(new Error("Cloudinary upload returned no result"));
            return;
          }
          resolve({ secure_url: uploadResult.secure_url, bytes: uploadResult.bytes || buffer.length });
        }
      );

      uploadStream.on("error", (streamErr: any) => {
        clearTimeout(timer);
        reject(new Error(streamErr?.message || "Upload stream error"));
      });

      uploadStream.end(buffer);
    });

    return { fileUrl: result.secure_url, bytes: result.bytes };
  }

  return saveLeadDocumentLocally(buffer, leadId, originalName);
}

async function findLeadByParamId(id: string) {
  if (id.match(/^kas-\d+$/)) {
    return Lead.findOne({ leadId: id });
  }
  return Lead.findById(id);
}

const formatLeadDocument = (doc: any) => ({
  id: doc._id?.toString(),
  fileName: doc.fileName,
  fileType: doc.fileType,
  fileSize: doc.fileSize,
  fileUrl: doc.fileUrl,
  uploadedDate: doc.uploadedDate ? toDateOnly(doc.uploadedDate) || undefined : undefined,
});

/** Admin or users with View All Leads see every lead; others only their assigned leads. */
const canViewAllLeads = (req: express.Request) =>
  req.user?.role === "Admin" ||
  req.user?.permissions?.includes(PERMISSIONS.LEADS_VIEW_ALL);

const normalizePhone = (value: string): string => value.replace(/\D/g, "").slice(-10);
const normalizeEmail = (value: string): string => value.trim().toLowerCase();

function formatContactReport(contactReport: any) {
  if (!contactReport) return undefined;
  const raw =
    typeof contactReport.toObject === "function"
      ? contactReport.toObject()
      : { ...contactReport };

  if (raw.contactDetails?.dateTime) {
    const parsed = new Date(raw.contactDetails.dateTime);
    raw.contactDetails = {
      ...raw.contactDetails,
      dateTime: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
    };
  }
  return raw;
}

async function resolveLeadGroup(groupId?: string): Promise<mongoose.Types.ObjectId | null> {
  if (!groupId || !groupId.toString().trim()) return null;
  const raw = groupId.toString().trim();
  if (mongoose.Types.ObjectId.isValid(raw)) {
    return new mongoose.Types.ObjectId(raw);
  }
  const group = await Group.findOne({ groupName: raw }).select("_id");
  return group ? group._id : null;
}

/** Safely convert a possibly missing/invalid date to a YYYY-MM-DD string. */
function toDateOnly(value: any): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function formatLeadForResponse(lead: any) {
  return {
    id: lead.leadId || lead._id.toString(),
    leadId: lead.leadId || lead._id.toString(),
    name: lead.name,
    company: lead.company,
    state: lead.state || "",
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    stage: lead.stage,
    contactStatus: lead.contactStatus || "",
    value: lead.value,
    assignedTo: lead.assignedTo,
    assignedToUserId: lead.assignedToUserId
      ? lead.assignedToUserId.toString()
      : null,
    createdAt: toDateOnly(lead.createdAt),
    lastContact: toDateOnly(lead.lastContact),
    notes: lead.notes,
    orderLostReason: lead.orderLostReason || "",
    orderLostReasonOther: lead.orderLostReasonOther || "",
    groupId: lead.group ? lead.group._id?.toString() : null,
    groupName: lead.group ? lead.group.groupName : null,
    contactReport: formatContactReport(lead.contactReport),
    documents: (lead.documents || []).map(formatLeadDocument),
  };
}

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

let didAttemptDropIdIndex = false;
const dropIdIndexOnce = async () => {
  if (didAttemptDropIdIndex) return false;
  didAttemptDropIdIndex = true;
  return dropIdIndex();
};

// Drop the index when this module loads (if connected)
if (mongoose.connection.readyState === 1) {
  dropIdIndexOnce();
}

// Also try when connection is established
mongoose.connection.on('connected', () => {
  dropIdIndexOnce();
});

// Function to generate unique lead ID in format kas-00001
const generateLeadId = async (): Promise<string> => {
  try {
    // Find the highest leadId number
    const leads = await Lead.find({ leadId: { $exists: true, $ne: null } })
      .sort({ leadId: -1 })
      .allowDiskUse(true)
      .limit(1);
    
    let nextNumber = 1;
    
    if (leads.length > 0 && leads[0].leadId) {
      // Extract number from existing leadId (e.g., "kas-00001" -> 1)
      const lastLeadId = leads[0].leadId;
      const match = lastLeadId.match(/kas-(\d+)/);
      
      if (match) {
        const lastNumber = parseInt(match[1], 10);
        nextNumber = lastNumber + 1;
      }
    } else {
      // Check if there are any leads without leadId and assign them first
      const leadsWithoutId = await Lead.find({ 
        $or: [
          { leadId: { $exists: false } },
          { leadId: null }
        ]
      }).sort({ createdAt: 1 }).limit(100);
      
      if (leadsWithoutId.length > 0) {
        // Assign leadIds to existing leads without IDs
        for (let i = 0; i < leadsWithoutId.length; i++) {
          const leadId = `kas-${String(i + 1).padStart(5, '0')}`;
          await Lead.findByIdAndUpdate(leadsWithoutId[i]._id, { leadId });
        }
        nextNumber = leadsWithoutId.length + 1;
      }
    }
    
    // Format as kas-00001, kas-00002, etc. (5 digits)
    return `kas-${String(nextNumber).padStart(5, '0')}`;
  } catch (error) {
    console.error("Error generating lead ID:", error);
    // Fallback: generate based on count
    const count = await Lead.countDocuments();
    return `kas-${String(count + 1).padStart(5, '0')}`;
  }
};

// Simple test endpoint to verify route reachability
router.get("/test", (req, res) => {
  res.json({ ok: true, route: "/api/leads/test" });
});

// POST /api/leads/check-duplicates
// Body: { phones: string[], emails: string[] }
// Returns: { duplicatePhones: string[], duplicateEmails: string[] }
router.post("/check-duplicates", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    const phones: string[] = Array.from(
      new Set(
        ((req.body.phones || []) as string[])
          .filter(Boolean)
          .map((phone) => normalizePhone(String(phone)))
          .filter((phone) => phone.length === 10)
      )
    );
    const emails: string[] = Array.from(
      new Set(
        ((req.body.emails || []) as string[])
          .filter(Boolean)
          .map((email) => normalizeEmail(String(email)))
      )
    );

    const orConditions: any[] = [];
    if (phones.length > 0) orConditions.push({ phone: { $in: phones } });
    if (emails.length > 0) orConditions.push({ email: { $in: emails } });

    if (orConditions.length === 0) {
      return res.json({ duplicatePhones: [], duplicateEmails: [] });
    }

    const matches = await Lead.find({ $or: orConditions })
      .select("phone email")
      .lean();

    const duplicatePhones = new Set<string>();
    const duplicateEmails = new Set<string>();

    for (const lead of matches) {
      const normalizedLeadPhone = lead.phone ? normalizePhone(String(lead.phone)) : "";
      const normalizedLeadEmail = lead.email ? normalizeEmail(String(lead.email)) : "";
      if (normalizedLeadPhone && phones.includes(normalizedLeadPhone)) duplicatePhones.add(normalizedLeadPhone);
      if (normalizedLeadEmail && emails.includes(normalizedLeadEmail)) duplicateEmails.add(normalizedLeadEmail);
    }

    return res.json({
      duplicatePhones: [...duplicatePhones],
      duplicateEmails: [...duplicateEmails],
    });
  } catch (error) {
    console.error("Error checking duplicates:", error);
    return res.status(500).json({ error: "Failed to check duplicates" });
  }
});

/** Same visibility + filters as GET / (used by list pagination and dashboard aggregates). */
function buildLeadsListFilterQuery(req: express.Request): { query: Record<string, unknown>; noAccess: boolean } {
  const groupId = (req.query.groupId || req.query.group) as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();
  const source = (req.query.source as string | undefined)?.trim();
  const state = (req.query.state as string | undefined)?.trim();
  const stage = (req.query.stage as string | undefined)?.trim();
  const contactStatus = (req.query.contactStatus as string | undefined)?.trim();
  const assignedToUserId = (req.query.assignedToUserId as string | undefined)?.trim();

  const andParts: Record<string, unknown>[] = [];
  if (!canViewAllLeads(req) && req.user?.id) {
    const assigneeOr = buildAssigneeMatchOrConditions(req);
    if (assigneeOr.length === 0) {
      return { query: {}, noAccess: true };
    }
    andParts.push({ $or: assigneeOr });
  }
  if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
    andParts.push({ group: new mongoose.Types.ObjectId(groupId) });
  }
  if (source) {
    andParts.push({ source: source });
  }
  if (stage) {
    andParts.push({ stage });
  }
  if (contactStatus) {
    andParts.push({ contactStatus });
  }
  if (state) {
    const regex = new RegExp(escapeRegex(state), "i");
    andParts.push({
      $or: [{ state: regex }, { company: regex }],
    });
  }
  if (assignedToUserId && mongoose.Types.ObjectId.isValid(assignedToUserId) && canViewAllLeads(req)) {
    andParts.push({ assignedToUserId: new mongoose.Types.ObjectId(assignedToUserId) });
  }
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    andParts.push({
      $or: [
        { leadId: regex },
        { name: regex },
        { company: regex },
        { state: regex },
        { email: regex },
        { phone: regex },
        { source: regex },
        { stage: regex },
        { assignedTo: regex },
      ],
    });
  }

  let query: Record<string, unknown> = {};
  if (andParts.length === 0) {
    query = {};
  } else if (andParts.length === 1) {
    query = andParts[0];
  } else {
    query = { $and: andParts };
  }

  return { query, noAccess: false };
}

// Aggregate stage counts + total for dashboard (respects LEADS_VIEW scoping — not limited to page size).
router.get(
  "/summary/stats",
  authenticate,
  checkPermission(PERMISSIONS.LEADS_VIEW),
  async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
          error: "Database connection unavailable. Please ensure MongoDB is running.",
        });
      }

      const { query, noAccess } = buildLeadsListFilterQuery(req);

      const empty = () =>
        res.json({
          total: 0,
          leadContacted: 0,
          meetingScheduled: 0,
          meetingsCompleted: 0,
          quotationSent: 0,
          managerDeliberation: 0,
          lostLeads: 0,
          newLead: 0,
          orderClosed: 0,
          askToCallBack: 0,
          dnp: 0,
          notRequired: 0,
        });

      if (noAccess) {
        return empty();
      }

      const [stageAgg, statusAgg, total] = await Promise.all([
        Lead.aggregate<{ _id: string | null; c: number }>([
          { $match: query as Record<string, unknown> },
          { $group: { _id: "$stage", c: { $sum: 1 } } },
        ]),
        Lead.aggregate<{ _id: string | null; c: number }>([
          { $match: query as Record<string, unknown> },
          { $group: { _id: "$contactStatus", c: { $sum: 1 } } },
        ]),
        Lead.countDocuments(query),
      ]);

      const byStage = (name: string) =>
        stageAgg.find((row) => (row._id || "") === name)?.c ?? 0;
      const byContactStatus = (name: string) =>
        statusAgg.find((row) => (row._id || "") === name)?.c ?? 0;

      return res.json({
        total,
        leadContacted: byStage("Lead Contacted"),
        meetingScheduled: byStage("Meeting Scheduled"),
        meetingsCompleted: byStage("Meeting Completed"),
        quotationSent: byStage("Quotation Sent"),
        managerDeliberation: byStage("Manager Deliberation"),
        lostLeads: byStage("Order Lost"),
        newLead: byStage("New Lead"),
        orderClosed: byStage("Order Closed"),
        askToCallBack: byContactStatus("Ask To call back"),
        dnp: byContactStatus("DNP"),
        notRequired: byContactStatus("Not required"),
      });
    } catch (error) {
      console.error("Error fetching lead summary stats:", error);
      res.status(500).json({ error: "Failed to fetch lead stats" });
    }
  }
);

// POST bulk reassign all leads from one user to another (Admin or View All Leads)
router.post(
  "/bulk-reassign",
  authenticate,
  checkPermission(PERMISSIONS.LEADS_VIEW),
  async (req, res) => {
    try {
      if (!canManageLeadAssignments(req)) {
        return res.status(403).json({
          error: "Only administrators and managers with View All Leads can reassign leads.",
        });
      }

      const fromUserId = String(req.body?.fromUserId || "").trim();
      const toUserId = String(req.body?.toUserId || "").trim();

      if (!fromUserId || !toUserId) {
        return res.status(400).json({ error: "fromUserId and toUserId are required." });
      }
      if (fromUserId === toUserId) {
        return res.status(400).json({ error: "Source and target user must be different." });
      }
      if (!mongoose.Types.ObjectId.isValid(fromUserId) || !mongoose.Types.ObjectId.isValid(toUserId)) {
        return res.status(400).json({ error: "Invalid user id." });
      }

      const targetUser = await User.findById(toUserId).select("name email role");
      if (!targetUser) {
        return res.status(404).json({ error: "Target user not found." });
      }

      const resolved = await resolveAssigneeFields({
        assignedTo: targetUser.name || targetUser.email || "",
        assignedToUserId: toUserId,
      });

      const result = await Lead.updateMany(
        { assignedToUserId: new mongoose.Types.ObjectId(fromUserId) },
        {
          $set: {
            assignedTo: resolved.assignedTo,
            assignedToUserId: resolved.assignedToUserId,
          },
        }
      );

      res.json({
        message: `Reassigned ${result.modifiedCount} lead(s) to ${resolved.assignedTo}.`,
        modifiedCount: result.modifiedCount,
        assignedTo: resolved.assignedTo,
        assignedToUserId: resolved.assignedToUserId?.toString() ?? null,
      });
    } catch (error) {
      console.error("Bulk reassign error:", error);
      res.status(500).json({ error: "Failed to bulk reassign leads." });
    }
  }
);

// GET all leads with pagination (query: groupId, page, limit, search, source, stage, contactStatus, state, assignedToUserId)
// Admin sees all leads; other users only see leads assigned to their user id.
router.get("/", authenticate, checkPermission(PERMISSIONS.LEADS_VIEW), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "20", 10)));

    const { query, noAccess } = buildLeadsListFilterQuery(req);
    if (noAccess) {
      return res.json({
        leads: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }

    const total = await Lead.countDocuments(query);
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const leads = await Lead.find(query)
      .sort({ createdAt: -1 })
      .allowDiskUse(true)
      .skip(skip)
      .limit(limit)
      .populate("group", "groupName");

    const formattedLeads = leads.map((lead) => formatLeadForResponse(lead));

    if (!res.headersSent) {
      res.json({
        leads: formattedLeads,
        total,
        page,
        limit,
        totalPages,
      });
    } else {
      console.warn("Response already sent for /api/leads GET");
    }
  } catch (error) {
    console.error("Error fetching leads:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch leads" });
    } else {
      console.warn("Cannot send error response for /api/leads because headers already sent");
    }
  }
});

// GET lead by ID — Admin: any lead; others: only leads assigned to their user id.
router.get("/:id", authenticate, checkPermission(PERMISSIONS.LEADS_VIEW), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    // Check if ID is in kas-XXXXX format, otherwise use MongoDB _id
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? "");
    let lead;
    if (id.match(/^kas-\d+$/)) {
      lead = await Lead.findOne({ leadId: id });
    } else {
      lead = await Lead.findById(id);
    }

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // Non-admin users can only access leads assigned to their user id.
    if (!canViewAllLeads(req) && req.user?.id && !userCanAccessLead(req, lead)) {
      return res.status(403).json({ error: "Access denied. You can only view leads assigned to you." });
    }

    await (lead as any).populate("group", "groupName");

    res.json(formatLeadForResponse(lead));
  } catch (error) {
    console.error("Error fetching lead:", error);
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// POST create new lead
router.post("/", authenticate, checkPermission(PERMISSIONS.LEADS_CREATE), async (req, res) => {
  // Extract and prepare lead data outside try block for retry logic
  const rawStage = (req.body.stage || "").toString().trim();
  const stageMapping: { [key: string]: string } = {
    "New Lead": "New Lead",
    "Lead Contacted": "Lead Contacted",
    "Not Contacted": "Not Contacted",
    "Not Interested": "Not Interested",
    "Meeting Scheduled": "Meeting Scheduled",
    "Meeting Completed": "Meeting Completed",
    "Quotation Sent": "Quotation Sent",
    "Manager Deliberation": "Manager Deliberation",
    "Order Closed": "Order Closed",
    "Order Lost": "Order Lost",
    // Legacy mappings for backward compatibility
    "new lead": "New Lead",
    "lead contacted": "Lead Contacted",
    "not contacted": "Not Contacted",
    "not interested": "Not Interested",
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
  const normalizedInputPhone = leadData.phone ? normalizePhone(String(leadData.phone)) : "";
  const normalizedInputEmail = leadData.email ? normalizeEmail(String(leadData.email)) : "";

  // Helper function to create and save a lead
  const createLead = async () => {
    // Generate unique lead ID
    const leadId = await generateLeadId();
    
    let group: mongoose.Types.ObjectId | null = null;
    if (leadData.groupId) {
      group = await resolveLeadGroup(leadData.groupId);
    }

    const assigneePayload =
      req.user?.role !== "Admin" && req.user?.id
        ? {
            assignedTo: (req.user.name || req.user.email || "").trim(),
            assignedToUserId: req.user.id,
          }
        : {
            assignedTo: leadData.assignedTo,
            assignedToUserId: leadData.assignedToUserId,
          };

    const resolved = await resolveAssigneeFields(assigneePayload);

    const lead = new Lead({
      leadId: leadId,
      name: leadData.name,
      company: leadData.company || "",
      state: leadData.state || "",
      email: normalizedInputEmail,
      phone: normalizedInputPhone,
      source: leadData.source || "Website",
      stage: mappedStage as any,
      value: leadData.value || 0,
      assignedTo: resolved.assignedTo,
      assignedToUserId: resolved.assignedToUserId,
      notes: leadData.notes || "",
      lastContact: leadData.lastContact ? new Date(leadData.lastContact) : new Date(),
      group: group,
    });
    
    // Validate before saving
    const validationError = lead.validateSync();
    if (validationError) {
      const errorMessages = Object.values(validationError.errors || {}).map((err: any) => err.message).join(", ");
      throw { name: 'ValidationError', errors: validationError.errors, message: errorMessages || validationError.message };
    }
    
    const saved = await lead.save();

    if (saved.group) {
      await Group.findByIdAndUpdate(saved.group, { $inc: { totalLeads: 1 } });
    }

    return saved;
  };

  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    // Proactively try to drop the problematic index before creating the lead
    // Avoid doing this expensive operation on every request
    await dropIdIndexOnce();

    if (!normalizedInputPhone || normalizedInputPhone.length !== 10) {
      return res.status(400).json({
        error: "Validation failed",
        details: "Phone number must be exactly 10 digits.",
      });
    }
    if (!normalizedInputEmail) {
      return res.status(400).json({
        error: "Validation failed",
        details: "Email is required.",
      });
    }

    const duplicateLead = await Lead.findOne({
      $or: [{ phone: normalizedInputPhone }, { email: normalizedInputEmail }],
    })
      .select("leadId name email phone")
      .lean();
    if (duplicateLead) {
      const duplicateReason =
        normalizePhone(String(duplicateLead.phone || "")) === normalizedInputPhone
          ? `phone ${normalizedInputPhone} already exists`
          : `email ${normalizedInputEmail} already exists`;
      return res.status(409).json({
        error: "Duplicate lead",
        details: `Lead not created: ${duplicateReason}.`,
        existingLeadId: duplicateLead.leadId || String(duplicateLead._id),
      });
    }

    console.log("Stage mapping:", { rawStage, mappedStage });
    
    const savedLead = await createLead();
    
    console.log("✅ Lead saved to database:", {
      id: savedLead._id,
      name: savedLead.name,
      email: savedLead.email,
    });

    // Log activity asynchronously (do not block API response)
    setImmediate(async () => {
      try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        let performerId: string | undefined = undefined;
        let performerName = "Unknown";
        let performerRole: string | undefined = undefined;
        if (token && token.startsWith("token_")) {
          const parts = token.split("_");
          performerId = parts[1];
          const performer = await User.findById(performerId).select("name role");
          if (performer) {
            performerName = performer.name;
            performerRole = performer.role;
          }
        }
        await logActivity({
          userId: undefined,
          userName: savedLead.name,
          userRole: undefined,
          performedBy: performerId,
          performedByName: performerName,
          performedByRole: performerRole,
          targetId: savedLead._id.toString(),
          actionType: "Create",
          moduleName: "Leads",
          description: `Created lead ${savedLead.name || savedLead.email || savedLead._id}`,
          ipAddress: req.ip,
          deviceInfo: req.headers["user-agent"] as string,
          status: "Success",
        });
      } catch (err) {
        console.error("Failed to log lead creation activity:", err);
      }
    });

    await (savedLead as any).populate("group", "groupName");

    return res.status(201).json(formatLeadForResponse(savedLead));
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

              await (savedLead as any).populate("group", "groupName");

              return res.status(201).json({
                id: savedLead._id.toString(),
                name: savedLead.name,
                company: savedLead.company,
                email: savedLead.email,
                phone: savedLead.phone,
                source: savedLead.source,
                stage: savedLead.stage,
                contactStatus: (savedLead as any).contactStatus || "",
                value: savedLead.value,
                assignedTo: savedLead.assignedTo,
                assignedToUserId: (savedLead as any).assignedToUserId
                  ? ((savedLead as any).assignedToUserId as mongoose.Types.ObjectId).toString()
                  : null,
                createdAt: savedLead.createdAt.toISOString().split("T")[0],
                lastContact: savedLead.lastContact.toISOString().split("T")[0],
                notes: savedLead.notes,
                groupId: (savedLead as any).group ? ((savedLead as any).group as any)._id?.toString() : null,
                groupName: (savedLead as any).group ? ((savedLead as any).group as any).groupName : null,
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
router.put("/:id", authenticate, checkPermission(PERMISSIONS.LEADS_EDIT), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    // Get the lead first to check previous stage
    // Check if ID is in kas-XXXXX format, otherwise use MongoDB _id
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? "");
    let existingLead;
    if (id.match(/^kas-\d+$/)) {
      existingLead = await Lead.findOne({ leadId: id });
    } else {
      existingLead = await Lead.findById(id);
    }
    if (!existingLead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    if (!canViewAllLeads(req) && req.user?.id && !userCanAccessLead(req, existingLead)) {
      return res.status(403).json({ error: "Access denied. You can only edit leads assigned to you." });
    }

    const previousStage = existingLead.stage;
    const previousGroupId = (existingLead as any).group ? ((existingLead as any).group as any).toString() : null;
    const newStage = req.body.stage;

    // Convert date strings to Date objects if present
    const updateData: any = { ...req.body };
    if (updateData.lastContact) {
      updateData.lastContact = new Date(updateData.lastContact);
    }

    // Remove _id and leadId if present (MongoDB doesn't allow updating _id, leadId should not be changed)
    delete updateData._id;
    delete updateData.leadId;
    
    // Map groupId (string) from request to group (ObjectId) on the model
    if (Object.prototype.hasOwnProperty.call(updateData, "groupId")) {
      const requestedGroupId = updateData.groupId;
      if (requestedGroupId) {
        updateData.group = await resolveLeadGroup(String(requestedGroupId));
      } else {
        updateData.group = null;
      }
      delete updateData.groupId;
    }

    if (!canManageLeadAssignments(req)) {
      delete updateData.assignedToUserId;
      delete updateData.assignedTo;
    }

    if (Object.prototype.hasOwnProperty.call(updateData, "contactStatus")) {
      const allowedContactStatuses = ["", "Ask To call back", "DNP", "Not required"];
      const contactStatus = String(updateData.contactStatus ?? "").trim();
      if (!allowedContactStatuses.includes(contactStatus)) {
        return res.status(400).json({ error: "Invalid contact status" });
      }
      updateData.contactStatus = contactStatus;
    }

    if (
      canManageLeadAssignments(req) &&
      (Object.prototype.hasOwnProperty.call(req.body, "assignedTo") ||
        Object.prototype.hasOwnProperty.call(req.body, "assignedToUserId"))
    ) {
      const bodyHasAssigneeUserId = Object.prototype.hasOwnProperty.call(
        req.body,
        "assignedToUserId"
      );
      const bodyHasAssigneeName = Object.prototype.hasOwnProperty.call(req.body, "assignedTo");
      const resolved = await resolveAssigneeFields({
        assignedTo:
          typeof req.body.assignedTo === "string"
            ? req.body.assignedTo
            : existingLead.assignedTo,
        assignedToUserId: bodyHasAssigneeUserId
          ? typeof req.body.assignedToUserId === "string"
            ? req.body.assignedToUserId
            : ""
          : bodyHasAssigneeName
            ? undefined
            : existingLead.assignedToUserId?.toString(),
      });
      updateData.assignedTo = resolved.assignedTo;
      updateData.assignedToUserId = resolved.assignedToUserId;
    }

    const currentAssignee = (existingLead.assignedTo || "").trim();
    const requestedAssignee =
      typeof updateData.assignedTo === "string" ? updateData.assignedTo.trim() : undefined;
    const isAssigneeChanging =
      requestedAssignee !== undefined && requestedAssignee !== currentAssignee;

    // Lead owners can update lead details; only managers with reassignment rights can change ownership.
    if (isAssigneeChanging && !canManageLeadAssignments(req)) {
      return res.status(400).json({
        error: "You do not have permission to reassign leads. Please contact an administrator.",
      });
    }

    // Use the same ID matching logic for update
    let lead;
    if (id.match(/^kas-\d+$/)) {
      lead = await Lead.findOneAndUpdate(
        { leadId: id },
        { $set: updateData },
        { new: true, runValidators: true }
      );
    } else {
      lead = await Lead.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      );
    }
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const newGroupId = (lead as any).group ? ((lead as any).group as any).toString() : null;

    // If group changed, update totalLeads counters
    if (previousGroupId && previousGroupId !== newGroupId) {
      await Group.findByIdAndUpdate(previousGroupId, { $inc: { totalLeads: -1 } });
    }
    if (newGroupId && newGroupId !== previousGroupId) {
      await Group.findByIdAndUpdate(newGroupId, { $inc: { totalLeads: 1 } });
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
    
    await (lead as any).populate("group", "groupName");

    // Log activity: lead updated
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performerId: string | undefined = undefined;
      let performerName = "Unknown";
      let performerRole: string | undefined = undefined;
      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        performerId = parts[1];
        const performer = await User.findById(performerId).select("name role");
        if (performer) {
          performerName = performer.name;
          performerRole = performer.role;
        }
      }
      await logActivity({
        userId: undefined,
        userName: lead.name,
        userRole: undefined,
        performedBy: performerId,
        performedByName: performerName,
        performedByRole: performerRole,
        targetId: lead._id.toString(),
        actionType: "Update",
        moduleName: "Leads",
        description: `Updated lead ${lead.name || lead.email || lead._id}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log lead update activity:", err);
    }

    res.json(formatLeadForResponse(lead));
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

// Upload a document for a lead (multipart/form-data)
router.post(
  "/:id/documents",
  authenticate,
  checkAnyPermission([PERMISSIONS.DOCUMENT_UPLOAD, PERMISSIONS.LEADS_EDIT]),
  (req, res) => {
    leadDocumentUpload.single("file")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "File upload error" });
      }
      try {
        if (mongoose.connection.readyState !== 1) {
          return res.status(503).json({ error: "Database connection unavailable." });
        }
        if (!req.file) {
          return res.status(400).json({ error: "No file provided" });
        }

        const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? "");
        const lead = await findLeadByParamId(id);
        if (!lead) {
          return res.status(404).json({ error: "Lead not found" });
        }

        if (!canViewAllLeads(req) && req.user?.id && !userCanAccessLead(req, lead)) {
          return res.status(403).json({ error: "Access denied. You can only edit leads assigned to you." });
        }

        const ext = path.extname(req.file.originalname).toLowerCase();
        const safeFileType = LEAD_DOCUMENT_MIME_TYPES[ext] || "application/octet-stream";
        const stored = await storeLeadDocument(req.file.buffer, id, req.file.originalname);

        if (!lead.documents) lead.documents = [];
        lead.documents.push({
          fileName: req.file.originalname,
          fileType: safeFileType,
          fileSize: req.file.size,
          fileUrl: stored.fileUrl,
          uploadedDate: new Date(),
        } as any);

        await lead.save();
        const addedDoc = lead.documents[lead.documents.length - 1] as any;

        res.status(201).json(formatLeadDocument(addedDoc));
      } catch (error: any) {
        console.error("Error uploading lead document:", error);
        res.status(500).json({ error: error?.message || "Failed to upload document" });
      }
    });
  }
);

// Delete a document from a lead
router.delete(
  "/:id/documents/:docId",
  authenticate,
  checkAnyPermission([PERMISSIONS.DOCUMENT_DELETE, PERMISSIONS.LEADS_EDIT]),
  async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: "Database connection unavailable." });
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? "");
      const lead = await findLeadByParamId(id);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      if (!canViewAllLeads(req) && req.user?.id && !userCanAccessLead(req, lead)) {
        return res.status(403).json({ error: "Access denied. You can only edit leads assigned to you." });
      }

      if (!lead.documents?.length) {
        return res.status(404).json({ error: "Document not found" });
      }

      const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : (req.params.docId ?? "");
      const docIndex = lead.documents.findIndex(
        (doc: any) => doc._id?.toString() === docId
      );
      if (docIndex === -1) {
        return res.status(404).json({ error: "Document not found" });
      }

      const removedDoc = lead.documents[docIndex] as any;
      lead.documents.splice(docIndex, 1);
      await lead.save();

      if (removedDoc?.fileUrl) {
        deleteLeadDocumentFile(removedDoc.fileUrl);
      }

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting lead document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  }
);

// Download / open a lead document
router.get(
  "/:id/documents/:docId/download",
  authenticate,
  checkPermission(PERMISSIONS.LEADS_VIEW),
  async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: "Database connection unavailable." });
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? "");
      const lead = await findLeadByParamId(id);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      if (!canViewAllLeads(req) && req.user?.id && !userCanAccessLead(req, lead)) {
        return res.status(403).json({ error: "Access denied." });
      }

      const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : (req.params.docId ?? "");
      const doc = lead.documents?.find((d: any) => d._id?.toString() === docId) as any;
      if (!doc?.fileUrl) {
        return res.status(404).json({ error: "Document not found" });
      }

      if (isRemoteDocumentUrl(doc.fileUrl)) {
        let downloadUrl = doc.fileUrl;
        if (downloadUrl.startsWith("http://")) {
          downloadUrl = downloadUrl.replace(/^http:\/\//i, "https://");
        }
        return res.redirect(downloadUrl);
      }

      const filePath = getLeadDocumentAbsolutePath(doc.fileUrl);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found on server" });
      }

      res.setHeader("Content-Type", doc.fileType || "application/octet-stream");
      return res.download(filePath, doc.fileName);
    } catch (error) {
      console.error("Error downloading lead document:", error);
      res.status(500).json({ error: "Failed to download document" });
    }
  }
);

// DELETE lead
router.delete("/:id", authenticate, checkPermission(PERMISSIONS.LEADS_DELETE), async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: "Database connection unavailable. Please ensure MongoDB is running." 
      });
    }

    // Check if ID is in kas-XXXXX format, otherwise use MongoDB _id
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id ?? "");
    let lead;
    if (id.match(/^kas-\d+$/)) {
      lead = await Lead.findOne({ leadId: id });
    } else {
      lead = await Lead.findById(id);
    }
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    if (!canViewAllLeads(req) && req.user?.id && !userCanAccessLead(req, lead)) {
      return res.status(403).json({ error: "Access denied. You can only delete leads assigned to you." });
    }

    if (id.match(/^kas-\d+$/)) {
      lead = await Lead.findOneAndDelete({ leadId: id });
    } else {
      lead = await Lead.findByIdAndDelete(id);
    }
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    // Log activity: lead deleted
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performerId: string | undefined = undefined;
      let performerName = "Unknown";
      let performerRole: string | undefined = undefined;
      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        performerId = parts[1];
        const performer = await User.findById(performerId).select("name role");
        if (performer) {
          performerName = performer.name;
          performerRole = performer.role;
        }
      }
      await logActivity({
        userId: undefined,
        userName: lead.name,
        userRole: undefined,
        performedBy: performerId,
        performedByName: performerName,
        performedByRole: performerRole,
        targetId: lead._id.toString(),
        actionType: "Delete",
        moduleName: "Leads",
        description: `Deleted lead ${lead.name || lead.email || lead._id}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log lead delete activity:", err);
    }

    res.json({ message: "Lead deleted successfully" });
  } catch (error) {
    console.error("Error deleting lead:", error);
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

export default router;






















