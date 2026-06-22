import type { Request } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import { PERMISSIONS } from "./permissions";

/** Admin or users with View All Leads can reassign leads between BDMs. */
export function canManageLeadAssignments(req: Request): boolean {
  return (
    req.user?.role === "Admin" ||
    !!req.user?.permissions?.includes(PERMISSIONS.LEADS_VIEW_ALL)
  );
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mongo filter: non-admin users only see leads where assignedToUserId matches their id. */
export function buildAssigneeMatchOrConditions(req: {
  user?: { id?: string; name?: string; email?: string };
}): object[] {
  const uid = req.user?.id;
  if (uid && mongoose.Types.ObjectId.isValid(uid)) {
    return [{ assignedToUserId: new mongoose.Types.ObjectId(uid) }];
  }
  return [];
}

export function userCanAccessLead(
  req: { user?: { id?: string; name?: string; email?: string } },
  lead: { assignedTo?: string; assignedToUserId?: mongoose.Types.ObjectId | null | string | undefined }
): boolean {
  const uid = req.user?.id;
  if (!uid) return false;
  const luid = lead.assignedToUserId;
  if (luid == null || luid === undefined) return false;
  const idStr = typeof luid === "string" ? luid : (luid as mongoose.Types.ObjectId).toString();
  return idStr === uid;
}

export async function resolveAssigneeFields(leadData: {
  assignedTo?: string;
  assignedToUserId?: string;
}): Promise<{ assignedTo: string; assignedToUserId: mongoose.Types.ObjectId | null }> {
  let assignedTo = typeof leadData.assignedTo === "string" ? leadData.assignedTo.trim() : "";
  if (assignedTo.toLowerCase() === "unassigned") {
    return { assignedTo: "Unassigned", assignedToUserId: null };
  }
  const rawUid = leadData.assignedToUserId;
  if (rawUid && mongoose.Types.ObjectId.isValid(String(rawUid))) {
    const u = await User.findById(rawUid).select("name email");
    if (u) {
      return {
        assignedTo: (u.name || u.email || assignedTo || "Unassigned").trim(),
        assignedToUserId: u._id as mongoose.Types.ObjectId,
      };
    }
  }
  if (assignedTo && assignedTo.toLowerCase() !== "unassigned") {
    const u = await User.findOne({
      $or: [
        { name: assignedTo },
        { email: assignedTo.toLowerCase() },
        { name: { $regex: new RegExp(`^${escapeRegex(assignedTo)}$`, "i") } },
      ],
    })
      .select("name email")
      .lean();
    if (u && u._id) {
      return {
        assignedTo: ((u as any).name || (u as any).email || assignedTo).trim(),
        assignedToUserId: new mongoose.Types.ObjectId((u as any)._id.toString()),
      };
    }
  }
  if (!assignedTo) assignedTo = "Unassigned";
  return { assignedTo, assignedToUserId: null };
}
