/** Official employee codes — matched to employee name on bootstrap / assign. */
export const EMPLOYEE_CODE_REGISTRY: Record<string, number> = {
  vikram: 1102,
  "ankita sankla": 1103,
  "mustafa kaif": 1104,
  "k srinivas": 1105,
  "mamidi kepha": 1106,
  sudheer: 1107,
  "i karthik": 1108,
  "kongala indraja": 1109,
  "m kameswari": 1110,
  "gyana jyothi": 1111,
  "devi varun": 1112,
  navanchand: 1113,
  anthony: 1114,
  ganesh: 1115,
  "vikas kumar": 1116,
  "praveen dornala": 1117,
  manikanta: 1118,
  "arman shaik": 1119,
  "syed mushtaque ali": 1120,
  "addanki krishna": 1121,
  "godishala sai kiran": 1123,
  "archana menon": 1124,
  "abhilash dhas": 1125,
  "nithin v j": 1126,
  "shibin shibu": 1127,
  amal: 1128,
  savio: 1129,
  "anup kumar singh": 1130,
  "swapnil rai": 1131,
  "nethi kavya": 1132,
  "katha raha": 1133,
  "akshay reddy": 1134,
  "ethakota sruthi": 1135,
  // First-name aliases (when profile uses short name)
  abhilash: 1125,
  archana: 1124,
  praveen: 1117,
  swapnil: 1131,
  ankita: 1103,
  mustafa: 1104,
  srinivas: 1105,
  kepha: 1106,
  karthik: 1108,
  indraja: 1109,
  kameswari: 1110,
  varun: 1112,
  vikas: 1116,
  arman: 1119,
  kavya: 1132,
  sruthi: 1135,
  akshay: 1134,
};

export const EMPLOYEE_CODE_START = 1102;

export const EMPLOYEE_CODE_REGISTRY_MAX = Math.max(...Object.values(EMPLOYEE_CODE_REGISTRY));

export function normalizeEmployeeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupRegistryEmployeeCode(name: string): number | null {
  const normalized = normalizeEmployeeName(name);
  if (!normalized) return null;

  if (EMPLOYEE_CODE_REGISTRY[normalized] != null) {
    return EMPLOYEE_CODE_REGISTRY[normalized];
  }

  for (const [key, code] of Object.entries(EMPLOYEE_CODE_REGISTRY)) {
    if (normalized === key) return code;
    const keyTokens = key.split(" ").filter(Boolean);
    if (keyTokens.length > 1 && keyTokens.every((token) => normalized.includes(token))) {
      return code;
    }
  }
  return null;
}
