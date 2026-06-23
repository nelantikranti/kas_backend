import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

export function requireDatabase(req: Request, res: Response, next: NextFunction) {
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  const stateLabels: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  const state = stateLabels[mongoose.connection.readyState] || "unknown";

  return res.status(503).json({
    error: "Database connection unavailable. Please try again in a moment.",
    details:
      state === "connecting"
        ? "MongoDB is still connecting."
        : "Cannot reach MongoDB. Check Atlas Network Access (IP whitelist) and your internet connection.",
    dbState: state,
  });
}
