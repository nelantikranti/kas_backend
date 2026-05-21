import { Request, Response, NextFunction } from "express";
import { isEmployeeAttendanceRole, PERMISSIONS } from "../utils/permissions";

// Extend Express Request (must match auth.ts: id, name, email, role, permissions)
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        role: string;
        permissions: string[];
      };
    }
  }
}

// Admin bypasses all permission checks (full access)
const isAdmin = (role: string | undefined) => role === "Admin";

// Permission check middleware
export const checkPermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isAdmin(req.user?.role)) {
      return next();
    }

    // Check if user has the required permission
    if (!req.user?.permissions?.includes(permission)) {
      return res.status(403).json({ 
        error: "Access Denied",
        message: `You don't have permission to ${permission}` 
      });
    }

    next();
  };
};

// Check multiple permissions (user needs at least one)
export const checkAnyPermission = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isAdmin(req.user?.role)) {
      return next();
    }

    // Check if user has at least one of the required permissions
    const hasPermission = permissions.some(permission => 
      req.user?.permissions?.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Access Denied",
        message: `You don't have required permissions` 
      });
    }

    next();
  };
};

/** Employee check-in/out — allowed by role (not Admin) or hr:attendance_self permission */
export const checkEmployeeAttendance = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (isAdmin(role)) {
      return res.status(403).json({
        error: "Access Denied",
        message: "Administrators cannot use employee check-in/out",
      });
    }
    if (isEmployeeAttendanceRole(role)) return next();
    if (req.user?.permissions?.includes(PERMISSIONS.HR_ATTENDANCE_SELF)) {
      return next();
    }
    return res.status(403).json({
      error: "Access Denied",
      message: "You don't have permission to record attendance",
    });
  };
};

// Check all permissions (user needs all)
export const checkAllPermissions = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isAdmin(req.user?.role)) {
      return next();
    }

    // Check if user has all required permissions
    const hasAllPermissions = permissions.every(permission => 
      req.user?.permissions?.includes(permission)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({ 
        error: "Access Denied",
        message: `You don't have all required permissions` 
      });
    }

    next();
  };
};

