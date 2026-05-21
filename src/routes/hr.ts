import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import User from "../models/User";
import LeaveRequest from "../models/LeaveRequest";
import Attendance from "../models/Attendance";
import TimesheetEntry from "../models/TimesheetEntry";
import Task from "../models/Task";
import Notification from "../models/Notification";
import { authenticate } from "../middleware/auth";
import { checkPermission, checkAnyPermission, checkEmployeeAttendance } from "../middleware/permissions";
import { PERMISSIONS } from "../utils/permissions";
import { logActivity } from "../middleware/activityLogger";
import { DEFAULT_ONBOARDING_CHECKLIST } from "../constants/hr";
import { uploadHrDocument } from "../utils/hrUpload";

const router = express.Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type not allowed: ${ext}`));
  },
});

const isAdmin = (role?: string) => role === "Admin";

const hasPerm = (req: express.Request, perm: string) =>
  isAdmin(req.user?.role) || (req.user?.permissions || []).includes(perm);

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

async function notifyHr(message: string, type: "leave" | "attendance" | "timesheet" | "hr", relatedId?: string) {
  try {
    await Notification.create({
      userId: null,
      message,
      type,
      relatedId: relatedId || null,
      read: false,
    });
  } catch (e) {
    console.error("HR notification failed:", e);
  }
}

async function notifyUser(userId: string, message: string, type: "leave" | "attendance" | "timesheet" | "hr", relatedId?: string) {
  try {
    await Notification.create({
      userId,
      message,
      type,
      relatedId: relatedId || null,
      read: false,
    });
  } catch (e) {
    console.error("User notification failed:", e);
  }
}

function ensureOnboarding(user: InstanceType<typeof User>) {
  if (!user.onboarding?.checklist?.length) {
    user.onboarding = {
      checklist: DEFAULT_ONBOARDING_CHECKLIST.map((c) => ({ ...c, completed: false })),
      documents: user.onboarding?.documents || [],
      completedAt: user.onboarding?.completedAt,
    };
  }
  return user;
}

function formatEmployee(user: InstanceType<typeof User>, manager?: { name: string; email: string } | null) {
  const u = user.toObject ? user.toObject() : user;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    phone: user.phone || "",
    employeeId: user.employeeId || "",
    department: user.department || "",
    joinDate: user.joinDate ? user.joinDate.toISOString().split("T")[0] : null,
    managerId: user.managerId?.toString() || null,
    managerName: manager?.name || null,
    onboarding: user.onboarding || { checklist: [], documents: [], completedAt: null },
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  };
}

// GET /api/hr/dashboard
router.get("/dashboard", checkAnyPermission([PERMISSIONS.HR_VIEW, PERMISSIONS.HR_LEAVE_REQUEST]), async (req, res) => {
  try {
    const canHr = hasPerm(req, PERMISSIONS.HR_VIEW) || isAdmin(req.user?.role);
    const uid = req.user!.id;

    const [activeEmployees, pendingSignups, pendingLeave, todayAttendance] = await Promise.all([
      User.countDocuments({ status: "Active" }),
      canHr ? User.countDocuments({ status: "Pending" }) : 0,
      canHr
        ? LeaveRequest.countDocuments({ status: "pending" })
        : LeaveRequest.countDocuments({ userId: uid, status: "pending" }),
      Attendance.countDocuments({
        date: { $gte: startOfDay(new Date()), $lte: endOfDay(new Date()) },
        ...(canHr ? {} : { userId: uid }),
      }),
    ]);

    res.json({
      activeEmployees,
      pendingSignups,
      pendingLeave,
      todayAttendance,
      canManage: canHr,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to load HR dashboard" });
  }
});

// ——— Employees ———
router.get("/employees", checkAnyPermission([PERMISSIONS.HR_VIEW, PERMISSIONS.USERS_VIEW]), async (req, res) => {
  try {
    const users = await User.find({ status: { $in: ["Active", "Inactive"] } }).sort({ name: 1 });
    const managerIds = [...new Set(users.map((u) => u.managerId?.toString()).filter(Boolean))] as string[];
    const managers = await User.find({ _id: { $in: managerIds } }).select("name email");
    const managerMap = new Map(managers.map((m) => [m._id.toString(), m]));

    res.json(
      users.map((u) =>
        formatEmployee(
          u,
          u.managerId ? managerMap.get(u.managerId.toString()) || null : null
        )
      )
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to fetch employees" });
  }
});

router.get("/employees/:id", checkAnyPermission([PERMISSIONS.HR_VIEW, PERMISSIONS.USERS_VIEW]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Employee not found" });
    ensureOnboarding(user);
    let manager = null;
    if (user.managerId) {
      const m = await User.findById(user.managerId).select("name email");
      manager = m ? { name: m.name, email: m.email } : null;
    }
    res.json(formatEmployee(user, manager));
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to fetch employee" });
  }
});

router.put("/employees/:id/profile", checkPermission(PERMISSIONS.HR_EMPLOYEES_MANAGE), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Employee not found" });

    const { phone, employeeId, department, joinDate, managerId } = req.body;
    if (phone !== undefined) user.phone = String(phone).trim();
    if (employeeId !== undefined) user.employeeId = String(employeeId).trim();
    if (department !== undefined) user.department = String(department).trim();
    if (joinDate !== undefined) user.joinDate = joinDate ? new Date(joinDate) : undefined;
    if (managerId !== undefined) {
      user.managerId = managerId && mongoose.Types.ObjectId.isValid(managerId)
        ? new mongoose.Types.ObjectId(managerId)
        : undefined;
    }

    ensureOnboarding(user);
    const profileItem = user.onboarding!.checklist.find((c) => c.key === "profile_complete");
    if (profileItem && user.phone && user.department) {
      profileItem.completed = true;
      profileItem.completedAt = new Date();
    }

    await user.save();
    await logActivity({
      userId: user._id.toString(),
      userName: user.name,
      userRole: user.role,
      performedBy: req.user!.id,
      performedByName: req.user!.name,
      performedByRole: req.user!.role,
      actionType: "Update",
      moduleName: "HR",
      description: `Updated employee profile for ${user.name}`,
      targetId: user._id.toString(),
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] as string,
      status: "Success",
    });
    res.json(formatEmployee(user));
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to update profile" });
  }
});

// ——— Onboarding ———
router.put("/employees/:id/onboarding/:key", checkPermission(PERMISSIONS.HR_ONBOARDING_MANAGE), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Employee not found" });
    ensureOnboarding(user);
    const item = user.onboarding!.checklist.find((c) => c.key === req.params.key);
    if (!item) return res.status(404).json({ error: "Checklist item not found" });

    const completed = req.body.completed !== false;
    item.completed = completed;
    item.completedAt = completed ? new Date() : undefined;

    const allDone = user.onboarding!.checklist.every((c) => c.completed);
    user.onboarding!.completedAt = allDone ? new Date() : undefined;

    await user.save();
    res.json({ onboarding: user.onboarding });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to update onboarding" });
  }
});

router.post(
  "/employees/:id/documents",
  checkPermission(PERMISSIONS.HR_ONBOARDING_MANAGE),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: "Employee not found" });
      ensureOnboarding(user);

      const { secure_url, bytes } = await uploadHrDocument(req.file.buffer, req.file.originalname);
      user.onboarding!.documents.push({
        fileName: req.file.originalname,
        fileUrl: secure_url,
        fileType: req.file.mimetype,
        fileSize: bytes,
        uploadedAt: new Date(),
      });

      const docItem = user.onboarding!.checklist.find((c) => c.key === "documents_uploaded");
      if (docItem) {
        docItem.completed = true;
        docItem.completedAt = new Date();
      }

      await user.save();
      res.status(201).json({ documents: user.onboarding!.documents });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to upload document" });
    }
  }
);

router.delete(
  "/employees/:id/documents/:docId",
  checkPermission(PERMISSIONS.HR_ONBOARDING_MANAGE),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user?.onboarding) return res.status(404).json({ error: "Not found" });
      user.onboarding.documents = user.onboarding.documents.filter(
        (d) => d._id?.toString() !== req.params.docId
      );
      await user.save();
      res.json({ documents: user.onboarding.documents });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to delete document" });
    }
  }
);

// ——— Leave ———
router.get("/leave", checkAnyPermission([PERMISSIONS.HR_LEAVE_VIEW, PERMISSIONS.HR_LEAVE_REQUEST]), async (req, res) => {
  try {
    const canViewAll = hasPerm(req, PERMISSIONS.HR_LEAVE_VIEW) || isAdmin(req.user?.role);
    const filter = canViewAll ? {} : { userId: req.user!.id };
    const status = req.query.status as string | undefined;
    if (status) (filter as any).status = status;

    const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 }).limit(200);
    const userIds = [...new Set(leaves.map((l) => l.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } }).select("name email role department");
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    res.json(
      leaves.map((l) => ({
        id: l._id.toString(),
        userId: l.userId.toString(),
        userName: userMap.get(l.userId.toString())?.name || "",
        userEmail: userMap.get(l.userId.toString())?.email || "",
        department: userMap.get(l.userId.toString())?.department || "",
        type: l.type,
        startDate: l.startDate.toISOString().split("T")[0],
        endDate: l.endDate.toISOString().split("T")[0],
        reason: l.reason,
        status: l.status,
        reviewNote: l.reviewNote,
        reviewedAt: l.reviewedAt,
        createdAt: l.createdAt,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to fetch leave requests" });
  }
});

router.post("/leave", checkPermission(PERMISSIONS.HR_LEAVE_REQUEST), async (req, res) => {
  try {
    const { type, startDate, endDate, reason } = req.body;
    if (!startDate || !endDate || !reason) {
      return res.status(400).json({ error: "startDate, endDate, and reason are required" });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return res.status(400).json({ error: "End date must be on or after start date" });

    const leave = await LeaveRequest.create({
      userId: req.user!.id,
      type: type || "casual",
      startDate: start,
      endDate: end,
      reason: String(reason).trim(),
      status: "pending",
    });

    const user = await User.findById(req.user!.id);
    await notifyHr(
      `Leave request from ${user?.name || req.user!.email} (${startDate} to ${endDate})`,
      "leave",
      leave._id.toString()
    );
    await logActivity({
      userId: req.user!.id,
      userName: user?.name || req.user!.email,
      userRole: user?.role,
      performedBy: req.user!.id,
      performedByName: req.user!.name,
      performedByRole: req.user!.role,
      actionType: "Create",
      moduleName: "HR",
      description: `Submitted leave request ${startDate} – ${endDate}`,
      targetId: leave._id.toString(),
      status: "Success",
    });

    res.status(201).json({ id: leave._id.toString(), status: leave.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to create leave request" });
  }
});

router.put("/leave/:id/approve", checkPermission(PERMISSIONS.HR_LEAVE_MANAGE), async (req, res) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ error: "Leave request not found" });
    if (leave.status !== "pending") return res.status(400).json({ error: "Leave is not pending" });

    leave.status = "approved";
    leave.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
    leave.reviewedAt = new Date();
    leave.reviewNote = req.body.reviewNote || "";
    await leave.save();

    await notifyUser(
      leave.userId.toString(),
      `Your leave request (${leave.startDate.toISOString().split("T")[0]} – ${leave.endDate.toISOString().split("T")[0]}) was approved.`,
      "leave",
      leave._id.toString()
    );
    await logActivity({
      userId: leave.userId.toString(),
      userName: "Leave",
      performedBy: req.user!.id,
      performedByName: req.user!.name,
      performedByRole: req.user!.role,
      actionType: "Approve",
      moduleName: "HR",
      description: `Approved leave request ${leave._id}`,
      targetId: leave._id.toString(),
      status: "Success",
    });

    res.json({ id: leave._id.toString(), status: leave.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to approve leave" });
  }
});

router.put("/leave/:id/reject", checkPermission(PERMISSIONS.HR_LEAVE_MANAGE), async (req, res) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ error: "Leave request not found" });
    if (leave.status !== "pending") return res.status(400).json({ error: "Leave is not pending" });

    leave.status = "rejected";
    leave.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
    leave.reviewedAt = new Date();
    leave.reviewNote = req.body.reviewNote || "Rejected";
    await leave.save();

    await notifyUser(
      leave.userId.toString(),
      `Your leave request was rejected. ${leave.reviewNote}`,
      "leave",
      leave._id.toString()
    );

    res.json({ id: leave._id.toString(), status: leave.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to reject leave" });
  }
});

// ——— Attendance ———
router.get("/attendance/today", checkEmployeeAttendance(), async (req, res) => {
  try {
    const today = startOfDay(new Date());
    const record = await Attendance.findOne({ userId: req.user!.id, date: today });
    res.json({
      date: today.toISOString().split("T")[0],
      checkIn: record?.checkIn || null,
      checkOut: record?.checkOut || null,
      status: record?.status || null,
      canCheckIn: !record?.checkIn,
      canCheckOut: !!record?.checkIn && !record?.checkOut,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to load today's attendance" });
  }
});

router.get("/attendance", checkAnyPermission([PERMISSIONS.HR_ATTENDANCE_VIEW, PERMISSIONS.HR_ATTENDANCE_MANAGE]), async (req, res) => {
  try {
    const canViewAll = hasPerm(req, PERMISSIONS.HR_ATTENDANCE_VIEW) || hasPerm(req, PERMISSIONS.HR_ATTENDANCE_MANAGE) || isAdmin(req.user?.role);
    const from = req.query.from ? startOfDay(new Date(String(req.query.from))) : startOfDay(new Date(Date.now() - 30 * 86400000));
    const to = req.query.to ? endOfDay(new Date(String(req.query.to))) : endOfDay(new Date());

    const filter: Record<string, unknown> = { date: { $gte: from, $lte: to } };
    if (!canViewAll) filter.userId = req.user!.id;
    else if (req.query.userId) filter.userId = req.query.userId;

    const records = await Attendance.find(filter).sort({ date: -1 }).limit(500);
    const userIds = [...new Set(records.map((r) => r.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } }).select("name email department");
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    res.json(
      records.map((r) => ({
        id: r._id.toString(),
        userId: r.userId.toString(),
        userName: userMap.get(r.userId.toString())?.name || "",
        department: userMap.get(r.userId.toString())?.department || "",
        date: r.date.toISOString().split("T")[0],
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status: r.status,
        notes: r.notes,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to fetch attendance" });
  }
});

router.post("/attendance/check-in", checkEmployeeAttendance(), async (req, res) => {
  try {
    const today = startOfDay(new Date());
    let record = await Attendance.findOne({ userId: req.user!.id, date: today });
    if (record?.checkIn) return res.status(400).json({ error: "Already checked in today" });

    if (!record) {
      record = await Attendance.create({
        userId: req.user!.id,
        date: today,
        checkIn: new Date(),
        status: "present",
        recordedBy: req.user!.id,
      });
    } else {
      record.checkIn = new Date();
      record.status = "present";
      await record.save();
    }

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      userRole: req.user!.role,
      performedBy: req.user!.id,
      performedByName: req.user!.name,
      performedByRole: req.user!.role,
      actionType: "Check-in",
      moduleName: "HR",
      description: "Attendance check-in",
      targetId: record._id.toString(),
      status: "Success",
    });

    await notifyHr(
      `${req.user!.name} checked in at ${record.checkIn!.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
      "attendance",
      record._id.toString()
    );

    res.json({ id: record._id.toString(), checkIn: record.checkIn });
  } catch (e: any) {
    if (e.code === 11000) return res.status(400).json({ error: "Attendance already recorded for today" });
    res.status(500).json({ error: e.message || "Check-in failed" });
  }
});

router.post("/attendance/check-out", checkEmployeeAttendance(), async (req, res) => {
  try {
    const today = startOfDay(new Date());
    const record = await Attendance.findOne({ userId: req.user!.id, date: today });
    if (!record?.checkIn) return res.status(400).json({ error: "Check in first" });
    if (record.checkOut) return res.status(400).json({ error: "Already checked out today" });

    record.checkOut = new Date();
    await record.save();

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      userRole: req.user!.role,
      performedBy: req.user!.id,
      performedByName: req.user!.name,
      performedByRole: req.user!.role,
      actionType: "Check-out",
      moduleName: "HR",
      description: "Attendance check-out",
      targetId: record._id.toString(),
      status: "Success",
    });

    await notifyHr(
      `${req.user!.name} checked out at ${record.checkOut!.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
      "attendance",
      record._id.toString()
    );

    res.json({ id: record._id.toString(), checkOut: record.checkOut });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Check-out failed" });
  }
});

router.post("/attendance", checkPermission(PERMISSIONS.HR_ATTENDANCE_MANAGE), async (req, res) => {
  try {
    const { userId, date, status, notes, checkIn, checkOut } = req.body;
    if (!userId || !date) return res.status(400).json({ error: "userId and date are required" });

    const day = startOfDay(new Date(date));
    const record = await Attendance.findOneAndUpdate(
      { userId, date: day },
      {
        userId,
        date: day,
        status: status || "present",
        notes: notes || "",
        checkIn: checkIn ? new Date(checkIn) : undefined,
        checkOut: checkOut ? new Date(checkOut) : undefined,
        recordedBy: req.user!.id,
      },
      { upsert: true, new: true }
    );

    await logActivity({
      userId: String(userId),
      userName: "Attendance",
      performedBy: req.user!.id,
      performedByName: req.user!.name,
      performedByRole: req.user!.role,
      actionType: "Update",
      moduleName: "HR",
      description: `Attendance recorded for user ${userId} on ${date}`,
      targetId: record._id.toString(),
      status: "Success",
    });

    res.json({ id: record._id.toString(), status: record.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to save attendance" });
  }
});

// ——— Timesheets ———
router.get("/timesheets", checkAnyPermission([PERMISSIONS.HR_TIMESHEET_VIEW, PERMISSIONS.HR_TIMESHEET_SUBMIT]), async (req, res) => {
  try {
    const canViewAll = hasPerm(req, PERMISSIONS.HR_TIMESHEET_VIEW) || isAdmin(req.user?.role);
    const filter: Record<string, unknown> = canViewAll ? {} : { userId: req.user!.id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) (filter.date as any).$gte = startOfDay(new Date(String(req.query.from)));
      if (req.query.to) (filter.date as any).$lte = endOfDay(new Date(String(req.query.to)));
    }

    const entries = await TimesheetEntry.find(filter).sort({ date: -1 }).limit(300);
    const userIds = [...new Set(entries.map((e) => e.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } }).select("name email");
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    res.json(
      entries.map((e) => ({
        id: e._id.toString(),
        userId: e.userId.toString(),
        userName: userMap.get(e.userId.toString())?.name || "",
        date: e.date.toISOString().split("T")[0],
        hours: e.hours,
        projectId: e.projectId?.toString() || null,
        taskId: e.taskId?.toString() || null,
        description: e.description,
        status: e.status,
        createdAt: e.createdAt,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to fetch timesheets" });
  }
});

router.post("/timesheets", checkPermission(PERMISSIONS.HR_TIMESHEET_SUBMIT), async (req, res) => {
  try {
    const { date, hours, projectId, taskId, description, status } = req.body;
    if (!date || hours == null) return res.status(400).json({ error: "date and hours are required" });

    const entry = await TimesheetEntry.create({
      userId: req.user!.id,
      date: startOfDay(new Date(date)),
      hours: Number(hours),
      projectId: projectId && mongoose.Types.ObjectId.isValid(projectId) ? projectId : undefined,
      taskId: taskId && mongoose.Types.ObjectId.isValid(taskId) ? taskId : undefined,
      description: description || "",
      status: status === "submitted" ? "submitted" : "draft",
    });

    if (entry.status === "submitted") {
      const user = await User.findById(req.user!.id);
      await notifyHr(
        `Timesheet submitted by ${user?.name || req.user!.email} for ${date} (${hours}h)`,
        "timesheet",
        entry._id.toString()
      );
    }

    res.status(201).json({ id: entry._id.toString(), status: entry.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to create timesheet" });
  }
});

router.put("/timesheets/:id", checkAnyPermission([PERMISSIONS.HR_TIMESHEET_SUBMIT, PERMISSIONS.HR_TIMESHEET_MANAGE]), async (req, res) => {
  try {
    const entry = await TimesheetEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Timesheet not found" });

    const canManage = hasPerm(req, PERMISSIONS.HR_TIMESHEET_MANAGE) || isAdmin(req.user?.role);
    if (!canManage && entry.userId.toString() !== req.user!.id) {
      return res.status(403).json({ error: "Not allowed to edit this timesheet" });
    }

    const { hours, description, status } = req.body;
    if (hours != null) entry.hours = Number(hours);
    if (description !== undefined) entry.description = description;
    if (status) {
      entry.status = status;
      if (status === "approved" || status === "rejected") {
        entry.reviewedBy = new mongoose.Types.ObjectId(req.user!.id);
        entry.reviewedAt = new Date();
      }
    }
    await entry.save();
    res.json({ id: entry._id.toString(), status: entry.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to update timesheet" });
  }
});

router.delete("/timesheets/:id", checkAnyPermission([PERMISSIONS.HR_TIMESHEET_SUBMIT, PERMISSIONS.HR_TIMESHEET_MANAGE]), async (req, res) => {
  try {
    const entry = await TimesheetEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Not found" });
    const canManage = hasPerm(req, PERMISSIONS.HR_TIMESHEET_MANAGE) || isAdmin(req.user?.role);
    if (!canManage && entry.userId.toString() !== req.user!.id) {
      return res.status(403).json({ error: "Not allowed" });
    }
    if (entry.status === "approved" && !canManage) {
      return res.status(400).json({ error: "Cannot delete approved timesheet" });
    }
    await entry.deleteOne();
    res.json({ message: "Deleted" });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to delete" });
  }
});

// ——— Tasks (workload) ———
router.get("/tasks", checkAnyPermission([PERMISSIONS.HR_VIEW, PERMISSIONS.VIEW_PERFORMANCE_REPORT]), async (req, res) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    const tasks = await Task.find(filter).sort({ dueDate: 1 }).limit(200).populate("assignedTo", "name email");
    res.json(
      tasks.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        description: t.description,
        assignedTo: (t.assignedTo as any)?._id?.toString() || t.assignedTo.toString(),
        assignedToName: (t.assignedTo as any)?.name || "",
        projectId: t.projectId?.toString() || null,
        estimatedHours: t.estimatedHours,
        status: t.status,
        priority: t.priority,
        startDate: t.startDate,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to fetch tasks" });
  }
});

router.post("/tasks", checkPermission(PERMISSIONS.HR_EMPLOYEES_MANAGE), async (req, res) => {
  try {
    const { title, description, assignedTo, projectId, estimatedHours, priority, dueDate } = req.body;
    if (!title || !assignedTo) return res.status(400).json({ error: "title and assignedTo are required" });

    const task = await Task.create({
      title,
      description: description || "",
      assignedTo,
      assignedBy: req.user!.id,
      projectId: projectId && mongoose.Types.ObjectId.isValid(projectId) ? projectId : undefined,
      estimatedHours,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : undefined,
      startDate: new Date(),
      status: "pending",
    });

    res.status(201).json({ id: task._id.toString() });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to create task" });
  }
});

router.put("/tasks/:id", checkPermission(PERMISSIONS.HR_EMPLOYEES_MANAGE), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const { title, description, status, priority, dueDate, estimatedHours } = req.body;
    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (status) {
      task.status = status;
      if (status === "completed") task.completedAt = new Date();
    }
    if (priority) task.priority = priority;
    if (dueDate) task.dueDate = new Date(dueDate);
    if (estimatedHours != null) task.estimatedHours = estimatedHours;
    await task.save();
    res.json({ id: task._id.toString(), status: task.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to update task" });
  }
});

export default router;
