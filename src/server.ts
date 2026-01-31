import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "./config/database";
import leadsRoutes from "./routes/leads";
import quotationsRoutes from "./routes/quotations";
import projectsRoutes from "./routes/projects";
import amcRoutes from "./routes/amc";
import usersRoutes from "./routes/users";
import dashboardRoutes from "./routes/dashboard";
import demoRoutes from "./routes/demo";
import contactRoutes from "./routes/contact";
import blogsRoutes from "./routes/blogs";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import notificationsRoutes from "./routes/notifications";

dotenv.config();

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
  "http://localhost:3000",
  "https://kascrm-frontend.onrender.com",
  "https://kas-crm-frontend.onrender.com",
].filter(Boolean); // Remove any undefined values

// Middleware - CORS with flexible origin handling
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In production, allow the origin if FRONTEND_URL is set
      // This handles cases where URL might have slight variations
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));
// Increase body parser limits to handle large meeting notes and documents
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "KAS CRM Backend API is running" });
});

// API Routes
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


