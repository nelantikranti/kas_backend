import express from "express";
import User from "../models/User";
import Notification from "../models/Notification";

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
        permissions: user.permissions || [],
        },
      });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST verify token (simple middleware check)
router.post("/verify", (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Simple token validation (in production, use JWT verification)
    if (token.startsWith("token_")) {
      res.json({ valid: true });
    } else {
      res.status(401).json({ error: "Invalid token" });
    }
  } catch (error) {
    res.status(500).json({ error: "Token verification failed" });
  }
});

export default router;
