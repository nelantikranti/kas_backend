/**
 * Lead import from Facebook Lead Ads and Google Ads.
 * Credentials are sent in the request body (not stored on server).
 */

import express from "express";
import mongoose from "mongoose";
import Lead from "../models/Lead";
import Group from "../models/Group";

const router = express.Router();

const FB_GRAPH_BASE = "https://graph.facebook.com/v18.0";

// Reuse lead ID generation from main leads route - will be required from leads.ts or duplicate minimal logic here
async function generateLeadId(): Promise<string> {
  const leads = await Lead.find({ leadId: { $exists: true, $ne: null } })
    .sort({ leadId: -1 })
    .limit(1);
  let nextNumber = 1;
  if (leads.length > 0 && leads[0].leadId) {
    const match = leads[0].leadId.match(/kas-(\d+)/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }
  return `kas-${String(nextNumber).padStart(5, "0")}`;
}

async function createLeadFromPayload(data: {
  name: string;
  company?: string;
  email: string;
  phone: string;
  source: string;
  assignedTo: string;
  notes?: string;
  groupId?: string | null;
}) {
  const leadId = await generateLeadId();
  let group: mongoose.Types.ObjectId | null = null;
  if (data.groupId && mongoose.Types.ObjectId.isValid(data.groupId)) {
    group = new mongoose.Types.ObjectId(data.groupId);
  }
  const lead = new Lead({
    leadId,
    name: data.name,
    company: data.company || "",
    email: data.email,
    phone: data.phone,
    source: data.source,
    stage: "New Lead",
    value: 0,
    assignedTo: data.assignedTo,
    notes: data.notes || "",
    lastContact: new Date(),
    group,
  });
  const saved = await lead.save();
  if (saved.group) {
    await Group.findByIdAndUpdate(saved.group, { $inc: { totalLeads: 1 } });
  }
  return saved;
}

// --- Facebook Lead Ads ---
// Required: accessToken (Page or User token with leads_retrieval).
// Either formId (direct form) or pageId (to list all forms and fetch their leads).
router.post("/import/facebook", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    const { accessToken, pageId, formId, assignedTo = "Sales Executive 1", groupId } = req.body as {
      accessToken?: string;
      pageId?: string;
      formId?: string;
      assignedTo?: string;
      groupId?: string | null;
    };

    if (!accessToken || typeof accessToken !== "string") {
      return res.status(400).json({
        error: "Missing or invalid credentials",
        details: "accessToken is required (Page or User access token with leads_retrieval permission).",
      });
    }

    if (!formId && !pageId) {
      return res.status(400).json({
        error: "Missing parameter",
        details: "Provide either formId (to fetch leads from one form) or pageId (to fetch leads from all leadgen forms on the page).",
      });
    }

    let formIds: string[] = [];
    if (formId) {
      formIds = [formId];
    } else if (pageId) {
      const formsRes = await fetch(
        `${FB_GRAPH_BASE}/${pageId}/leadgen_forms?access_token=${encodeURIComponent(accessToken)}`
      );
      if (!formsRes.ok) {
        const errText = await formsRes.text();
        return res.status(400).json({
          error: "Failed to fetch Facebook lead forms",
          details: errText || formsRes.statusText,
        });
      }
      const formsData = (await formsRes.json()) as { data?: { id: string }[] };
      formIds = (formsData.data || []).map((f) => f.id);
      if (formIds.length === 0) {
        return res.status(200).json({
          imported: 0,
          message: "No leadgen forms found for this page.",
        });
      }
    }

    const allLeads: { field_data?: { name: string; values: string[] }[] }[] = [];
    for (const fid of formIds) {
      const leadsRes = await fetch(
        `${FB_GRAPH_BASE}/${fid}/leads?access_token=${encodeURIComponent(accessToken)}`
      );
      if (!leadsRes.ok) continue;
      const leadsData = (await leadsRes.json()) as { data?: { field_data?: { name: string; values: string[] }[] }[] };
      const list = leadsData.data || [];
      allLeads.push(...list);
    }

    const byKey: Record<string, boolean> = {};
    let imported = 0;
    const errors: string[] = [];

    for (const lead of allLeads) {
      const fieldData = lead.field_data || [];
      const get = (names: string[]): string => {
        const f = fieldData.find((x) => names.some((n) => n.toLowerCase() === (x.name || "").toLowerCase()));
        return (f && f.values && f.values[0]) ? String(f.values[0]).trim() : "";
      };
      const name = get(["full_name", "name", "Full Name", "Name", "first_name", "last_name"])
        || (get(["first_name"]) + " " + get(["last_name"])).trim()
        || "Imported Lead";
      const email = get(["email", "Email", "email_address"]);
      const phone = get(["phone_number", "phone", "Phone", "Phone Number", "mobile", "telephone"]);
      const company = get(["company_name", "company", "Company", "business_name"]);

      if (!phone || phone.replace(/\D/g, "").length < 10) {
        errors.push(`Lead "${name || email || 'unknown'}": valid phone required`);
        continue;
      }
      const emailVal = email && email.includes("@") ? email : `${name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")}@imported.lead`;
      const key = `${emailVal}|${phone}`;
      if (byKey[key]) continue;
      byKey[key] = true;

      try {
        await createLeadFromPayload({
          name,
          company: company || name,
          email: emailVal,
          phone: phone.replace(/\D/g, "").slice(-10),
          source: "Facebook Ads",
          assignedTo,
          notes: "Imported from Facebook Lead Ads",
          groupId,
        });
        imported++;
      } catch (e: any) {
        errors.push(e.message || "Create failed");
      }
    }

    return res.status(200).json({
      imported,
      total: allLeads.length,
      errors: errors.slice(0, 10),
      message: `Imported ${imported} lead(s) from Facebook Ads.`,
    });
  } catch (error: any) {
    console.error("Facebook lead import error:", error);
    return res.status(500).json({
      error: "Facebook lead import failed",
      details: error.message || String(error),
    });
  }
});

// --- Google Ads Lead Form Submissions ---
// Required: clientId, clientSecret, refreshToken, customerId, developerToken.
// customerId: Google Ads customer ID (e.g. 123-456-7890).
router.post("/import/google-ads", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    const {
      clientId,
      clientSecret,
      refreshToken,
      customerId,
      developerToken,
      assignedTo = "Sales Executive 1",
      groupId,
    } = req.body as {
      clientId?: string;
      clientSecret?: string;
      refreshToken?: string;
      customerId?: string;
      developerToken?: string;
      assignedTo?: string;
      groupId?: string | null;
    };

    if (!clientId || !clientSecret || !refreshToken || !customerId || !developerToken) {
      return res.status(400).json({
        error: "Missing or invalid credentials",
        details:
          "clientId, clientSecret, refreshToken, customerId, and developerToken are required for Google Ads API.",
      });
    }

    // Dynamic require so backend runs even if google-ads-api is not installed yet
    let GoogleAdsApi: any;
    try {
      GoogleAdsApi = require("google-ads-api").GoogleAdsApi;
    } catch {
      return res.status(503).json({
        error: "Google Ads API library not installed",
        details: "Run: npm install google-ads-api",
      });
    }

    const client = new GoogleAdsApi({
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
    });

    const customerIdClean = String(customerId).replace(/-/g, "");
    const customer = client.Customer({
      customer_id: customerIdClean,
      refresh_token: refreshToken,
    });

    const results = await customer.query(`
      SELECT
        lead_form_submission_data.id,
        lead_form_submission_data.lead_form_submission_fields
      FROM lead_form_submission_data
      WHERE segments.date DURING LAST_30_DAYS
    `);

    const byKey: Record<string, boolean> = {};
    let imported = 0;
    const errors: string[] = [];

    for (const row of results) {
      const submission = (row as any).lead_form_submission_data;
      if (!submission) continue;

      const fields = submission.lead_form_submission_fields || [];
      const get = (names: string[]): string => {
        const f = fields.find((x: any) =>
          names.some((n) => (x.field_name || "").toLowerCase() === n.toLowerCase())
        );
        return (f && f.field_value) ? String(f.field_value).trim() : "";
      };
      const name =
        get(["FULL_NAME", "Full Name", "full_name", "name"]) ||
        (get(["First Name", "first_name"]) + " " + get(["Last Name", "last_name"])).trim() ||
        "Imported Lead";
      const email = get(["EMAIL", "Email", "email"]);
      const phone = get(["PHONE_NUMBER", "Phone", "phone_number", "phone"]);
      const company = get(["COMPANY_NAME", "Company", "company"]);

      if (!phone || phone.replace(/\D/g, "").length < 10) {
        errors.push(`Lead "${name || email || "unknown"}": valid phone required`);
        continue;
      }
      const emailVal =
        email && email.includes("@")
          ? email
          : `${name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")}@imported.lead`;
      const key = `${emailVal}|${phone}`;
      if (byKey[key]) continue;
      byKey[key] = true;

      try {
        await createLeadFromPayload({
          name,
          company: company || name,
          email: emailVal,
          phone: phone.replace(/\D/g, "").slice(-10),
          source: "Google Ads",
          assignedTo,
          notes: "Imported from Google Ads lead form",
          groupId,
        });
        imported++;
      } catch (e: any) {
        errors.push(e.message || "Create failed");
      }
    }

    return res.status(200).json({
      imported,
      total: results.length,
      errors: errors.slice(0, 10),
      message: `Imported ${imported} lead(s) from Google Ads.`,
    });
  } catch (error: any) {
    console.error("Google Ads lead import error:", error);
    return res.status(500).json({
      error: "Google Ads lead import failed",
      details: error.message || String(error),
    });
  }
});

export default router;
