import express from "express";
import Role from "../models/Role";
import { authenticate } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { PERMISSIONS, isRegisteredPermission } from "../utils/permissions";
import { createRole, deleteRole, listRoleNames, updateRole } from "../services/roleService";

const router = express.Router();
router.use(authenticate);

router.get("/", checkPermission(PERMISSIONS.USERS_MANAGE), async (_req, res) => {
  try {
    const roles = await Role.find().sort({ sortOrder: 1, name: 1 }).lean();
    res.json(
      roles.map((r) => ({
        id: r._id.toString(),
        name: r.name,
        permissions: r.permissions || [],
        isSystem: r.isSystem,
        sortOrder: r.sortOrder,
      }))
    );
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load roles" });
  }
});

router.get("/names", async (_req, res) => {
  try {
    const names = await listRoleNames();
    res.json({ roles: names });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load roles" });
  }
});

router.post("/", checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const raw = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    const permissions = raw.map(String).filter((p: string) => isRegisteredPermission(p));
    const role = await createRole(name, permissions);
    res.status(201).json({ id: role._id.toString(), name: role.name, permissions: role.permissions, isSystem: role.isSystem });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Failed to create role" });
  }
});

router.put("/:id", checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    const raw = Array.isArray(req.body.permissions) ? req.body.permissions : undefined;
    const permissions = raw ? raw.map(String).filter((p: string) => isRegisteredPermission(p)) : undefined;
    const role = await updateRole(String(req.params.id), {
      name: req.body.name ? String(req.body.name).trim() : undefined,
      permissions,
    });
    res.json({ id: role._id.toString(), name: role.name, permissions: role.permissions, isSystem: role.isSystem });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Failed to update role" });
  }
});

router.delete("/:id", checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    await deleteRole(String(req.params.id));
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Failed to delete role" });
  }
});

export default router;
