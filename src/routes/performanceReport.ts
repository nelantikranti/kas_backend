import express from "express";
import { authenticate } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { PERMISSIONS } from "../utils/permissions";
import { getPerformanceReport } from "../controllers/performanceController";

const router = express.Router();

// GET /api/performance-report
router.get("/", authenticate, checkPermission(PERMISSIONS.VIEW_PERFORMANCE_REPORT), getPerformanceReport);

export default router;

