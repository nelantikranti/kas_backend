import express from "express";
import mongoose from "mongoose";
import Group from "../models/Group";
import User from "../models/User";
import Lead from "../models/Lead";

const router = express.Router();

const isValidObjectId = (id: string | string[]): boolean => {
  const idStr = Array.isArray(id) ? id[0] : id;
  return mongoose.Types.ObjectId.isValid(idStr) && (idStr.toString().match(/^[0-9a-fA-F]{24}$/) !== null);
};

// GET all groups (with optional search across groupName, addedBy name, assignedTeam names, totalLeads)
router.get("/", async (req, res) => {
  try {
    const search = (req.query.search as string) || "";
    let query: any = {};
    if (search.trim()) {
      const term = search.trim();
      const conditions: any[] = [
        { groupName: { $regex: term, $options: "i" } },
      ];
      // Match addedBy / assignedTeam by user name or email
      const users = await User.find({
        $or: [
          { name: { $regex: term, $options: "i" } },
          { email: { $regex: term, $options: "i" } },
        ],
      }).select("_id");
      const userIds = users.map((u) => u._id);
      if (userIds.length > 0) {
        conditions.push({ addedBy: { $in: userIds } });
        conditions.push({ assignedTeam: { $in: userIds } });
      }
      // Match totalLeads if search is a number
      const num = parseInt(term, 10);
      if (String(num) === term && num >= 0) {
        conditions.push({ totalLeads: num });
      }
      // Match selected by keywords
      if (/^(true|yes|selected|1)$/i.test(term)) {
        conditions.push({ selected: true });
      } else if (/^(false|no|not selected|0)$/i.test(term)) {
        conditions.push({ selected: false });
      }
      query = { $or: conditions };
    }
    const groups = await Group.find(query)
      .sort({ createdAt: -1 })
      .populate("addedBy", "name")
      .populate("assignedTeam", "name");
    const formatted = await Promise.all(groups.map(async (g) => {
      const totalLeads = await Lead.countDocuments({ group: g._id });
      return {
      id: g._id.toString(),
      groupName: g.groupName,
      totalLeads,
      isSelected: g.selected,
      created: g.createdAt,
      addedBy: g.addedBy ? { id: (g.addedBy as any)._id?.toString(), name: (g.addedBy as any).name } : null,
      assignedTeam: (g.assignedTeam || []).map((u: any) => ({
        id: u._id?.toString(),
        name: u.name,
      })),
    };
    }));
    res.json(formatted);
  } catch (error) {
    console.error("Failed to fetch groups:", error);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// GET group by ID
router.get("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid group ID format" });
    }
    const group = await Group.findById(req.params.id)
      .populate("addedBy", "name")
      .populate("assignedTeam", "name");
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    res.json({
      id: group._id.toString(),
      groupName: group.groupName,
      totalLeads: group.totalLeads,
      isSelected: group.selected,
      created: group.createdAt,
      addedBy: group.addedBy ? { id: (group.addedBy as any)._id?.toString(), name: (group.addedBy as any).name } : null,
      assignedTeam: (group.assignedTeam || []).map((u: any) => ({ id: u._id?.toString(), name: u.name })),
    });
  } catch (error) {
    console.error("Failed to fetch group:", error);
    res.status(500).json({ error: "Failed to fetch group" });
  }
});

// POST create group
router.post("/", async (req, res) => {
  try {
    const { groupName, assignedTeam } = req.body;
    if (!groupName || !groupName.toString().trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }
    const addedById = req.body.addedBy || req.headers["x-user-id"];
    let addedBy: mongoose.Types.ObjectId | null = null;
    if (addedById && isValidObjectId(addedById)) {
      addedBy = new mongoose.Types.ObjectId(addedById);
    }
    const firstUser = await User.findOne();
    if (!addedBy && firstUser) addedBy = firstUser._id;
    if (!addedBy) {
      return res.status(400).json({ error: "Could not determine user to set as addedBy" });
    }
    const teamIds: mongoose.Types.ObjectId[] = [];
    if (Array.isArray(assignedTeam)) {
      for (const id of assignedTeam) {
        if (id && isValidObjectId(id)) teamIds.push(new mongoose.Types.ObjectId(id));
      }
    }
    const group = await Group.create({
      groupName: groupName.trim(),
      totalLeads: 0,
      selected: true,
      addedBy,
      assignedTeam: teamIds,
    });
    const populated = await Group.findById(group._id)
      .populate("addedBy", "name")
      .populate("assignedTeam", "name");
    res.status(201).json({
      id: group._id.toString(),
      groupName: populated!.groupName,
      totalLeads: populated!.totalLeads,
      isSelected: populated!.selected,
      created: populated!.createdAt,
      addedBy: (populated!.addedBy as any) ? { id: (populated!.addedBy as any)._id?.toString(), name: (populated!.addedBy as any).name } : null,
      assignedTeam: (populated!.assignedTeam || []).map((u: any) => ({ id: u._id?.toString(), name: u.name })),
    });
  } catch (error) {
    console.error("Failed to create group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
});

// PUT update group
router.put("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid group ID format" });
    }
    const { groupName, assignedTeam, totalLeads } = req.body;
    const update: any = {};
    if (typeof groupName === "string" && groupName.trim()) update.groupName = groupName.trim();
    if (typeof totalLeads === "number" && totalLeads >= 0) update.totalLeads = totalLeads;
    if (Array.isArray(assignedTeam)) {
      update.assignedTeam = assignedTeam
        .filter((id: string) => id && isValidObjectId(id))
        .map((id: string) => new mongoose.Types.ObjectId(id));
    }
    const group = await Group.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    )
      .populate("addedBy", "name")
      .populate("assignedTeam", "name");
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    res.json({
      id: group._id.toString(),
      groupName: group.groupName,
      totalLeads: group.totalLeads,
      isSelected: group.selected,
      created: group.createdAt,
      addedBy: group.addedBy ? { id: (group.addedBy as any)._id?.toString(), name: (group.addedBy as any).name } : null,
      assignedTeam: (group.assignedTeam || []).map((u: any) => ({ id: u._id?.toString(), name: u.name })),
    });
  } catch (error) {
    console.error("Failed to update group:", error);
    res.status(500).json({ error: "Failed to update group" });
  }
});

// PUT toggle isSelected
router.put("/:id/toggle", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid group ID format" });
    }
    const group = await Group.findByIdAndUpdate(
      req.params.id,
      { $set: { selected: req.body.isSelected ?? true } },
      { new: true }
    )
      .populate("addedBy", "name")
      .populate("assignedTeam", "name");
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    res.json({
      id: group._id.toString(),
      groupName: group.groupName,
      totalLeads: group.totalLeads,
      isSelected: group.selected,
      created: group.createdAt,
      addedBy: group.addedBy ? { id: (group.addedBy as any)._id?.toString(), name: (group.addedBy as any).name } : null,
      assignedTeam: (group.assignedTeam || []).map((u: any) => ({ id: u._id?.toString(), name: u.name })),
    });
  } catch (error) {
    console.error("Failed to toggle group:", error);
    res.status(500).json({ error: "Failed to toggle group" });
  }
});

// POST copy group
router.post("/:id/copy", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid group ID format" });
    }
    const original = await Group.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ error: "Group not found" });
    }
    const copy = await Group.create({
      groupName: `${original.groupName} (Copy)`,
      totalLeads: 0,
      selected: original.selected,
      addedBy: original.addedBy,
      assignedTeam: original.assignedTeam || [],
    });
    const populated = await Group.findById(copy._id)
      .populate("addedBy", "name")
      .populate("assignedTeam", "name");
    res.status(201).json({
      id: copy._id.toString(),
      groupName: populated!.groupName,
      totalLeads: populated!.totalLeads,
      isSelected: populated!.selected,
      created: populated!.createdAt,
      addedBy: (populated!.addedBy as any) ? { id: (populated!.addedBy as any)._id?.toString(), name: (populated!.addedBy as any).name } : null,
      assignedTeam: (populated!.assignedTeam || []).map((u: any) => ({ id: u._id?.toString(), name: u.name })),
    });
  } catch (error) {
    console.error("Failed to copy group:", error);
    res.status(500).json({ error: "Failed to copy group" });
  }
});

// DELETE group
router.delete("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid group ID format" });
    }
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error("Failed to delete group:", error);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

export default router;
