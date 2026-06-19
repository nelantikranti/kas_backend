import express from "express";
import mongoose from "mongoose";
import RolePermissionOverride from "../models/RolePermissionOverride";
import { authenticate } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { getEffectiveRolePermissions, PERMISSIONS, isRegisteredPermission } from "../utils/permissions";
import { listRoleNames } from "../services/roleService";

const router = express.Router();

router.use(authenticate);

router.get("/list", checkPermission(PERMISSIONS.USERS_MANAGE), async (_req, res) => {
  const roles = await listRoleNames();
  return res.json({ roles });
});

router.get("/:role", checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable. Please ensure MongoDB is running." });
    }
    const role = String(req.params.role || "").trim();
    const roles = await listRoleNames();
    if (!roles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const permissions = await getEffectiveRolePermissions(role);
    const doc = await RolePermissionOverride.findOne({ role }).lean();
    return res.json({
      role,
      permissions,
      hasOverride: Array.isArray(doc?.permissions) && doc.permissions.length > 0,
    });
  } catch (e: any) {
    console.error("Failed to fetch role permissions:", e);
    return res.status(500).json({ error: "Failed to fetch role permissions" });
  }
});

router.put("/:role", checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable. Please ensure MongoDB is running." });
    }
    const role = String(req.params.role || "").trim();
    const roles = await listRoleNames();
    if (!roles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (role === "Admin") {
      return res.status(400).json({ error: "Admin permissions are always full access and cannot be edited." });
    }

    const raw = Array.isArray(req.body?.permissions) ? (req.body.permissions as unknown[]) : [];
    const cleaned = raw.map((p) => String(p)).filter((p) => isRegisteredPermission(p));
    const unique = [...new Set(cleaned)];
    // If caller sent permissions but none are valid, surface a 400 instead of silently saving empty.
    if (raw.length > 0 && unique.length === 0) {
      return res.status(400).json({
        error: "Invalid permissions payload",
        message: "No provided permissions match the registered permission list.",
      });
    }

    const saved = await RolePermissionOverride.findOneAndUpdate(
      { role },
      { $set: { role, permissions: unique } },
      // runValidators helps catch enum/schema issues as a 400-class error instead of a generic 500
      { new: true, upsert: true, runValidators: true, context: "query" }
    ).lean();

    return res.json({
      success: true,
      role,
      permissions: Array.isArray(saved?.permissions) ? saved!.permissions : [],
    });
  } catch (e: any) {
    console.error("Failed to update role permissions:", e);
    // Common Mongo error: duplicate key
    if (e?.code === 11000) {
      return res.status(409).json({
        error: "Role permissions already exist",
        message: "A permissions override for this role already exists. Please retry.",
      });
    }
    // Validation / cast errors should be treated as bad requests
    if (e?.name === "ValidationError" || e?.name === "CastError") {
      return res.status(400).json({ error: "Invalid request", message: e?.message || "Invalid request" });
    }
    return res.status(500).json({
      error: "Failed to update role permissions",
      message: e?.message ? String(e.message) : undefined,
    });
  }
});

router.delete("/:role", checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable. Please ensure MongoDB is running." });
    }
    const role = String(req.params.role || "").trim();
    const roles = await listRoleNames();
    if (!roles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (role === "Admin") {
      return res.status(400).json({ error: "Admin permissions are always full access and cannot be deleted." });
    }
    await RolePermissionOverride.deleteOne({ role });
    return res.json({ success: true, role });
  } catch (e: any) {
    console.error("Failed to delete role permissions override:", e);
    return res.status(500).json({ error: "Failed to delete role permissions override" });
  }
});

export default router;

