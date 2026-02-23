import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import { ALL_PERMISSIONS } from "../utils/permissions";

// Extend Express Request so req.user is typed (needed when auth is loaded without permissions)
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        permissions: string[];
      };
    }
  }
}

// Authenticate any logged-in user and set req.user (id, email, role, permissions)
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "No token provided. Please login first." });
  }
  if (!token.startsWith("token_")) {
    return res.status(401).json({ error: "Invalid token. Please login again." });
  }
  const tokenParts = token.split("_");
  if (tokenParts.length < 2) {
    return res.status(401).json({ error: "Invalid token format. Please login again." });
  }
  const userId = tokenParts[1];
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ error: "User not found. Please login again." });
    }
    if (user.status === "Pending") {
      return res.status(403).json({ error: "Your account is pending approval." });
    }
    if (user.status === "Inactive") {
      return res.status(403).json({ error: "Your account is inactive." });
    }
    const isSuperadminRole = user.role?.toLowerCase?.() === "superadmin";
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      permissions: isSuperadminRole ? ALL_PERMISSIONS : (user.permissions || []),
    };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ error: "Failed to verify user. Please login again." });
  }
};

// Simple authentication middleware (admin only)
// In production, use JWT tokens
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "No token provided. Please login first." });
  }

  // Simple token validation (in production, use JWT verification)
  if (token.startsWith("token_")) {
    // Extract user ID from token format: token_${userId}_${timestamp}
    const tokenParts = token.split("_");
    if (tokenParts.length >= 2) {
      const userId = tokenParts[1];
      
      try {
        // Fetch user to verify role is Admin
        const user = await User.findById(userId);
        if (!user) {
          return res.status(401).json({ error: "User not found. Please login again." });
        }
        
        // Superadmin and Admin can perform admin actions
        if (user.role !== "Superadmin" && user.role !== "Admin") {
          return res.status(403).json({ error: "Only administrators can perform this action." });
        }
        
        // User is Superadmin or Admin, proceed
        next();
      } catch (error) {
        console.error("Failed to verify admin user:", error);
        return res.status(401).json({ error: "Failed to verify user. Please login again." });
      }
    } else {
      return res.status(401).json({ error: "Invalid token format. Please login again." });
    }
  } else {
    return res.status(401).json({ error: "Invalid token. Please login again." });
  }
};

















