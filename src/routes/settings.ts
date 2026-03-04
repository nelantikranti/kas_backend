/**
 * Settings / integrations (e.g. Facebook Lead Ads credentials).
 * Stored on backend; token never returned to client.
 */

import express from "express";
import { authenticate } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import { PERMISSIONS } from "../utils/permissions";
import Integration from "../models/Integration";

const router = express.Router();
const FB_LEAD_ADS_KEY = "facebook_lead_ads";
const GOOGLE_ADS_KEY = "google_ads";

// GET Facebook Lead Ads settings (configured status + pageId only; no token)
router.get("/facebook-lead-ads", authenticate, async (req, res) => {
  try {
    const doc = await Integration.findOne({ key: FB_LEAD_ADS_KEY });
    if (!doc || !doc.accessToken?.trim() || !doc.pageId?.trim()) {
      return res.status(200).json({ configured: false, pageId: "" });
    }
    return res.status(200).json({
      configured: true,
      pageId: (doc.pageId || "").trim(),
    });
  } catch (e: any) {
    console.error("GET facebook-lead-ads error:", e);
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

// PUT Facebook Lead Ads settings (save token, pageId) – requires settings:manage
// accessToken is optional: if provided it is updated; if omitted/empty, existing token is kept.
router.put("/facebook-lead-ads", authenticate, checkPermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const accessTokenRaw = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";

    const doc = await Integration.findOne({ key: FB_LEAD_ADS_KEY });
    const existingToken = (doc?.accessToken && typeof doc.accessToken === "string") ? doc.accessToken.trim() : "";
    const accessToken = accessTokenRaw || existingToken;

    if (!accessToken) {
      return res.status(400).json({ error: "Access Token is required. Enter a token to save or update." });
    }
    if (!pageId) {
      return res.status(400).json({ error: "Page ID is required." });
    }

    await Integration.findOneAndUpdate(
      { key: FB_LEAD_ADS_KEY },
      { $set: { accessToken, pageId } },
      { upsert: true, new: true }
    );
    return res.status(200).json({
      success: true,
      message: "Facebook Lead Ads credentials saved.",
      configured: true,
      pageId,
    });
  } catch (e: any) {
    console.error("PUT facebook-lead-ads error:", e);
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

// GET Google Ads settings (configured status + webhook info only; no secrets exposed)
router.get("/google-ads", authenticate, async (req, res) => {
  try {
    const doc = await Integration.findOne({ key: GOOGLE_ADS_KEY });
    const hasSecret =
      doc && typeof (doc as any).webhookSecret === "string" && (doc as any).webhookSecret.trim() !== "";
    return res.status(200).json({
      configured: hasSecret,
      webhookUrl: (doc as any)?.webhookUrl || "",
      secretSet: hasSecret,
    });
  } catch (e: any) {
    console.error("GET google-ads error:", e);
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

// PUT Google Ads settings (save webhook URL + secret) – requires settings:manage
router.put("/google-ads", authenticate, checkPermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const webhookUrl = typeof (body as any).webhookUrl === "string" ? (body as any).webhookUrl.trim() : "";
    const webhookSecret = typeof (body as any).webhookSecret === "string" ? (body as any).webhookSecret.trim() : "";

    if (!webhookUrl) {
      return res.status(400).json({
        error: "Webhook URL is required for Google Ads.",
      });
    }
    if (!webhookSecret) {
      return res.status(400).json({
        error: "Webhook secret key is required for Google Ads.",
      });
    }

    await Integration.findOneAndUpdate(
      { key: GOOGLE_ADS_KEY },
      { $set: { webhookUrl, webhookSecret } },
      { upsert: true, new: true }
    );
    return res.status(200).json({
      success: true,
      message: "Google Ads webhook settings saved.",
      configured: true,
      webhookUrl,
    });
  } catch (e: any) {
    console.error("PUT google-ads error:", e);
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
