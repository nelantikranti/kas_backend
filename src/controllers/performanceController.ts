import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import Task from "../models/Task";

type ReportRow = {
  userId: string;
  staffName: string;
  email: string;
  role: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  efficiency: number; // 0-100
};

const parseDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * GET /api/performance-report?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Optimized:
 * - One users query
 * - One aggregation query over tasks grouped by assignedTo
 */
export const getPerformanceReport = async (req: Request, res: Response) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Database connection unavailable. Please ensure MongoDB is running.",
      });
    }

    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    // Date filter is optional; applied to task.startDate when provided.
    // If startDate is not set on tasks, those tasks won't be included when filtering is used.
    const match: Record<string, any> = {};
    if (from || to) {
      match.startDate = {};
      if (from) match.startDate.$gte = from;
      if (to) match.startDate.$lte = to;
    }

    const users = await User.find({ status: "Active" }).select("_id name email role").lean();

    const taskAgg = await Task.aggregate<{
      _id: mongoose.Types.ObjectId;
      totalTasks: number;
      completedTasks: number;
      pendingTasks: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: "$assignedTo",
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          pendingTasks: {
            $sum: { $cond: [{ $in: ["$status", ["pending", "in_progress"]] }, 1, 0] },
          },
        },
      },
    ]);

    const byUserId = new Map(
      taskAgg.map((r) => [r._id.toString(), { total: r.totalTasks, completed: r.completedTasks, pending: r.pendingTasks }])
    );

    const report: ReportRow[] = users.map((u: any) => {
      const counts = byUserId.get(u._id.toString()) || { total: 0, completed: 0, pending: 0 };
      const efficiency = counts.total > 0 ? Math.round((counts.completed / counts.total) * 1000) / 10 : 0; // 1 decimal
      return {
        userId: u._id.toString(),
        staffName: u.name || u.email,
        email: u.email,
        role: u.role,
        totalTasks: counts.total,
        completedTasks: counts.completed,
        pendingTasks: counts.pending,
        efficiency,
      };
    });

    return res.json({
      meta: {
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
        generatedAt: new Date().toISOString(),
      },
      data: report,
    });
  } catch (error) {
    console.error("Error generating performance report:", error);
    return res.status(500).json({ error: "Failed to generate performance report" });
  }
};

