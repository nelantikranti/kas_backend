import type { Request } from "express";
import mongoose from "mongoose";
import Group from "../models/Group";
import Lead from "../models/Lead";
import { escapeRegex } from "./leadAssignee";
import { PERMISSIONS } from "./permissions";

/**
 * Full pipeline list/board (other BDMs' pipelines).
 * Admin & Manager only — NOT Project Manager / leads:view_all.
 * Override with pipelines:view_all if needed for specific users.
 */
export function canViewAllPipelines(req: Request): boolean {
  const role = req.user?.role;
  if (role === "Admin" || role === "Manager") return true;
  return !!req.user?.permissions?.includes(PERMISSIONS.PIPELINES_VIEW_ALL);
}

/** Broad group visibility still follows Admin / View All Leads. */
export function canViewAllGroups(req: Request): boolean {
  return (
    req.user?.role === "Admin" ||
    req.user?.role === "Manager" ||
    !!req.user?.permissions?.includes(PERMISSIONS.LEADS_VIEW_ALL)
  );
}

/**
 * Group IDs a scoped user may access:
 * - listed on the group's assignedTeam, or
 * - created the group (addedBy), or
 * - has at least one lead assigned in that group.
 */
export async function getAccessibleGroupIdsForUser(
  userId: string
): Promise<mongoose.Types.ObjectId[]> {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return [];

  const uid = new mongoose.Types.ObjectId(userId);
  const [teamOrCreatedGroups, leadGroupIds] = await Promise.all([
    Group.find({ $or: [{ assignedTeam: uid }, { addedBy: uid }] })
      .select("_id")
      .lean(),
    Lead.distinct("group", { assignedToUserId: uid, group: { $ne: null } }),
  ]);

  const idSet = new Set<string>();
  for (const g of teamOrCreatedGroups) {
    idSet.add(g._id.toString());
  }
  for (const gid of leadGroupIds) {
    if (gid) idSet.add(gid.toString());
  }

  return Array.from(idSet).map((id) => new mongoose.Types.ObjectId(id));
}

/**
 * Own pipelines = ones the user created (addedBy).
 * Shared regional groups like Hyderabad must NOT unlock every pipeline on that group.
 */
export async function buildScopedPipelineQuery(
  req: Request,
  baseQuery: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  if (canViewAllPipelines(req)) return baseQuery;

  const userId = req.user?.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return { ...baseQuery, _id: { $exists: false } };
  }

  const uid = new mongoose.Types.ObjectId(userId);
  const userName = String(req.user?.name || "").trim();

  // Primary: creator. Secondary: pipeline name starts with the user's name
  // (covers "Mahender - phone" style only when the BDM's account name matches).
  const ownershipOr: Record<string, unknown>[] = [{ addedBy: uid }];
  if (userName.length >= 2) {
    ownershipOr.push({
      pipelineName: { $regex: `^${escapeRegex(userName)}`, $options: "i" },
    });
  }

  const ownership: Record<string, unknown> = { $or: ownershipOr };

  if (Object.keys(baseQuery).length === 0) return ownership;
  return { $and: [baseQuery, ownership] };
}

export async function userCanAccessPipeline(
  req: Request,
  pipeline: {
    pipelineName?: string;
    addedBy?: mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId } | string | null;
    group?:
      | mongoose.Types.ObjectId
      | { _id?: mongoose.Types.ObjectId; assignedTeam?: Array<mongoose.Types.ObjectId | { _id?: mongoose.Types.ObjectId }> }
      | null;
  }
): Promise<boolean> {
  if (canViewAllPipelines(req)) return true;

  const userId = req.user?.id;
  if (!userId) return false;

  const addedById =
    typeof pipeline.addedBy === "string"
      ? pipeline.addedBy
      : pipeline.addedBy && typeof pipeline.addedBy === "object" && "_id" in pipeline.addedBy
        ? pipeline.addedBy._id?.toString()
        : (pipeline.addedBy as mongoose.Types.ObjectId | undefined)?.toString();

  if (addedById === userId) return true;

  const userName = String(req.user?.name || "").trim().toLowerCase();
  const pipelineName = String(pipeline.pipelineName || "").trim().toLowerCase();
  if (userName.length >= 2 && pipelineName.startsWith(userName)) {
    return true;
  }

  return false;
}

/** Lead filter for pipeline boards / counts when the user cannot view all. */
export function buildScopedLeadFilter(
  req: Request,
  groupId: mongoose.Types.ObjectId | string
): Record<string, unknown> {
  const filter: Record<string, unknown> = { group: groupId };
  if (canViewAllPipelines(req)) return filter;

  const userId = req.user?.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    filter._id = { $exists: false };
    return filter;
  }

  filter.assignedToUserId = new mongoose.Types.ObjectId(userId);
  return filter;
}
