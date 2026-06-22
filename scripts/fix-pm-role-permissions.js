/**
 * One-time fix: ensure Project Manager role includes leads:view_all (BDM filter) and related lead perms.
 * Run: node scripts/fix-pm-role-permissions.js
 */
const mongoose = require("mongoose");
require("dotenv").config();

const PM_PERMISSIONS = [
  "dashboard:view",
  "leads:view",
  "leads:view_all",
  "projects:view",
  "projects:create",
  "projects:edit",
  "projects:delete",
  "projects:assign",
  "document:upload",
  "document:delete",
  "expense:view",
  "expense:edit",
  "expense:add",
  "expense:delete",
  "quotations:view",
  "quotations:approve",
  "hr:leave_request",
  "hr:attendance_self",
  "hr:timesheet_submit",
  "hr:payslip_self",
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const roles = mongoose.connection.db.collection("roles");
  const users = mongoose.connection.db.collection("users");

  const roleResult = await roles.updateOne(
    { name: "Project Manager" },
    { $set: { permissions: PM_PERMISSIONS, updatedAt: new Date() } }
  );
  console.log("Role update:", roleResult.modifiedCount ? "updated" : "no change or not found");

  // Clear stale permission arrays on PM users using role-based permissions
  const userResult = await users.updateMany(
    { role: "Project Manager", permissionSource: "role" },
    { $set: { permissions: [] } }
  );
  console.log("Cleared stale user permissions for", userResult.modifiedCount, "Project Manager user(s)");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
