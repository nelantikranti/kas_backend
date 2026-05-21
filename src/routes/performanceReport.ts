import express from "express";
import { authenticate } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { PERMISSIONS } from "../utils/permissions";
import { getPerformanceReport, exportPerformanceReport } from "../controllers/performanceController";

const router = express.Router();

// GET /api/performance-report
router.get("/", authenticate, checkPermission(PERMISSIONS.VIEW_PERFORMANCE_REPORT), getPerformanceReport);

// GET /api/performance-report/export?format=csv|pdf&from=&to=
router.get(
  "/export",
  authenticate,
  checkPermission(PERMISSIONS.HR_PERFORMANCE_EXPORT),
  exportPerformanceReport
);

export default router;

