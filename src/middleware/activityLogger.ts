import { Request, Response, NextFunction } from "express";
import ActivityLog from "../models/ActivityLog";
import User from "../models/User";

// Helper to extract user info from simple token (token_{userId}_timestamp)
const extractUserFromToken = async (authHeader?: string) => {
  try {
    if (!authHeader) return null;
    const token = authHeader.replace("Bearer ", "");
    if (!token.startsWith("token_")) return null;
    const parts = token.split("_");
    const userId = parts[1];
    if (!userId) return null;
    const user = await User.findById(userId).select("name role");
    return user;
  } catch (err) {
    return null;
  }
};

export const logActivity = async (payload: {
  userId?: string; // affected entity's user id (legacy)
  userName: string; // affected entity name (legacy)
  userRole?: string;
  performedBy?: string; // id of actor
  performedByName?: string;
  performedByRole?: string;
  targetId?: string;
  actionType: string;
  moduleName?: string;
  description?: string;
  ipAddress?: string;
  deviceInfo?: string;
  status?: string;
}) => {
  try {
    const activity = new ActivityLog({
      userId: payload.userId || null,
      userName: payload.userName || "System",
      userRole: payload.userRole || null,
      performedBy: payload.performedBy || null,
      performedByName: payload.performedByName || null,
      performedByRole: payload.performedByRole || null,
      targetId: payload.targetId || null,
      actionType: payload.actionType,
      moduleName: payload.moduleName || null,
      description: payload.description || null,
      ipAddress: payload.ipAddress || null,
      deviceInfo: payload.deviceInfo || null,
      status: payload.status || "Success",
    });
    await activity.save();

    // No realtime socket emit — using REST API only

    return activity;
  } catch (error) {
    console.error("Failed to log activity:", error);
    return null;
  }
};

// Express middleware to auto-log create/update/delete actions
export const activityMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only log POST/PUT/PATCH/DELETE for simplicity
    const method = req.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return next();
    }

    // Determine action type
    let actionType = "Update";
    if (method === "POST") actionType = "Create";
    if (method === "DELETE") actionType = "Delete";
    if (method === "PATCH") actionType = "Update";

    const user = await extractUserFromToken(req.headers.authorization as string | undefined);
    const userName = user?.name || (req.body && req.body.userName) || "Unknown";
    const userRole = user?.role || undefined;
    const performedById = user?._id?.toString();
    const performedByName = user?.name;
    const performedByRole = user?.role;
    const moduleName = (req.baseUrl || req.path || "").split("/")[1] || undefined;
    const description = req.body && req.body.name ? `${actionType} ${req.body.name}` : `${actionType} ${moduleName}`;
    const ipAddress = req.ip || req.headers["x-forwarded-for"] || null;
    const deviceInfo = req.headers["user-agent"] || null;

    // Fire-and-forget
    logActivity({
      userId: undefined,
      userName: userName, // legacy/affected name unknown at middleware time
      userRole: userRole,
      performedBy: performedById,
      performedByName: performedByName,
      performedByRole: performedByRole,
      targetId: (req.params && (req.params as any).id) ? String((req.params as any).id) : undefined,
      actionType,
      moduleName,
      description,
      ipAddress: typeof ipAddress === "string" ? ipAddress : (Array.isArray(ipAddress) ? ipAddress[0] : ""),
      deviceInfo: typeof deviceInfo === "string" ? deviceInfo : "",
      status: "Success",
    });
  } catch (err) {
    console.error("Activity middleware error:", err);
  } finally {
    return next();
  }
};



