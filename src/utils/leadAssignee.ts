import mongoose from "mongoose";
import User from "../models/User";

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mongo $or clauses so a user sees leads assigned to them by id or legacy name/email. */
export function buildAssigneeMatchOrConditions(req: {
  user?: { id?: string; name?: string; email?: string };
}): object[] {
  const conditions: object[] = [];
  const uid = req.user?.id;
  const name = (req.user?.name || "").trim();
  const email = (req.user?.email || "").trim();
  if (uid && mongoose.Types.ObjectId.isValid(uid)) {
    conditions.push({ assignedToUserId: new mongoose.Types.ObjectId(uid) });
  }
  if (name) {
    conditions.push({ assignedTo: name });
    conditions.push({ assignedTo: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") } });
  }
  if (email && email.toLowerCase() !== name.toLowerCase()) {
    conditions.push({ assignedTo: email });
    conditions.push({ assignedTo: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") } });
  }
  return conditions;
}

export function userCanAccessLead(
  req: { user?: { id?: string; name?: string; email?: string } },
  lead: { assignedTo?: string; assignedToUserId?: mongoose.Types.ObjectId | null | string | undefined }
): boolean {
  const uid = req.user?.id;
  const luid = lead.assignedToUserId;
  if (uid && luid != null && luid !== undefined) {
    const idStr = typeof luid === "string" ? luid : (luid as mongoose.Types.ObjectId).toString();
    if (idStr === uid) return true;
  }
  const name = (req.user?.name || "").trim();
  const email = (req.user?.email || "").trim();
  const assigned = (lead.assignedTo || "").trim();
  if (!assigned || assigned.toLowerCase() === "unassigned") return false;
  if (name && assigned === name) return true;
  if (email && assigned.toLowerCase() === email.toLowerCase()) return true;
  if (name && assigned.toLowerCase() === name.toLowerCase()) return true;
  return false;
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
