// Master Permission List
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard:view",

  LEADS_VIEW: "leads:view",
  LEADS_CREATE: "leads:create",
  LEADS_EDIT: "leads:edit",
  LEADS_DELETE: "leads:delete",

  QUOTATIONS_VIEW: "quotations:view",
  QUOTATIONS_CREATE: "quotations:create",
  QUOTATIONS_APPROVE: "quotations:approve",

  PROJECTS_VIEW: "projects:view",
  PROJECTS_CREATE: "projects:create",
  PROJECTS_ASSIGN: "projects:assign",

  AMC_VIEW: "amc:view",
  AMC_UPDATE: "amc:update",

  USERS_VIEW: "users:view",
  USERS_MANAGE: "users:manage",

  REPORTS_VIEW: "reports:view",
  SETTINGS_MANAGE: "settings:manage",
  
  FORM_SUBMISSIONS_VIEW: "form_submissions:view",
  FORM_SUBMISSIONS_DELETE: "form_submissions:delete",
  
  DEMO_REQUESTS_VIEW: "demo_requests:view",
  DEMO_REQUESTS_DELETE: "demo_requests:delete",
} as const;

// Get all permission values as array
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// Permission groups for UI organization
export const PERMISSION_GROUPS = [
  {
    label: "Dashboard",
    permissions: [
      { key: PERMISSIONS.DASHBOARD_VIEW, label: "Dashboard View" },
    ],
  },
  {
    label: "Leads",
    permissions: [
      { key: PERMISSIONS.LEADS_VIEW, label: "Leads View" },
      { key: PERMISSIONS.LEADS_CREATE, label: "Leads Create" },
      { key: PERMISSIONS.LEADS_EDIT, label: "Leads Edit" },
      { key: PERMISSIONS.LEADS_DELETE, label: "Leads Delete" },
    ],
  },
  {
    label: "Quotations",
    permissions: [
      { key: PERMISSIONS.QUOTATIONS_VIEW, label: "Quotations View" },
      { key: PERMISSIONS.QUOTATIONS_CREATE, label: "Quotations Create" },
      { key: PERMISSIONS.QUOTATIONS_APPROVE, label: "Quotations Approve" },
    ],
  },
  {
    label: "Projects",
    permissions: [
      { key: PERMISSIONS.PROJECTS_VIEW, label: "Projects View" },
      { key: PERMISSIONS.PROJECTS_CREATE, label: "Projects Create" },
      { key: PERMISSIONS.PROJECTS_ASSIGN, label: "Projects Assign" },
    ],
  },
  {
    label: "AMC & Services",
    permissions: [
      { key: PERMISSIONS.AMC_VIEW, label: "AMC View" },
      { key: PERMISSIONS.AMC_UPDATE, label: "AMC Update" },
    ],
  },
  {
    label: "Users",
    permissions: [
      { key: PERMISSIONS.USERS_VIEW, label: "Users View" },
      { key: PERMISSIONS.USERS_MANAGE, label: "Users Manage" },
    ],
  },
  {
    label: "Reports",
    permissions: [
      { key: PERMISSIONS.REPORTS_VIEW, label: "Reports View" },
    ],
  },
  {
    label: "Settings",
    permissions: [
      { key: PERMISSIONS.SETTINGS_MANAGE, label: "Settings Manage" },
    ],
  },
  {
    label: "Form Submissions",
    permissions: [
      { key: PERMISSIONS.FORM_SUBMISSIONS_VIEW, label: "Form Submissions View" },
      { key: PERMISSIONS.FORM_SUBMISSIONS_DELETE, label: "Form Submissions Delete" },
    ],
  },
  {
    label: "Demo Requests",
    permissions: [
      { key: PERMISSIONS.DEMO_REQUESTS_VIEW, label: "Demo Requests View" },
      { key: PERMISSIONS.DEMO_REQUESTS_DELETE, label: "Demo Requests Delete" },
    ],
  },
];

// Default permissions for roles (optional - can be overridden)
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: ALL_PERMISSIONS, // Admin gets all permissions
  "Sales Executive": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_EDIT,
    PERMISSIONS.QUOTATIONS_VIEW,
    PERMISSIONS.QUOTATIONS_CREATE,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.AMC_VIEW,
  ],
  "Service Engineer": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.AMC_VIEW,
    PERMISSIONS.AMC_UPDATE,
  ],
  "Project Manager": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.PROJECTS_CREATE,
    PERMISSIONS.PROJECTS_ASSIGN,
    PERMISSIONS.QUOTATIONS_VIEW,
    PERMISSIONS.QUOTATIONS_APPROVE,
  ],
};

