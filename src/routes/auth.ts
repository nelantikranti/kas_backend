import express from "express";
import User from "../models/User";

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check password (in production, use bcrypt to compare hashed passwords)
    if (user.password !== password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if user is approved
    if (user.status !== "Active") {
      return res.status(403).json({ 
        error: "Your account is pending approval. Please wait for admin approval." 
      });
    }

    // Update last login
    user.lastLogin = new Date().toISOString().split("T")[0];
    await user.save();

    // Generate simple token (in production, use JWT)
    const token = `token_${user._id}_${Date.now()}`;

    res.json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

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

    // Get default permissions for role
    const { DEFAULT_ROLE_PERMISSIONS } = await import("../utils/permissions");
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role || "Sales Executive"] || [];

    // Create new user with Pending status
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password, // In production, hash this password
      role: role || "Sales Executive",
      permissions: defaultPermissions,
      status: "Pending", // New signups are pending approval
      lastLogin: new Date().toISOString().split("T")[0],
    });

    await newUser.save();

    // Create notification for admin (if Notification model exists)
    try {
      const Notification = (await import("../models/Notification")).default;
      await Notification.create({
        userId: "admin", // Admin user ID or handle differently
        message: `New signup request from ${name} (${email})`,
        type: "signup",
        relatedId: newUser._id.toString(),
        read: false,
      });
    } catch (notifError) {
      console.error("Failed to create signup notification:", notifError);
      // Continue even if notification creation fails
    }

    res.status(201).json({
      message: "Signup request submitted successfully. Please wait for admin approval.",
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "User with this email already exists" });
    }
    res.status(500).json({ error: "Failed to create account" });
  }
});

// POST /api/auth/verify
router.post("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Simple token validation (in production, use JWT verification)
    if (!token.startsWith("token_")) {
      return res.status(401).json({ error: "Invalid token format" });
    }

    // Extract user ID from token (simple implementation)
    // Format: token_<userId>_<timestamp>
    const parts = token.split("_");
    if (parts.length < 2) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = parts[1];
    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Check if user is still active
    if (user.status !== "Active") {
      return res.status(403).json({ error: "Account is not active" });
    }

    res.json({
      valid: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error("Token verification error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;

