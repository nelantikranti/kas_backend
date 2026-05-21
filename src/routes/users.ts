import express from "express";
import mongoose from "mongoose";
import User from "../models/User";
import Notification from "../models/Notification";
import { logActivity } from "../middleware/activityLogger";
import {
  PERMISSIONS,
  getEffectivePermissions,
  getEffectiveRolePermissions,
  resolvePermissionSource,
  isRegisteredPermission,
  type PermissionSourceMode,
} from "../utils/permissions";
import { authenticate, authenticateAdmin } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";

const userPayload = (user: InstanceType<typeof User>, effectivePermissions?: string[]) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  permissions: effectivePermissions ?? getEffectivePermissions(user),
  permissionSource: resolvePermissionSource(user),
  status: user.status,
  lastLogin: user.lastLogin,
});

const router = express.Router();


// Helper function to validate ObjectId
const isValidObjectId = (id: string | string[]): boolean => {
  const idStr = Array.isArray(id) ? id[0] : id;
  return mongoose.Types.ObjectId.isValid(idStr) && (idStr.toString().match(/^[0-9a-fA-F]{24}$/) !== null);
};

// GET all users
router.get("/", authenticate, async (req, res) => {
  try {
    const includePasswords = req.query.includePasswords === 'true';
    if (includePasswords && req.user?.role !== "Admin") {
      return res.status(403).json({ error: "Only administrators can view passwords." });
    }
  
    const users = await User.find().sort({ createdAt: -1 });
    
    const effectiveByUser = await Promise.all(
      users.map(async (u) => {
        const eff =
          (u as any).permissionSource === "custom"
            ? getEffectivePermissions(u)
            : await getEffectiveRolePermissions(u.role);
        return { u, eff };
      })
    );

    if (includePasswords) {
      const usersWithPasswords = effectiveByUser.map(({ u, eff }) => ({
        ...userPayload(u, eff),
        password: u.password || "Not set",
      }));
      res.json(usersWithPasswords);
    } else {
      res.json(effectiveByUser.map(({ u, eff }) => userPayload(u, eff)));
    }
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET all available permissions (must be before /:id route)
router.get("/permissions/list", async (req, res) => {
  try {
    const { PERMISSION_GROUPS } = await import("../utils/permissions");
    res.json({ permissions: PERMISSION_GROUPS });
  } catch (error) {
    console.error("Failed to fetch permissions list:", error);
    res.status(500).json({ error: "Failed to fetch permissions list" });
  }
});

// GET pending signup requests (must be before /:id route)
router.get("/pending", authenticateAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ status: "Pending" }).sort({ createdAt: -1 });
    const formattedUsers = pendingUsers.map(user => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    }));
    res.json(formattedUsers);
  } catch (error) {
    console.error("Failed to fetch pending users:", error);
    res.status(500).json({ error: "Failed to fetch pending signup requests" });
  }
});

// GET user by ID (must be after specific routes)
router.get("/:id", authenticate, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const canViewOtherUsers =
      req.user?.role === "Admin" ||
      req.user?.permissions?.includes(PERMISSIONS.USERS_VIEW) ||
      req.user?.permissions?.includes(PERMISSIONS.USERS_MANAGE);
    const isSelf = req.user?.id === req.params.id;
    if (!isSelf && !canViewOtherUsers) {
      return res.status(403).json({ error: "You don't have access to this user." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const eff =
      (user as any).permissionSource === "custom"
        ? getEffectivePermissions(user)
        : await getEffectiveRolePermissions(user.role);
    res.json(userPayload(user, eff));
  } catch (error) {
    console.error("Failed to fetch user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// POST create new user
router.post("/", authenticate, checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    const { name, email, password, role, status } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Enforce single Admin rule — only one Admin is allowed in the system
    const assignedRole = role || "Sales Executive";
    if (assignedRole === "Admin") {
      const existingAdmin = await User.findOne({ role: "Admin" });
      if (existingAdmin) {
        return res.status(400).json({ error: "An Admin already exists. Only one Admin is allowed in the system." });
      }
    }
    
    let permissionSource: PermissionSourceMode = "role";
    let permissions: string[] = [];

    if (
      req.body.permissionSource === "custom" &&
      Array.isArray(req.body.permissions) &&
      req.body.permissions.length > 0
    ) {
      permissionSource = "custom";
      permissions = (req.body.permissions as string[]).filter((p) => isRegisteredPermission(String(p)));
    }

    // Create new user (defaults follow role unless admin sets custom permissions)
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password, // In production, hash this password
      role: assignedRole,
      permissionSource,
      permissions,
      status: status || "Active",
      lastLogin: new Date().toISOString().split("T")[0],
    });
    
    await newUser.save();
    
    // Log activity: user created (include performer info from token if available)
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performerId: string | undefined = undefined;
      let performerName = undefined as string | undefined;
      let performerRole: string | undefined = undefined;

      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        if (parts.length >= 2) {
          performerId = parts[1];
          try {
            const performer = await User.findById(performerId).select("name role");
            if (performer) {
              performerName = performer.name;
              performerRole = performer.role;
            }
          } catch (fetchErr) {
            console.error("Failed to fetch performer for activity log:", fetchErr);
          }
        }
      }

      await logActivity({
        userId: newUser._id?.toString(),
        userName: newUser.name,
        userRole: newUser.role,
        performedBy: performerId,
        performedByName: performerName,
        performedByRole: performerRole,
        actionType: "Create",
        moduleName: "Users",
        description: `Created user ${newUser.email}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log user creation activity:", err);
    }

    const eff =
      (newUser as any).permissionSource === "custom"
        ? getEffectivePermissions(newUser)
        : await getEffectiveRolePermissions(newUser.role);
    res.status(201).json(userPayload(newUser, eff));
  } catch (error: any) {
    console.error("Failed to create user:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "User with this email already exists" });
    }
    if (error.name === "ValidationError" && error.errors) {
      const first = Object.values(error.errors)[0] as { message?: string };
      return res.status(400).json({
        error: first?.message || error.message || "Validation failed",
      });
    }
    res.status(400).json({
      error: error.message || "Failed to create user",
    });
  }
});

// PUT update user
router.put("/:id", authenticate, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const { name, email, password, role, status } = req.body;
    const isSelf = req.user?.id === req.params.id;
    const canManageUsers =
      req.user?.role === "Admin" ||
      req.user?.permissions?.includes(PERMISSIONS.USERS_MANAGE);
    if (!isSelf && !canManageUsers) {
      return res.status(403).json({ error: "You don't have permission to update this user." });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const previousRole = user.role;

    // Extract current user ID and role from token
    const token = req.headers.authorization?.replace("Bearer ", "");
    let currentUserId: string | null = null;
    let currentUserRole: string | null = null;

    if (token && token.startsWith("token_")) {
      // Extract user ID from token format: token_${userId}_${timestamp}
      const tokenParts = token.split("_");
      if (tokenParts.length >= 2) {
        currentUserId = tokenParts[1];
        // Fetch current user to check role
        try {
          const currentUser = await User.findById(currentUserId);
          if (currentUser) {
            currentUserRole = currentUser.role;
            console.log(`Current user role: ${currentUserRole}, User ID: ${currentUserId}`);
          } else {
            console.error(`Current user not found with ID: ${currentUserId}`);
          }
        } catch (error) {
          console.error("Failed to fetch current user:", error);
        }
      } else {
        console.error("Invalid token format - tokenParts length:", tokenParts.length);
      }
    } else {
      console.error("No valid token provided");
    }
    
    // Only Admin can change roles
    if (role && role !== user.role) {
      console.log(`Attempting to change role from ${user.role} to ${role}. Current user role: ${currentUserRole}`);
      if (!currentUserRole || currentUserRole !== "Admin") {
        return res.status(403).json({ error: "Only administrators can change user roles." });
      }

      // Enforce single Admin rule — cannot promote someone to Admin if one already exists
      if (role === "Admin") {
        const existingAdmin = await User.findOne({ role: "Admin", _id: { $ne: req.params.id } });
        if (existingAdmin) {
          return res.status(400).json({ error: "An Admin already exists. Only one Admin is allowed in the system." });
        }
      }
    }
    
    // Prevent users from changing their own role (even Admin cannot change their own role)
    if (role && currentUserId && currentUserId === req.params.id && role !== user.role) {
      return res.status(403).json({ error: "You cannot change your own role. Please contact another administrator." });
    }
    
    // Update fields
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      user.password = password; // In production, hash this
    }
    if (role) user.role = role;
    // New role → use that role’s permission template for everyone with this account (not frozen custom list)
    if (role && user.role !== previousRole) {
      (user as any).permissionSource = "role";
      user.permissions = [];
    }
    if (status) user.status = status;
    
    await user.save();
    
    // Log activity: user updated
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performerId: string | undefined = undefined;
      let performerName = "Unknown";
      let performerRole: string | undefined = undefined;
      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        performerId = parts[1];
        const performer = await User.findById(performerId).select("name role");
        if (performer) {
          performerName = performer.name;
          performerRole = performer.role;
        }
      }
      await logActivity({
        userId: performerId,
        userName: performerName,
        userRole: performerRole,
        actionType: "Update",
        moduleName: "Users",
        description: `Updated user ${user.email}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log user update activity:", err);
    }

    const eff =
      (user as any).permissionSource === "custom"
        ? getEffectivePermissions(user)
        : await getEffectiveRolePermissions(user.role);
    res.json(userPayload(user, eff));
  } catch (error: any) {
    console.error("Failed to update user:", error);
    res.status(400).json({ error: "Failed to update user" });
  }
});

// PUT update user permissions (requires admin authentication)
router.put("/:id/permissions", authenticateAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const permissionSource: PermissionSourceMode =
      req.body.permissionSource === "role" ? "role" : "custom";

    if (permissionSource === "custom" && !Array.isArray(req.body.permissions)) {
      return res.status(400).json({
        error: "Permissions must be an array when permissionSource is custom",
      });
    }

    const rawList = permissionSource === "custom" ? (req.body.permissions as string[]) : [];
    console.log("Permissions update:", {
      userId: req.params.id,
      permissionSource,
      count: rawList.length,
    });

    const filteredPermissions = rawList.filter(
      (p) => p !== "form_submissions:update" && p !== "demo_requests:update"
    );
    const finalPermissions = filteredPermissions.filter((p) => isRegisteredPermission(p));

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "Admin") {
      return res.json({
        success: true,
        message: "Admin always has full access",
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          permissions: getEffectivePermissions(user),
          permissionSource: resolvePermissionSource(user),
        },
      });
    }

    (user as any).permissionSource = permissionSource;
    user.permissions = permissionSource === "role" ? [] : finalPermissions;

    try {
      await user.save();
      console.log("Permissions saved for", user.email, permissionSource);
    } catch (saveError: any) {
      console.error("Failed to save user permissions:", saveError);
      return res.status(400).json({
        error: "Failed to save permissions",
        details: saveError.message,
      });
    }

    res.json({
      success: true,
      message: "Permissions updated successfully",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        permissions: getEffectivePermissions(user),
        permissionSource: resolvePermissionSource(user),
      },
    });
  } catch (error: any) {
    console.error("Failed to update permissions:", error);
    console.error("Error details:", error.message, error.stack);
    res.status(400).json({ error: "Failed to update permissions", details: error.message });
  }
});

// PUT approve signup request
router.put("/:id/approve", authenticateAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.status !== "Pending") {
      return res.status(400).json({ error: "User is not pending approval" });
    }

    user.status = "Active";
    (user as any).permissionSource = "role";
    user.permissions = [];
    const { DEFAULT_ONBOARDING_CHECKLIST } = await import("../constants/hr");
    if (!user.onboarding?.checklist?.length) {
      user.onboarding = {
        checklist: DEFAULT_ONBOARDING_CHECKLIST.map((c) => ({ ...c, completed: false })),
        documents: user.onboarding?.documents || [],
      };
    }
    await user.save();

    // Delete related signup notification
    try {
      await Notification.deleteMany({
        type: "signup",
        relatedId: user._id.toString(),
      });
    } catch (notifError) {
      console.error("Failed to delete signup notification:", notifError);
      // Continue even if notification deletion fails
    }

    res.json({
      success: true,
      message: "User approved successfully",
      user: userPayload(user),
    });
  } catch (error: any) {
    console.error("Failed to approve user:", error);
    res.status(400).json({ error: "Failed to approve user", details: error.message });
  }
});

// DELETE reject signup request (delete the user)
router.delete("/:id/reject", authenticateAdmin, async (req, res) => {
  try {
    // Validate ObjectId format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.status !== "Pending") {
      return res.status(400).json({ error: "Only pending users can be rejected" });
    }

    const userId = user._id.toString();

    // Delete related signup notification
    try {
      await Notification.deleteMany({
        type: "signup",
        relatedId: userId,
      });
    } catch (notifError) {
      console.error("Failed to delete signup notification:", notifError);
      // Continue even if notification deletion fails
    }

    // Delete the pending user
    await User.findByIdAndDelete(req.params.id);
    
    // Log activity: who rejected (from token)
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performedBy = "Unknown";
      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        const performerId = parts[1];
        const performer = await User.findById(performerId).select("name role");
        if (performer) performedBy = performer.name;
      }
      await logActivity({
        userId: undefined,
        userName: performedBy,
        userRole: undefined,
        actionType: "Delete",
        moduleName: "Users",
        description: `Rejected signup and deleted user ${user.email || user._id}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log reject/delete activity:", err);
    }

    res.json({ message: "Signup request rejected and user deleted successfully" });
  } catch (error) {
    console.error("Failed to reject user:", error);
    res.status(500).json({ error: "Failed to reject signup request" });
  }
});

// DELETE user
router.delete("/:id", authenticate, checkPermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    // Validate ObjectId format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    // First find the user to check their role
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent deletion of Admin user
    if (user.role === "Admin") {
      return res.status(403).json({ error: "Admin cannot be deleted. You can edit the Admin profile instead." });
    }

    // Delete the user
    await User.findByIdAndDelete(req.params.id);
    
    // Log activity: who performed deletion
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      let performedBy = "Unknown";
      let performerRole: string | undefined = undefined;
      let performerId: string | undefined = undefined;
      if (token && token.startsWith("token_")) {
        const parts = token.split("_");
        performerId = parts[1];
        const performer = await User.findById(performerId).select("name role");
        if (performer) {
          performedBy = performer.name;
          performerRole = performer.role;
        }
      }
      await logActivity({
        userId: performerId,
        userName: performedBy,
        userRole: performerRole,
        actionType: "Delete",
        moduleName: "Users",
        description: `Deleted user ${user.email || user._id}`,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log user deletion activity:", err);
    }

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
