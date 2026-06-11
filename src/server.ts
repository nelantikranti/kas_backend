// dotenv MUST be loaded before any other import so that process.env values
// are available when route modules read them at module-load time.
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
// Register User model before route imports (avoids stale Mongoose role enum on hot-reload)
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("./models/User");

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import { connectDB } from "./config/database";
// Use require to import routers to avoid default export interop issues during ts-node runtime
// eslint-disable-next-line @typescript-eslint/no-var-requires
const leadsRoutes = require("./routes/leads").default || require("./routes/leads");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const leadsImportRoutes = require("./routes/leadsImport").default || require("./routes/leadsImport");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const quotationsRoutes = require("./routes/quotations").default || require("./routes/quotations");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const projectsRoutes = require("./routes/projects").default || require("./routes/projects");
import amcRoutes from "./routes/amc";
import { activityMiddleware } from "./middleware/activityLogger";
import usersRoutes from "./routes/users";
import dashboardRoutes from "./routes/dashboard";
import demoRoutes from "./routes/demo";
import contactRoutes from "./routes/contact";
import blogsRoutes from "./routes/blogs";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import notificationsRoutes from "./routes/notifications";
import activitiesRoutes from "./routes/activities";
import testimonialsRoutes from "./routes/testimonials";
import groupsRoutes from "./routes/groups";
import pipelinesRoutes from "./routes/pipelines";
import performanceReportRoutes from "./routes/performanceReport";
import rolePermissionsRoutes from "./routes/rolePermissions";
import rolesRoutes from "./routes/roles";
import hrRoutes from "./routes/hr";

// Handle unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process - let the server continue running
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit the process - let the server continue running
});

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = '0.0.0.0'; 
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Connect to MongoDB (seeding happens inside connectDB)
// Don't await - let it connect in background, server will start regardless
connectDB().catch((error) => {
  console.error('❌ Failed to connect to MongoDB:', error.message);
  console.log('⚠️  Server will continue running without database connection');
});

// CORS Configuration - Support multiple origins
const allowedOrigins = [
  FRONTEND_URL,
  "https://www.kashomeelevators.com",
  "https://kashomeelevators.com",
  "http://localhost:3000",
  "https://kascrm-frontend.onrender.com",
  "https://kas-crm-frontend.onrender.com",
].filter(Boolean); // Remove any undefined values

// Middleware - CORS (reflect origin in dev; allowlist in production)
const isDev = process.env.NODE_ENV !== "production";
app.use(cors({
  origin: isDev
    ? true
    : function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked for origin: ${origin}`));
        }
      },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Hub-Signature-256"],
  optionsSuccessStatus: 204,
}));
// Increase body parser limits to handle large meeting notes and documents.
// The verify callback captures the raw body buffer for Facebook webhook signature verification
// without interfering with normal JSON parsing for all other routes.
app.use(express.json({
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    if (buf && buf.length) {
      req.rawBody = buf.toString("utf8");
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// NOTE: The /uploads directory is intentionally NOT served as public static files.
// All document access must go through the authenticated API endpoints:
// GET /api/projects/:id/documents/:docId/view  (inline preview)
// GET /api/projects/:id/documents/:docId/download  (file download)

// Simple request logger to help debug 404s (method + url)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "KAS CRM Backend API is running" });
});

// API Routes
// Temporarily mount routes without activityMiddleware to avoid accidental multiple responses during debugging
app.use("/api/leads", leadsImportRoutes); // Import from Facebook/Google Ads (must be before leads)
app.use("/api/facebook-leads", leadsImportRoutes); // Alias so Meta webhook URL /api/facebook-leads/webhook works
app.use("/api/leads", leadsRoutes);
app.use("/api/quotations", quotationsRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/amc", amcRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/blogs", blogsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/activities", activitiesRoutes);
app.use("/api/testimonials", testimonialsRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/pipelines", pipelinesRoutes);
app.use("/api/performance-report", performanceReportRoutes);
app.use("/api/role-permissions", rolePermissionsRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/hr", hrRoutes);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const settingsRoutes = require("./routes/settings").default || require("./routes/settings");
app.use("/api/settings", settingsRoutes);

// Debug route to list registered API routes
app.get("/api/_routes", (req, res) => {
  try {
    const routes: string[] = [];
    // @ts-ignore - inspect internal stack
    app._router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        // routes registered directly on the app
        const methods = Object.keys(middleware.route.methods).join(",");
        routes.push(`${methods.toUpperCase()} ${middleware.route.path}`);
      } else if (middleware.name === "router") {
        // router middleware 
        middleware.handle.stack.forEach((handler: any) => {
          const route = handler.route;
          if (route) {
            const methods = Object.keys(route.methods).join(",");
            routes.push(`${methods.toUpperCase()} ${middleware.regexp} -> ${route.path}`);
          }
        });
      }
    });
    res.json({ routes });
  } catch (err) {
    res.status(500).json({ error: "Failed to enumerate routes", details: String(err) });
  }
});

// Error handling middleware - must be last
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error middleware triggered:", err);
  console.error("Error message:", err?.message);
  console.error("Error stack:", err?.stack);
  
  // Make sure response hasn't been sent already - if so, just return
  if (res.headersSent) {
    console.error("Response headers already sent, cannot send error response");
    return;
  }
  
  // Handle payload too large errors
  if (err.type === 'entity.too.large' || err.message?.includes('too large')) {
    return res.status(413).json({ 
      error: "Payload too large", 
      message: "The request payload is too large. Please reduce the size of the data being sent." 
    });
  }
  
  // Handle other errors
  const statusCode = err.status || err.statusCode || 500;
  let errorMessage = "Something went wrong!";
  
  if (err?.message) {
    errorMessage = err.message;
  } else if (typeof err === 'string') {
    errorMessage = err;
  } else if (err?.toString) {
    errorMessage = err.toString();
  }
  
  res.status(statusCode).json({ 
    error: errorMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: err?.stack })
  });
});

// Start server
const server = app.listen(PORT, HOST, () => {  
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
  console.log(`📡 API endpoints available at http://${HOST}:${PORT}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle server errors
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error('❌ Server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    mongoose.connection.close().then(() => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    }).catch((err) => {
      console.error('❌ Error closing MongoDB connection:', err);
      process.exit(0);
    });
  });
});


