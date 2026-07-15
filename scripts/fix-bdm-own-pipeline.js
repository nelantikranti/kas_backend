/**
 * One-time fix: strip leads:view_all from Business Development Manager so each
 * BDM only sees their own leads / pipeline (scoped by pipeline creator).
 * Also ensures Manager role has pipelines:view_all for leadership oversight.
 *
 * Run from kas_backend:
 *   node scripts/fix-bdm-own-pipeline.js
 */
const mongoose = require("mongoose");
require("dotenv").config();

const ROLE_NAME = "Business Development Manager";
const PERM_TO_REMOVE = "leads:view_all";
const PIPELINES_VIEW_ALL = "pipelines:view_all";

function stripFromPermissionArray(permissions) {
  if (!Array.isArray(permissions)) return { next: permissions, changed: false };
  const next = permissions.filter((p) => p !== PERM_TO_REMOVE);
  return { next, changed: next.length !== permissions.length };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const roles = db.collection("roles");
  const overrides = db.collection("rolepermissionoverrides");
  const users = db.collection("users");

  const roleDoc = await roles.findOne({ name: ROLE_NAME });
  if (roleDoc) {
    const { next, changed } = stripFromPermissionArray(roleDoc.permissions);
    if (changed) {
      await roles.updateOne(
        { _id: roleDoc._id },
        { $set: { permissions: next, updatedAt: new Date() } }
      );
      console.log(`Role "${ROLE_NAME}": removed ${PERM_TO_REMOVE}`);
    } else {
      console.log(`Role "${ROLE_NAME}": no ${PERM_TO_REMOVE} (or role perms empty)`);
    }
  } else {
    console.log(`Role "${ROLE_NAME}" not found in roles collection`);
  }

  const overrideDoc = await overrides.findOne({ role: ROLE_NAME });
  if (overrideDoc) {
    const { next, changed } = stripFromPermissionArray(overrideDoc.permissions);
    if (changed) {
      await overrides.updateOne(
        { _id: overrideDoc._id },
        { $set: { permissions: next, updatedAt: new Date() } }
      );
      console.log(`RolePermissionOverride "${ROLE_NAME}": removed ${PERM_TO_REMOVE}`);
    } else {
      console.log(`RolePermissionOverride "${ROLE_NAME}": no ${PERM_TO_REMOVE}`);
    }
  } else {
    console.log(`No RolePermissionOverride for "${ROLE_NAME}"`);
  }

  const managerRole = await roles.findOne({ name: "Manager" });
  if (managerRole) {
    const perms = Array.isArray(managerRole.permissions) ? [...managerRole.permissions] : [];
    let changed = false;
    if (!perms.includes(PIPELINES_VIEW_ALL)) {
      perms.push(PIPELINES_VIEW_ALL);
      changed = true;
    }
    if (!perms.includes("pipelines:view")) {
      perms.push("pipelines:view");
      changed = true;
    }
    if (changed) {
      await roles.updateOne(
        { _id: managerRole._id },
        { $set: { permissions: perms, updatedAt: new Date() } }
      );
      console.log(`Role "Manager": added pipeline view permissions`);
    } else {
      console.log(`Role "Manager": already has pipeline view-all`);
    }
  }

  const roleBased = await users.updateMany(
    { role: ROLE_NAME, permissionSource: "role" },
    { $set: { permissions: [] } }
  );
  console.log(
    `Cleared stale permissions for ${roleBased.modifiedCount} ${ROLE_NAME} user(s) using role source`
  );

  const customUsers = await users
    .find({
      role: ROLE_NAME,
      permissions: PERM_TO_REMOVE,
    })
    .toArray();

  let customUpdated = 0;
  for (const u of customUsers) {
    const { next, changed } = stripFromPermissionArray(u.permissions);
    if (changed) {
      await users.updateOne({ _id: u._id }, { $set: { permissions: next } });
      customUpdated += 1;
    }
  }
  console.log(
    `Removed ${PERM_TO_REMOVE} from ${customUpdated} ${ROLE_NAME} user(s) with custom permissions`
  );

  const seWithViewAll = await users.countDocuments({
    role: "Sales Executive",
    permissions: PERM_TO_REMOVE,
  });
  if (seWithViewAll > 0) {
    console.log(
      `Note: ${seWithViewAll} Sales Executive user(s) still have ${PERM_TO_REMOVE} in custom permissions.`
    );
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
