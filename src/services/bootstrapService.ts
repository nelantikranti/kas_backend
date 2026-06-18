import { backfillEmployeeCodes, applyEmployeeCodeRegistry, migrateLegacyEmployeeCodes } from "./employeeCodeService";
import { seedRolesIfNeeded } from "./roleService";

export async function runHrBootstrap(): Promise<void> {
  try {
    await seedRolesIfNeeded();
    const seeded = await applyEmployeeCodeRegistry();
    if (seeded > 0) console.log(`✅ Applied ${seeded} official employee code(s) from registry`);
    const migrated = await migrateLegacyEmployeeCodes();
    if (migrated > 0) console.log(`✅ Cleared ${migrated} legacy KAS/E employee code(s)`);
    const n = await backfillEmployeeCodes();
    if (n > 0) console.log(`✅ Assigned employee codes to ${n} user(s)`);
  } catch (e: unknown) {
    console.warn("⚠️  HR bootstrap skipped:", e instanceof Error ? e.message : e);
  }
}
