import { backfillEmployeeCodes, migrateLegacyEmployeeCodes } from "./employeeCodeService";
import { seedRolesIfNeeded } from "./roleService";

export async function runHrBootstrap(): Promise<void> {
  try {
    await seedRolesIfNeeded();
    const migrated = await migrateLegacyEmployeeCodes();
    if (migrated > 0) console.log(`✅ Migrated ${migrated} employee code(s) to KAS format`);
    const n = await backfillEmployeeCodes();
    if (n > 0) console.log(`✅ Assigned employee codes to ${n} user(s)`);
  } catch (e: unknown) {
    console.warn("⚠️  HR bootstrap skipped:", e instanceof Error ? e.message : e);
  }
}
