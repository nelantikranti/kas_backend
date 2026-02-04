import express from "express";
import mongoose from "mongoose";
import User from "../models/User";
import Notification from "../models/Notification";
import { DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSIONS } from "../utils/permissions";
import { authenticateAdmin } from "../middleware/auth";

const router = express.Router();


// Helper function to validate ObjectId
const isValidObjectId = (id: string | string[]): boolean => {
  const idStr = Array.isArray(id) ? id[0] : id;
  return mongoose.Types.ObjectId.isValid(idStr) && (idStr.toString().match(/^[0-9a-fA-F]{24}$/) !== null);
};

// GET all users
router.get("/", async (req, res) => {
  try {
    const includePasswords = req.query.includePasswords === 'true';
  
    const users = await User.find().sort({ createdAt: -1 });
    
    if (includePasswords) {
      // Include passwords for admin
      const usersWithPasswords = users.map(user => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        password: user.password || 'Not set',
        role: user.role,
        permissions: user.permissions || [],
        status: user.status,
        lastLogin: user.lastLogin,
      }));
      res.json(usersWithPasswords);
    } else {
      // Don't include passwords for regular users
      const usersWithoutPasswords = users.map(user => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        status: user.status,
        lastLogin: user.lastLogin,
      }));
      res.json(usersWithoutPasswords);
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
router.get("/:id", async (req, res) => {
  try {
    // Validate ObjectId format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      status: user.status,
      lastLogin: user.lastLogin,
    });
  } catch (error) {
    console.error("Failed to fetch user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// POST create new user
router.post("/", async (req, res) => {
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
    
    // Get default permissions for role if not provided
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role || "Sales Executive"] || [];
    
    // Create new user
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password, // In production, hash this password
      role: role || "Sales Executive",
      permissions: req.body.permissions || defaultPermissions,
      status: status || "Active",
      lastLogin: new Date().toISOString().split("T")[0],
    });
    
    await newUser.save();
    
    res.status(201).json({
      id: newUser._id.toString(),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      permissions: newUser.permissions || [],
      status: newUser.status,
      lastLogin: newUser.lastLogin,
    });
  } catch (error: any) {
    console.error("Failed to create user:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "User with this email already exists" });
    }
    res.status(400).json({ error: "Failed to create user" });
  }
});

// PUT update user
router.put("/:id", async (req, res) => {
  try {
    // Validate ObjectId format
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const { name, email, password, role, status } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
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
    if (status) user.status = status;
    
    await user.save();
    
    res.json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      status: user.status,
      lastLogin: user.lastLogin,
    });
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

    const { permissions } = req.body;
    
    console.log("Received permissions update request:", {
      userId: req.params.id,
      permissions: permissions,
      permissionsCount: permissions?.length
    });
    
    if (!Array.isArray(permissions)) {
      console.error("Permissions is not an array:", typeof permissions, permissions);
      return res.status(400).json({ error: "Permissions must be an array" });
    }
    
    // Filter out UPDATE permissions that don't exist (form_submissions:update, demo_requests:update)
    const filteredPermissions = permissions.filter(p => 
      p !== "form_submissions:update" && 
      p !== "demo_requests:update"
    );
    
    // Validate permissions
    console.log("All valid permissions:", ALL_PERMISSIONS);
    console.log("Received permissions to validate:", permissions);
    console.log("Filtered permissions (removed UPDATE):", filteredPermissions);
    
    const invalidPermissions = filteredPermissions.filter(p => !ALL_PERMISSIONS.includes(p));
    
    if (invalidPermissions.length > 0) {
      console.error("Invalid permissions detected:", invalidPermissions);
      console.error("Valid permissions list:", ALL_PERMISSIONS);
      console.error("Total valid permissions count:", ALL_PERMISSIONS.length);
      return res.status(400).json({ 
        error: `Invalid permissions: ${invalidPermissions.join(", ")}`,
        validPermissions: ALL_PERMISSIONS,
        receivedPermissions: permissions,
        filteredPermissions: filteredPermissions
      });
    }
    
    // Use filtered permissions (without UPDATE)
    const finalPermissions = filteredPermissions;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Update permissions (use filtered permissions without UPDATE)
    user.permissions = finalPermissions;
    
    // Save user
    try {
      await user.save();
      console.log("Permissions updated successfully for user:", user.email, "New permissions:", user.permissions);
    } catch (saveError: any) {
      console.error("Failed to save user permissions:", saveError);
      return res.status(400).json({ 
        error: "Failed to save permissions", 
        details: saveError.message 
      });
    }
    
    res.json({
      success: true,
      message: "Permissions updated successfully",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        permissions: user.permissions,
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

    // Get default permissions for role
    const { DEFAULT_ROLE_PERMISSIONS } = await import("../utils/permissions");
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[user.role] || [];

    // Approve user - set status to Active and assign default permissions
    user.status = "Active";
    user.permissions = defaultPermissions;
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
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        permissions: user.permissions,
      },
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

    res.json({ message: "Signup request rejected and user deleted successfully" });
  } catch (error) {
    console.error("Failed to reject user:", error);
    res.status(500).json({ error: "Failed to reject signup request" });
  }
});

// DELETE user
router.delete("/:id", async (req, res) => {
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

    // Prevent deletion of Admin users
    if (user.role === "Admin") {
      return res.status(403).json({ error: "Admin users cannot be deleted" });
    }

    // Delete the user
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
