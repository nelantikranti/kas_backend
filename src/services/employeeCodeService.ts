import User from "../models/User";
import {
  EMPLOYEE_CODE_START,
  lookupRegistryEmployeeCode,
} from "../constants/employeeCodeRegistry";

const NUMERIC_CODE_RE = /^(\d{4,})$/;
const LEGACY_KAS_RE = /^KAS(\d+)$/i;
const LEGACY_E_RE = /^E(\d+)$/i;

export function formatEmployeeCode(n: number): string {
  return String(n);
}

function parseCodeNumber(code: string): number | null {
  const numeric = code.match(NUMERIC_CODE_RE);
  if (numeric) return parseInt(numeric[1], 10);
  return null;
}

export function isValidEmployeeCode(code: string): boolean {
  return NUMERIC_CODE_RE.test(code.trim());
}

export async function getMaxEmployeeCodeNumber(): Promise<number> {
  const users = await User.find({ employeeId: { $exists: true, $ne: "" } }).select("employeeId").lean();
  let max = 0;
  for (const u of users) {
    const n = parseCodeNumber(String(u.employeeId || "").trim());
    if (n != null) max = Math.max(max, n);
  }
  return max;
}

async function reserveEmployeeCode(code: string, userId: string): Promise<void> {
  await User.updateMany(
    { employeeId: code, _id: { $ne: userId } },
    { $set: { employeeId: "" } }
  );
}

/** Apply official codes to existing employees by name. */
export async function applyEmployeeCodeRegistry(): Promise<number> {
  const users = await User.find({ status: { $in: ["Active", "Inactive", "Pending"] } })
    .select("_id name employeeId")
    .sort({ createdAt: 1 });

  let updated = 0;
  for (const user of users) {
    const registryCode = lookupRegistryEmployeeCode(user.name || "");
    if (registryCode == null) continue;

    const code = formatEmployeeCode(registryCode);
    if (user.employeeId === code) continue;

    await reserveEmployeeCode(code, user._id.toString());
    await User.updateOne({ _id: user._id }, { $set: { employeeId: code } });
    updated += 1;
  }
  return updated;
}

/** Clear legacy KAS### / E### codes so they can be reassigned. */
export async function migrateLegacyEmployeeCodes(): Promise<number> {
  const users = await User.find({
    $or: [{ employeeId: LEGACY_KAS_RE }, { employeeId: LEGACY_E_RE }],
  })
    .select("_id employeeId name")
    .lean();

  let updated = 0;
  for (const u of users) {
    if (lookupRegistryEmployeeCode(String(u.name || "")) != null) {
      continue;
    }
    await User.updateOne({ _id: u._id }, { $set: { employeeId: "" } });
    updated += 1;
  }
  return updated;
}

export async function assignEmployeeCode(userId: string): Promise<string> {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const current = (user.employeeId || "").trim();
  if (current && isValidEmployeeCode(current)) return current;

  const registryCode = lookupRegistryEmployeeCode(user.name || "");
  if (registryCode != null) {
    const code = formatEmployeeCode(registryCode);
    await reserveEmployeeCode(code, user._id.toString());
    user.employeeId = code;
    await user.save();
    return code;
  }

  if (current && (LEGACY_KAS_RE.test(current) || LEGACY_E_RE.test(current))) {
    user.employeeId = "";
  }

  const max = await getMaxEmployeeCodeNumber();
  const next = max >= EMPLOYEE_CODE_START ? max + 1 : EMPLOYEE_CODE_START;
  user.employeeId = formatEmployeeCode(next);
  await user.save();
  return user.employeeId;
}

/** Assign numeric codes to employees missing a valid code (max existing + 1). */
export async function backfillEmployeeCodes(): Promise<number> {
  const users = await User.find({ status: { $in: ["Active", "Inactive"] } })
    .sort({ createdAt: 1 })
    .select("_id name employeeId");

  let max = await getMaxEmployeeCodeNumber();
  let updated = 0;

  for (const user of users) {
    const current = (user.employeeId || "").trim();
    if (current && isValidEmployeeCode(current)) continue;

    const registryCode = lookupRegistryEmployeeCode(user.name || "");
    if (registryCode != null) {
      const code = formatEmployeeCode(registryCode);
      await reserveEmployeeCode(code, user._id.toString());
      await User.updateOne({ _id: user._id }, { $set: { employeeId: code } });
      max = Math.max(max, registryCode);
      updated += 1;
      continue;
    }

    max = Math.max(max, EMPLOYEE_CODE_START - 1);
    const next = max + 1;
    max = next;
    await User.updateOne({ _id: user._id }, { $set: { employeeId: formatEmployeeCode(next) } });
    updated += 1;
  }
  return updated;
}
