import { Request, Response, NextFunction } from "express";

// Extend Express Request to include user
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

// Permission check middleware
export const checkPermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // If user is Admin, allow all
    if (req.user?.role === "Admin") {
      return next();
    }

    // Check if user has the required permission
    if (!req.user?.permissions.includes(permission)) {
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
    // If user is Admin, allow all
    if (req.user?.role === "Admin") {
      return next();
    }

    // Check if user has at least one of the required permissions
    const hasPermission = permissions.some(permission => 
      req.user?.permissions.includes(permission)
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

// Check all permissions (user needs all)
export const checkAllPermissions = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // If user is Admin, allow all
    if (req.user?.role === "Admin") {
      return next();
    }

    // Check if user has all required permissions
    const hasAllPermissions = permissions.every(permission => 
      req.user?.permissions.includes(permission)
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

