import User from "../models/User";

const CODE_RE = /^E(\d+)$/i;

export function formatEmployeeCode(n: number): string {
  return `E${String(n).padStart(3, "0")}`;
}

export async function getMaxEmployeeCodeNumber(): Promise<number> {
  const users = await User.find({ employeeId: CODE_RE }).select("employeeId").lean();
  let max = 0;
  for (const u of users) {
    const m = String(u.employeeId || "").match(CODE_RE);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

export async function assignEmployeeCode(userId: string): Promise<string> {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  if (user.employeeId && CODE_RE.test(user.employeeId)) return user.employeeId;

  const max = await getMaxEmployeeCodeNumber();
  user.employeeId = formatEmployeeCode(max + 1);
  await user.save();
  return user.employeeId;
}

/** Assign E001… codes to all active/inactive employees missing a valid code. */
export async function backfillEmployeeCodes(): Promise<number> {
  const users = await User.find({ status: { $in: ["Active", "Inactive"] } })
    .sort({ createdAt: 1 })
    .select("_id employeeId");

  let max = await getMaxEmployeeCodeNumber();
  let updated = 0;

  for (const user of users) {
    if (user.employeeId && CODE_RE.test(user.employeeId)) continue;
    max += 1;
    await User.updateOne({ _id: user._id }, { $set: { employeeId: formatEmployeeCode(max) } });
    updated += 1;
  }
  return updated;
}
