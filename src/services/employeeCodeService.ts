import User from "../models/User";

const KAS_CODE_RE = /^KAS(\d+)$/i;
const LEGACY_CODE_RE = /^E(\d+)$/i;

export function formatEmployeeCode(n: number): string {
  return `KAS${String(n).padStart(3, "0")}`;
}

function parseCodeNumber(code: string): number | null {
  const kas = code.match(KAS_CODE_RE);
  if (kas) return parseInt(kas[1], 10);
  const legacy = code.match(LEGACY_CODE_RE);
  if (legacy) return parseInt(legacy[1], 10);
  return null;
}

export function isValidEmployeeCode(code: string): boolean {
  return KAS_CODE_RE.test(code) || LEGACY_CODE_RE.test(code);
}

export async function getMaxEmployeeCodeNumber(): Promise<number> {
  const users = await User.find({ employeeId: { $exists: true, $ne: "" } }).select("employeeId").lean();
  let max = 0;
  for (const u of users) {
    const n = parseCodeNumber(String(u.employeeId || ""));
    if (n != null) max = Math.max(max, n);
  }
  return max;
}

/** Convert legacy E### codes to KAS### with the same number. */
export async function migrateLegacyEmployeeCodes(): Promise<number> {
  const users = await User.find({ employeeId: LEGACY_CODE_RE }).select("_id employeeId").lean();
  let updated = 0;
  for (const u of users) {
    const m = String(u.employeeId || "").match(LEGACY_CODE_RE);
    if (!m) continue;
    const newCode = formatEmployeeCode(parseInt(m[1], 10));
    await User.updateOne({ _id: u._id }, { $set: { employeeId: newCode } });
    updated += 1;
  }
  return updated;
}

export async function assignEmployeeCode(userId: string): Promise<string> {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  if (user.employeeId && KAS_CODE_RE.test(user.employeeId)) return user.employeeId;

  if (user.employeeId && LEGACY_CODE_RE.test(user.employeeId)) {
    const m = user.employeeId.match(LEGACY_CODE_RE)!;
    user.employeeId = formatEmployeeCode(parseInt(m[1], 10));
    await user.save();
    return user.employeeId;
  }

  const max = await getMaxEmployeeCodeNumber();
  user.employeeId = formatEmployeeCode(max + 1);
  await user.save();
  return user.employeeId;
}

/** Assign KAS### codes to all active/inactive employees missing a valid code. */
export async function backfillEmployeeCodes(): Promise<number> {
  await migrateLegacyEmployeeCodes();

  const users = await User.find({ status: { $in: ["Active", "Inactive"] } })
    .sort({ createdAt: 1 })
    .select("_id employeeId");

  let max = await getMaxEmployeeCodeNumber();
  let updated = 0;

  for (const user of users) {
    if (user.employeeId && KAS_CODE_RE.test(user.employeeId)) continue;
    max += 1;
    await User.updateOne({ _id: user._id }, { $set: { employeeId: formatEmployeeCode(max) } });
    updated += 1;
  }
  return updated;
}
