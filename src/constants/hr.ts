export const DEFAULT_ONBOARDING_CHECKLIST = [
  { key: "profile_complete", label: "Complete employee profile", completed: false },
  { key: "documents_uploaded", label: "Upload ID / onboarding documents", completed: false },
  { key: "policy_acknowledged", label: "Acknowledge company policies", completed: false },
  { key: "manager_assigned", label: "Reporting manager assigned", completed: false },
  { key: "system_access", label: "System access verified", completed: false },
] as const;

export const USER_ROLES = [
  "Admin",
  "HR",
  "Sales Executive",
  "Service Engineer",
  "Project Manager",
  "Accounts",
  "Manager",
  "Technician",
  "Accountant",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
