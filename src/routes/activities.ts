import express, { Request, Response } from "express";
import ActivityLog from "../models/ActivityLog";
import { logActivity } from "../middleware/activityLogger";

const router = express.Router();

// GET /api/activities
// Supports: search, actionType, module, dateFrom, dateTo, page, limit
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      search,
      actionType,
      module: moduleName,
      dateFrom,
      dateTo,
      page = "1",
      limit = "20",
    } = req.query as any;

    const query: any = {};
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (actionType) query.actionType = actionType;
    if (moduleName) query.moduleName = moduleName;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const lim = Math.max(1, parseInt(String(limit), 10) || 20);

    const total = await ActivityLog.countDocuments(query);
    const items = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * lim)
      .limit(lim)
      .lean();

    // Normalize id fields
    const normalized = items.map((it) => ({
      id: it._id?.toString(),
      userId: it.userId,
      userName: it.userName,
      userRole: it.userRole,
      actionType: it.actionType,
      moduleName: it.moduleName,
      description: it.description,
      ipAddress: it.ipAddress,
      deviceInfo: it.deviceInfo,
      status: it.status,
      performedBy: it.performedBy,
      performedByName: it.performedByName,
      performedByRole: it.performedByRole,
      targetId: it.targetId,
      createdAt: it.createdAt,
    }));

    res.json({ items: normalized, total });
  } catch (error) {
    console.error("Failed to fetch activities:", error);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

// GET /api/activities/export - returns CSV
router.get("/export", async (req: Request, res: Response) => {
  try {
    const { search, actionType, module: moduleName, dateFrom, dateTo } = req.query as any;
    const query: any = {};
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (actionType) query.actionType = actionType;
    if (moduleName) query.moduleName = moduleName;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }

    const items = await ActivityLog.find(query).sort({ createdAt: -1 }).lean();
    const normalized = items.map((it) => ({
      userName: it.userName,
      userRole: it.userRole || "",
      actionType: it.actionType,
      moduleName: it.moduleName || "",
      description: it.description || "",
      date: it.createdAt ? it.createdAt.toISOString().split("T")[0] : "",
      time: it.createdAt ? it.createdAt.toISOString().split("T")[1] : "",
      ipAddress: it.ipAddress || "",
      deviceInfo: it.deviceInfo || "",
      status: it.status || "",
    }));

    // Build CSV manually to avoid external dependency
    const fields = Object.keys(normalized[0] || {});
    const header = fields.join(",");
    const rows = normalized.map((rowObj) =>
      fields
        .map((f) => {
          const val = (rowObj as any)[f] !== undefined && (rowObj as any)[f] !== null ? String((rowObj as any)[f]) : "";
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-disposition", `attachment; filename=activities-${Date.now()}.csv`);
    res.set("Content-Type", "text/csv");
    res.status(200).send(csv);
  } catch (error) {
    console.error("Failed to export activities:", error);
    res.status(500).json({ error: "Failed to export activities" });
  }
});

// Optional: endpoint to create an activity manually
router.post("/", async (req: Request, res: Response) => {
  try {
    const activity = await logActivity({
      userId: req.body.userId,
      userName: req.body.userName || "System",
      userRole: req.body.userRole,
      actionType: req.body.actionType,
      moduleName: req.body.moduleName,
      description: req.body.description,
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] as string,
      status: req.body.status || "Success",
    });

    if (!activity) return res.status(500).json({ error: "Failed to create activity" });
    res.status(201).json({ id: activity._id.toString() });
  } catch (error) {
    console.error("Failed to create activity:", error);
    res.status(500).json({ error: "Failed to create activity" });
  }
});

export default router;



