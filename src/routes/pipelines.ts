import express from "express";
import mongoose from "mongoose";
import Pipeline from "../models/Pipeline";
import User from "../models/User";
import Lead from "../models/Lead";
import Group from "../models/Group";
import { authenticate } from "../middleware/auth";

const router = express.Router();

router.use(authenticate);

const isValidObjectId = (id: string | string[]): boolean => {
  const idStr = Array.isArray(id) ? id[0] : id;
  return mongoose.Types.ObjectId.isValid(idStr) && idStr.toString().match(/^[0-9a-fA-F]{24}$/) !== null;
};

// GET all pipelines with pagination, search, leads count and group name
router.get("/", async (req, res) => {
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
router.get("/:id", async (req, res) => {
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

// POST create pipeline (assigned team comes from the selected group)
router.post("/", async (req, res) => {
  try {
    const { pipelineName, groupId } = req.body;
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

    const pipeline = await Pipeline.create({
      pipelineName: String(pipelineName).trim(),
      group,
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
router.put("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid pipeline ID format" });
    }
    const { pipelineName, groupId } = req.body;
    const update: any = {};
    if (typeof pipelineName === "string" && pipelineName.trim()) update.pipelineName = pipelineName.trim();
    if (groupId !== undefined) {
      update.group = groupId && isValidObjectId(groupId) ? new mongoose.Types.ObjectId(groupId) : null;
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
router.delete("/:id", async (req, res) => {
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
