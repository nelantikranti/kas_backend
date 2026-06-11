import Role from "../models/Role";
import User from "../models/User";
import { USER_ROLES } from "../constants/hr";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "../utils/permissions";

export async function seedRolesIfNeeded(): Promise<void> {
  const count = await Role.countDocuments();
  if (count > 0) return;

  const allPerms = Object.values(PERMISSIONS);
  let order = 0;
  for (const name of USER_ROLES) {
    const perms =
      name === "Admin"
        ? allPerms
        : DEFAULT_ROLE_PERMISSIONS[name as keyof typeof DEFAULT_ROLE_PERMISSIONS] || [];
    await Role.create({
      name,
      permissions: perms,
      isSystem: name === "Admin" || name === "HR",
      sortOrder: order++,
    });
  }
}

export async function listRoleNames(): Promise<string[]> {
  await seedRolesIfNeeded();
  const rows = await Role.find().sort({ sortOrder: 1, name: 1 }).select("name").lean();
  return rows.map((r) => r.name);
}

export async function isValidRoleName(name: string): Promise<boolean> {
  await seedRolesIfNeeded();
  const row = await Role.findOne({ name }).lean();
  return !!row;
}

export async function createRole(name: string, permissions: string[] = []): Promise<InstanceType<typeof Role>> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Role name is required");
  const exists = await Role.findOne({ name: trimmed });
  if (exists) throw new Error("Role already exists");
  const maxOrder = await Role.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
  return Role.create({
    name: trimmed,
    permissions,
    isSystem: false,
    sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
  });
}

export async function updateRole(
  roleId: string,
  data: { name?: string; permissions?: string[] }
): Promise<InstanceType<typeof Role>> {
  const role = await Role.findById(roleId);
  if (!role) throw new Error("Role not found");
  if (role.name === "Admin") throw new Error("Admin role cannot be modified");

  if (data.name && data.name.trim() !== role.name) {
    const trimmed = data.name.trim();
    const dup = await Role.findOne({ name: trimmed, _id: { $ne: role._id } });
    if (dup) throw new Error("Role name already exists");
    const oldName = role.name;
    role.name = trimmed;
    await User.updateMany({ role: oldName }, { $set: { role: trimmed } });
  }
  if (data.permissions) role.permissions = data.permissions;
  await role.save();
  return role;
}

export async function deleteRole(roleId: string): Promise<void> {
  const role = await Role.findById(roleId);
  if (!role) throw new Error("Role not found");
  if (role.isSystem) throw new Error("System roles cannot be deleted");
  const inUse = await User.countDocuments({ role: role.name });
  if (inUse > 0) throw new Error(`Cannot delete role — ${inUse} user(s) assigned`);
  await role.deleteOne();
}
