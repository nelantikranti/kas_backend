import { Request, Response, NextFunction } from "express";

// Simple authentication middleware
// In production, use JWT tokens
export const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "No token provided. Please login first." });
  }

  // Simple token validation (in production, use JWT verification)
  if (token.startsWith("token_")) {
    // Extract user info from token (simple implementation)
    // In production, decode JWT token and verify
    next();
  } else {
    return res.status(401).json({ error: "Invalid token. Please login again." });
  }
};

















