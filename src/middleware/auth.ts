import { Request, Response, NextFunction } from "express";
import User from "../models/User";

// Simple authentication middleware
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
        
        // Only users with role "Admin" are administrators
        if (user.role !== "Admin") {
          return res.status(403).json({ error: "Only administrators can perform this action." });
        }
        
        // User is Admin, proceed
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

















