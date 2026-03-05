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
  PROJECTS_EDIT: "projects:edit",
  PROJECTS_DELETE: "projects:delete",
  PROJECTS_ASSIGN: "projects:assign",
  DOCUMENT_UPLOAD: "document:upload",
  DOCUMENT_DELETE: "document:delete",
  EXPENSE_VIEW: "expense:view",
  EXPENSE_EDIT: "expense:edit",
  EXPENSE_ADD: "expense:add",
  EXPENSE_DELETE: "expense:delete",

  AMC_VIEW: "amc:view",
  AMC_UPDATE: "amc:update",

  USERS_VIEW: "users:view",
  USERS_MANAGE: "users:manage",

  REPORTS_VIEW: "reports:view",
  SETTINGS_MANAGE: "settings:manage",

  BLOGS_VIEW: "blogs:view",
  BLOGS_CREATE: "blogs:create",
  BLOGS_EDIT: "blogs:edit",
  BLOGS_DELETE: "blogs:delete",

  TESTIMONIALS_VIEW: "testimonials:view",
  ACTIVITY_VIEW: "activity:view",

  FORM_SUBMISSIONS_VIEW: "form_submissions:view",
  FORM_SUBMISSIONS_DELETE: "form_submissions:delete",

  DEMO_REQUESTS_VIEW: "demo_requests:view",
  DEMO_REQUESTS_DELETE: "demo_requests:delete",

  GROUPS_VIEW: "groups:view",
  GROUPS_CREATE: "groups:create",
  GROUPS_EDIT: "groups:edit",
  GROUPS_DELETE: "groups:delete",

  PIPELINES_VIEW: "pipelines:view",
  PIPELINES_CREATE: "pipelines:create",
  PIPELINES_EDIT: "pipelines:edit",
  PIPELINES_DELETE: "pipelines:delete",
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
      { key: PERMISSIONS.PROJECTS_EDIT, label: "Projects Edit" },
      { key: PERMISSIONS.PROJECTS_DELETE, label: "Projects Delete" },
      { key: PERMISSIONS.PROJECTS_ASSIGN, label: "Projects Assign" },
      { key: PERMISSIONS.DOCUMENT_UPLOAD, label: "Document Upload" },
      { key: PERMISSIONS.DOCUMENT_DELETE, label: "Document Delete" },
      { key: PERMISSIONS.EXPENSE_VIEW, label: "Expense View" },
      { key: PERMISSIONS.EXPENSE_EDIT, label: "Expense Edit" },
      { key: PERMISSIONS.EXPENSE_ADD, label: "Add Expense" },
      { key: PERMISSIONS.EXPENSE_DELETE, label: "Expense Delete" },
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
    label: "Blogs",
    permissions: [
      { key: PERMISSIONS.BLOGS_VIEW, label: "Blogs View" },
      { key: PERMISSIONS.BLOGS_CREATE, label: "Blogs Create" },
      { key: PERMISSIONS.BLOGS_EDIT, label: "Blogs Edit" },
      { key: PERMISSIONS.BLOGS_DELETE, label: "Blogs Delete" },
    ],
  },
  {
    label: "Testimonials",
    permissions: [
      { key: PERMISSIONS.TESTIMONIALS_VIEW, label: "Testimonials View" },
    ],
  },
  {
    label: "Activity",
    permissions: [
      { key: PERMISSIONS.ACTIVITY_VIEW, label: "Activity View" },
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
  {
    label: "Groups",
    permissions: [
      { key: PERMISSIONS.GROUPS_VIEW, label: "Groups View" },
      { key: PERMISSIONS.GROUPS_CREATE, label: "Groups Create" },
      { key: PERMISSIONS.GROUPS_EDIT, label: "Groups Edit" },
      { key: PERMISSIONS.GROUPS_DELETE, label: "Groups Delete" },
    ],
  },
  {
    label: "Leads Pipelines",
    permissions: [
      { key: PERMISSIONS.PIPELINES_VIEW, label: "Pipelines View" },
      { key: PERMISSIONS.PIPELINES_CREATE, label: "Pipelines Create" },
      { key: PERMISSIONS.PIPELINES_EDIT, label: "Pipelines Edit" },
      { key: PERMISSIONS.PIPELINES_DELETE, label: "Pipelines Delete" },
    ],
  },
];

// Default permissions for roles (optional - can be overridden)
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: ALL_PERMISSIONS,
  "Sales Executive": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_EDIT,
    PERMISSIONS.QUOTATIONS_VIEW,
    PERMISSIONS.QUOTATIONS_CREATE,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.AMC_VIEW,
    PERMISSIONS.GROUPS_VIEW,
    PERMISSIONS.GROUPS_CREATE,
    PERMISSIONS.GROUPS_EDIT,
    PERMISSIONS.GROUPS_DELETE,
  ],
  "Service Engineer": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.AMC_VIEW,
    PERMISSIONS.AMC_UPDATE,
  ],
  "Project Manager": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.PROJECTS_CREATE,
    PERMISSIONS.PROJECTS_EDIT,
    PERMISSIONS.PROJECTS_DELETE,
    PERMISSIONS.PROJECTS_ASSIGN,
    PERMISSIONS.DOCUMENT_UPLOAD,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.EXPENSE_EDIT,
    PERMISSIONS.EXPENSE_ADD,
    PERMISSIONS.EXPENSE_DELETE,
    PERMISSIONS.QUOTATIONS_VIEW,
    PERMISSIONS.QUOTATIONS_APPROVE,
  ],
};

