import express from "express";
import mongoose from "mongoose";
import Pipeline from "../models/Pipeline";
import User from "../models/User";
import Lead from "../models/Lead";
import Group from "../models/Group";
import { authenticate } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { PERMISSIONS } from "../utils/permissions";

const router = express.Router();

router.use(authenticate);

const isValidObjectId = (id: string | string[]): boolean => {
  const idStr = Array.isArray(id) ? id[0] : id;
  return mongoose.Types.ObjectId.isValid(idStr) && idStr.toString().match(/^[0-9a-fA-F]{24}$/) !== null;
};

const normalizeStages = (input: any): { name: string; order: number }[] => {
  const raw: any[] = Array.isArray(input) ? input : [];
  const names = raw
    .map((s) => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object") return s.name;
      return "";
    })
    .map((n) => String(n || "").trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const n of names) {
    const key = n.toLowerCase();
    if (!unique.some((x) => x.toLowerCase() === key)) unique.push(n);
  }

  return unique.map((name, idx) => ({
    name,
    order: idx,
  }));
};

/** Same funnel as Lead model / leads UI ("Lead Contacted", not "Contacted", etc.). */
const getDefaultStages = (): { name: string; order: number }[] =>
  [
    "New Lead",
    "Lead Contacted",
    "Meeting Scheduled",
    "Meeting Completed",
    "Quotation Sent",
    "Manager Deliberation",
    "Order Closed",
    "Order Lost",
  ].map((name, idx) => ({
    name,
    order: idx,
  }));

// GET all pipelines with pagination, search, leads count and group name
router.get("/", checkPermission(PERMISSIONS.PIPELINES_VIEW), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || "";

    let query: any = {};
    if (search.trim()) {
      const term = search.trim();
      const conditions: any[] = [
        { pipelineName: { $regex: term, $options: "i" } },
      ];
      // Match by group name
      const groups = await Group.find({
        groupName: { $regex: term, $options: "i" },
      }).select("_id");
      const groupIds = groups.map((g) => g._id);
      if (groupIds.length > 0) {
        conditions.push({ group: { $in: groupIds } });
      }
      // Match by addedBy user name or email
      const users = await User.find({
        $or: [
          { name: { $regex: term, $options: "i" } },
          { email: { $regex: term, $options: "i" } },
        ],
      }).select("_id");
      const userIds = users.map((u) => u._id);
      if (userIds.length > 0) {
        conditions.push({ addedBy: { $in: userIds } });
      }
      query = { $or: conditions };
    }

    const [pipelines, total] = await Promise.all([
      Pipeline.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("addedBy", "name")
        .populate({ path: "group", select: "groupName", populate: { path: "assignedTeam", select: "name" } })
        .lean(),
      Pipeline.countDocuments(query),
    ]);

    const formatted = await Promise.all(
      pipelines.map(async (p: any) => {
        const groupId = p.group?._id ?? p.group;
        const leadsCount = groupId ? await Lead.countDocuments({ group: groupId }) : 0;
        const assignedTeam = (p.group?.assignedTeam || []).map((u: any) => ({
          id: u._id?.toString(),
          name: u.name,
        }));
        return {
          id: p._id.toString(),
          pipelineName: p.pipelineName,
          details: p.details || "",
          stages: Array.isArray(p.stages) ? p.stages : [],
          groupName: p.group?.groupName ?? null,
          groupId: groupId?.toString() ?? null,
          leads: leadsCount,
          assignedTeam,
          created: p.createdAt,
        };
      })
    );

    res.json({
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch pipelines:", error);
    res.status(500).json({ error: "Failed to fetch pipelines" });
  }
});

// GET pipeline by ID
router.get("/:id", checkPermission(PERMISSIONS.PIPELINES_VIEW), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid pipeline ID format" });
    }
    const pipeline = await Pipeline.findById(req.params.id)
      .populate("addedBy", "name")
      .populate({ path: "group", select: "groupName", populate: { path: "assignedTeam", select: "name" } });
    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }
    const groupId = (pipeline as any).group?._id ?? (pipeline as any).group;
    const leads = groupId ? await Lead.countDocuments({ group: groupId }) : 0;
    const assignedTeam = ((pipeline as any).group?.assignedTeam || []).map((u: any) => ({
      id: u._id?.toString(),
      name: u.name,
    }));
    res.json({
      id: pipeline._id.toString(),
      pipelineName: pipeline.pipelineName,
      details: (pipeline as any).details || "",
      stages: Array.isArray((pipeline as any).stages) ? (pipeline as any).stages : [],
      groupName: (pipeline as any).group?.groupName ?? null,
      groupId: groupId?.toString() ?? null,
      leads,
      assignedTeam,
      created: pipeline.createdAt,
    });
  } catch (error) {
    console.error("Failed to fetch pipeline:", error);
    res.status(500).json({ error: "Failed to fetch pipeline" });
  }
});

// GET pipeline board data (stages + leads for that pipeline's group)
router.get("/:id/board", checkPermission(PERMISSIONS.PIPELINES_VIEW), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid pipeline ID format" });
    }
    const pipeline = await Pipeline.findById(req.params.id)
      .populate("addedBy", "name")
      .populate({ path: "group", select: "groupName", populate: { path: "assignedTeam", select: "name" } })
      .lean();
    if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });

    const groupId = (pipeline as any).group?._id ?? (pipeline as any).group;
    const stages =
      Array.isArray((pipeline as any).stages) && (pipeline as any).stages.length > 0
        ? (pipeline as any).stages
        : getDefaultStages();

    const leads = groupId
      ? await Lead.find({ group: groupId })
          .sort({ createdAt: -1 })
          .select("leadId name company email phone source stage value assignedTo assignedToUserId createdAt lastContact notes group orderLostReason orderLostReasonOther")
          .lean()
      : [];

    res.json({
      pipeline: {
        id: (pipeline as any)._id.toString(),
        pipelineName: (pipeline as any).pipelineName,
        details: (pipeline as any).details || "",
        groupId: groupId?.toString() ?? null,
        groupName: (pipeline as any).group?.groupName ?? null,
        stages,
      },
      leads: leads.map((lead: any) => ({
        id: lead.leadId || lead._id.toString(),
        leadId: lead.leadId || lead._id.toString(),
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        stage: lead.stage,
        value: lead.value,
        assignedTo: lead.assignedTo,
        assignedToUserId: lead.assignedToUserId ? lead.assignedToUserId.toString() : null,
        createdAt: lead.createdAt ? new Date(lead.createdAt).toISOString().split("T")[0] : "",
        lastContact: lead.lastContact ? new Date(lead.lastContact).toISOString().split("T")[0] : "",
        notes: lead.notes || "",
        orderLostReason: lead.orderLostReason || "",
        orderLostReasonOther: lead.orderLostReasonOther || "",
        groupId: groupId?.toString() ?? null,
        groupName: (pipeline as any).group?.groupName ?? null,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch pipeline board:", error);
    res.status(500).json({ error: "Failed to fetch pipeline board" });
  }
});

// POST create pipeline (assigned team comes from the selected group)
router.post("/", checkPermission(PERMISSIONS.PIPELINES_CREATE), async (req, res) => {
  try {
    const { pipelineName, groupId, details, stages } = req.body;
    if (!pipelineName || !String(pipelineName).trim()) {
      return res.status(400).json({ error: "Pipeline name is required" });
    }
    const addedById = req.body.addedBy || req.user?.id;
    let addedBy: mongoose.Types.ObjectId | null = null;
    if (addedById && isValidObjectId(addedById)) {
      addedBy = new mongoose.Types.ObjectId(addedById);
    }
    if (!addedBy) {
      const firstUser = await User.findOne();
      if (firstUser) addedBy = firstUser._id;
    }
    if (!addedBy) {
      return res.status(400).json({ error: "Could not determine user to set as addedBy" });
    }

    let group: mongoose.Types.ObjectId | null = null;
    if (groupId && isValidObjectId(groupId)) {
      group = new mongoose.Types.ObjectId(groupId);
    }

    const normalizedStages = normalizeStages(stages);
    const finalStages = normalizedStages.length > 0 ? normalizedStages : getDefaultStages();

    const pipeline = await Pipeline.create({
      pipelineName: String(pipelineName).trim(),
      details: typeof details === "string" ? details.trim() : "",
      group,
      stages: finalStages,
      addedBy,
    });

    const populated = await Pipeline.findById(pipeline._id)
      .populate("addedBy", "name")
      .populate({ path: "group", select: "groupName", populate: { path: "assignedTeam", select: "name" } });
    const gId = (populated as any).group?._id ?? (populated as any).group;
    const leadsCount = gId ? await Lead.countDocuments({ group: gId }) : 0;
    const assignedTeam = ((populated as any).group?.assignedTeam || []).map((u: any) => ({
      id: u._id?.toString(),
      name: u.name,
    }));

    res.status(201).json({
      id: pipeline._id.toString(),
      pipelineName: (populated as any).pipelineName,
      details: (populated as any).details || "",
      stages: Array.isArray((populated as any).stages) ? (populated as any).stages : [],
      groupName: (populated as any).group?.groupName ?? null,
      groupId: gId?.toString() ?? null,
      leads: leadsCount,
      assignedTeam,
      created: (populated as any).createdAt,
    });
  } catch (error) {
    console.error("Failed to create pipeline:", error);
    res.status(500).json({ error: "Failed to create pipeline" });
  }
});

// PUT update pipeline (assigned team comes from the selected group)
router.put("/:id", checkPermission(PERMISSIONS.PIPELINES_EDIT), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid pipeline ID format" });
    }
    const { pipelineName, groupId, details, stages } = req.body;
    const update: any = {};
    if (typeof pipelineName === "string" && pipelineName.trim()) update.pipelineName = pipelineName.trim();
    if (typeof details === "string") update.details = details.trim();
    if (groupId !== undefined) {
      update.group = groupId && isValidObjectId(groupId) ? new mongoose.Types.ObjectId(groupId) : null;
    }
    if (stages !== undefined) {
      const normalizedStages = normalizeStages(stages);
      update.stages = normalizedStages.length > 0 ? normalizedStages : getDefaultStages();
    }

    const pipeline = await Pipeline.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate("addedBy", "name")
      .populate({ path: "group", select: "groupName", populate: { path: "assignedTeam", select: "name" } });
    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }
    const gId = (pipeline as any).group?._id ?? (pipeline as any).group;
    const leadsCount = gId ? await Lead.countDocuments({ group: gId }) : 0;
    const assignedTeam = ((pipeline as any).group?.assignedTeam || []).map((u: any) => ({
      id: u._id?.toString(),
      name: u.name,
    }));
    res.json({
      id: pipeline._id.toString(),
      pipelineName: pipeline.pipelineName,
      details: (pipeline as any).details || "",
      stages: Array.isArray((pipeline as any).stages) ? (pipeline as any).stages : [],
      groupName: (pipeline as any).group?.groupName ?? null,
      groupId: gId?.toString() ?? null,
      leads: leadsCount,
      assignedTeam,
      created: pipeline.createdAt,
    });
  } catch (error) {
    console.error("Failed to update pipeline:", error);
    res.status(500).json({ error: "Failed to update pipeline" });
  }
});

// DELETE pipeline
router.delete("/:id", checkPermission(PERMISSIONS.PIPELINES_DELETE), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid pipeline ID format" });
    }
    const pipeline = await Pipeline.findByIdAndDelete(req.params.id);
    if (!pipeline) {
      return res.status(404).json({ error: "Pipeline not found" });
    }
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error("Failed to delete pipeline:", error);
    res.status(500).json({ error: "Failed to delete pipeline" });
  }
});

export default router;
