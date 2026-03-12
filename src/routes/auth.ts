import express from "express";
import User from "../models/User";
import Notification from "../models/Notification";
import { logActivity } from "../middleware/activityLogger";
import { ALL_PERMISSIONS } from "../utils/permissions";

const router = express.Router();

// Simple authentication - in production, use proper JWT tokens and password hashing
interface LoginRequest {
  email: string;
  password: string;
}

interface SignupRequest {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: string;
}

// POST signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, phone, role }: SignupRequest = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check if user already exists in MongoDB
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Validate and set role
    const validRoles = ["Admin", "Sales Executive", "Service Engineer", "Project Manager", "Accounts", "Manager", "Technician", "Accountant"];
    const userRole = (role && validRoles.includes(role)) ? role : "Sales Executive";

    // Enforce single Admin rule — only one Admin is allowed in the system
    if (userRole === "Admin") {
      const existingAdmin = await User.findOne({ role: "Admin" });
      if (existingAdmin) {
        return res.status(400).json({ error: "An Admin already exists. Only one Admin is allowed in the system." });
      }
    }

    // Create new user in MongoDB with Pending status
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password, // In production, hash the password
      role: userRole,
      status: "Pending", // User needs admin approval
      lastLogin: new Date().toISOString().split("T")[0],
    });

    await newUser.save();

    // Create notification for all admins
    try {
      const notification = new Notification({
        userId: null, // Global notification for all admins
        message: `New signup request from ${newUser.name} (${newUser.email}) - Role: ${newUser.role}`,
        type: "signup",
        relatedId: newUser._id.toString(),
        read: false,
      });
      await notification.save();
    } catch (notifError) {
      console.error("Failed to create signup notification:", notifError);
      // Don't fail the signup if notification creation fails
    }

    res.status(201).json({
      message: "Signup request submitted successfully. Please wait for admin approval.",
      pending: true,
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "User with this email already exists" });
    }
    res.status(500).json({ error: "Failed to create account. Please try again." });
  }
});

// POST login
router.post("/login", async (req, res) => {
  try {
    const { email, password }: LoginRequest = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user in MongoDB
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if user is approved (Active status)
    if (user.status === "Pending") {
      return res.status(403).json({ 
        error: "Your account is pending approval. Please wait for admin approval." 
      });
    }

    if (user.status === "Inactive") {
      return res.status(403).json({ 
        error: "Your account is inactive. Please contact administrator." 
      });
    }

    // Check password
    if (user.password !== password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last login
    user.lastLogin = new Date().toISOString().split("T")[0];
    await user.save();

    // Generate token
    const token = `token_${user._id.toString()}_${Date.now()}`;

      res.json({
        message: "Login successful",
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: user.role === "Admin" ? ALL_PERMISSIONS : (user.permissions || []),
        },
      });
    // Log login activity (async, don't block response)
    try {
      logActivity({
        userId: user._id.toString(),
        userName: user.name,
        userRole: user.role,
        actionType: "Login",
        moduleName: "Auth",
        description: "User logged in",
        ipAddress: (req.ip || req.headers["x-forwarded-for"] || "").toString(),
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log login activity:", err);
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST logout - optional endpoint to allow server-side logging
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization as string | undefined;
    let userName = "Unknown";
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (token.startsWith("token_")) {
        const parts = token.split("_");
        const userId = parts[1];
        const user = await User.findById(userId).select("name role");
        if (user) userName = user.name;
      }
    }

    // Log logout
    try {
      logActivity({
        userId: undefined,
        userName,
        actionType: "Logout",
        moduleName: "Auth",
        description: "User logged out",
        ipAddress: (req.ip || req.headers["x-forwarded-for"] || "").toString(),
        deviceInfo: req.headers["user-agent"] as string,
        status: "Success",
      });
    } catch (err) {
      console.error("Failed to log logout activity:", err);
    }

    res.json({ message: "Logged out" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// POST verify token (simple middleware check)
router.post("/verify", (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    if (!token.startsWith("token_")) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const tokenParts = token.split("_");
    if (tokenParts.length < 2) {
      return res.status(401).json({ error: "Invalid token format" });
    }

    const userId = tokenParts[1];
    User.findById(userId)
      .then((user) => {
        if (!user) {
          return res.status(401).json({ error: "User not found" });
        }
        if (user.status === "Pending") {
          return res.status(403).json({ error: "Your account is pending approval." });
        }
        if (user.status === "Inactive") {
          return res.status(403).json({ error: "Your account is inactive." });
        }

        res.json({
          valid: true,
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            permissions: user.role === "Admin" ? ALL_PERMISSIONS : (user.permissions || []),
          },
        });
      })
      .catch((error) => {
        console.error("Token verification failed:", error);
        res.status(500).json({ error: "Token verification failed" });
      });
  } catch (error) {
    res.status(500).json({ error: "Token verification failed" });
  }
});

export default router;
