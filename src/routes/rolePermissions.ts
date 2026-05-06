import express from "express";
import mongoose from "mongoose";
import RolePermissions from "../models/RolePermissions";
import { authenticate } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { PERMISSIONS, isRegisteredPermission } from "../utils/permissions";

const router = express.Router();

router.use(authenticate);

const ROLES = ["Admin", "Sales Executive", "Service Engineer", "Project Manager", "Accounts", "Manager", "Technician", "Accountant"] as const;
type RoleName = (typeof ROLES)[number];

router.get("/list", checkPermission(PERMISSIONS.USERS_MANAGE), async (_req, res) => {
  return res.json({ roles: [...ROLES] });
});

router.get("/:role", checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable. Please ensure MongoDB is running." });
    }
    const role = String(req.params.role || "").trim() as RoleName;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const doc = await RolePermissions.findOne({ role }).lean();
    return res.json({ role, permissions: Array.isArray(doc?.permissions) ? doc!.permissions : [] });
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
    const role = String(req.params.role || "").trim() as RoleName;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (role === "Admin") {
      return res.status(400).json({ error: "Admin permissions are always full access and cannot be edited." });
    }

    const raw = Array.isArray(req.body?.permissions) ? (req.body.permissions as string[]) : [];
    const cleaned = raw.map((p) => String(p)).filter((p) => isRegisteredPermission(p));
    const unique = [...new Set(cleaned)];

    const saved = await RolePermissions.findOneAndUpdate(
      { role },
      { $set: { role, permissions: unique } },
      { new: true, upsert: true }
    ).lean();

    return res.json({
      success: true,
      role,
      permissions: Array.isArray(saved?.permissions) ? saved!.permissions : [],
    });
  } catch (e: any) {
    console.error("Failed to update role permissions:", e);
    return res.status(500).json({ error: "Failed to update role permissions" });
  }
});

router.delete("/:role", checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable. Please ensure MongoDB is running." });
    }
    const role = String(req.params.role || "").trim() as RoleName;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    if (role === "Admin") {
      return res.status(400).json({ error: "Admin permissions are always full access and cannot be deleted." });
    }
    await RolePermissions.deleteOne({ role });
    return res.json({ success: true, role });
  } catch (e: any) {
    console.error("Failed to delete role permissions override:", e);
    return res.status(500).json({ error: "Failed to delete role permissions override" });
  }
});

export default router;

