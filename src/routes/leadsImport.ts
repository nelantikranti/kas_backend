/**
 * Lead import from Facebook Lead Ads and Google Ads.
 * Facebook: credentials can be sent in body (/import/facebook) or read from backend settings (/sync/facebook).
 */

import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import Lead from "../models/Lead";
import Group from "../models/Group";
import Integration from "../models/Integration";
import { authenticate } from "../middleware/auth";

const router = express.Router();
const FB_LEAD_ADS_KEY = "facebook_lead_ads";

const FB_GRAPH_BASE = (process.env.FB_GRAPH_BASE || "https://graph.facebook.com/v18.0").trim().replace(/\/$/, "");
const FACEBOOK_WEBHOOK_VERIFY_TOKEN = (process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || "").trim();
const FACEBOOK_APP_SECRET = (process.env.FACEBOOK_APP_SECRET || "").trim();

/**
 * Verifies the X-Hub-Signature-256 header Facebook sends with every POST webhook.
 * If FACEBOOK_APP_SECRET is not set, verification is skipped (dev fallback — set it in production).
 */
function verifyFacebookSignature(req: express.Request): boolean {
  if (!FACEBOOK_APP_SECRET) {
    console.warn("[FB Webhook] FACEBOOK_APP_SECRET not set — skipping signature verification. Set it in .env for security.");
    return true;
  }
  const signature = req.headers["x-hub-signature-256"];
  if (!signature || typeof signature !== "string") {
    console.error("[FB Webhook] Missing X-Hub-Signature-256 header.");
    return false;
  }
  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    console.warn("[FB Webhook] rawBody not available — skipping signature check. Ensure raw body is captured in middleware.");
    return true;
  }
  const expected = "sha256=" + crypto.createHmac("sha256", FACEBOOK_APP_SECRET).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

async function leadExists(email: string, phone: string): Promise<boolean> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return false;
  const existing = await Lead.findOne({ email, phone: normalizedPhone }).select("_id").lean();
  return !!existing;
}

async function fetchAllFacebookPages<T extends { id: string }>(
  initialUrl: string
): Promise<T[]> {
  const all: T[] = [];
  let url: string | null = initialUrl;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || res.statusText);
    }
    const data = (await res.json()) as { data?: T[]; paging?: { next?: string } };
    if (Array.isArray(data.data)) {
      all.push(...data.data);
    }
    url = data.paging?.next || null;
  }

  return all;
}

async function fetchAllLeadsForForms(
  formIds: string[],
  accessToken: string
): Promise<{ field_data?: { name: string; values: string[] }[] }[]> {
  const allLeads: { field_data?: { name: string; values: string[] }[] }[] = [];

  for (const fid of formIds) {
    let url: string | null = `${FB_GRAPH_BASE}/${fid}/leads?access_token=${encodeURIComponent(accessToken)}`;
    while (url) {
      const leadsRes = await fetch(url);
      if (!leadsRes.ok) break;
      const leadsData = (await leadsRes.json()) as {
        data?: { field_data?: { name: string; values: string[] }[] }[];
        paging?: { next?: string };
      };
      const list = leadsData.data || [];
      allLeads.push(...list);
      url = leadsData.paging?.next || null;
    }
  }

  return allLeads;
}

/**
 * Facebook Lead Ads API requires a Page Access Token for /{page-id}/leadgen_forms.
 * If the provided token is a User Access Token and we get error 190, exchange it for
 * the Page Access Token via me/accounts.
 */
async function resolvePageAccessToken(accessToken: string, pageId: string): Promise<string> {
  const formsUrl = `${FB_GRAPH_BASE}/${pageId}/leadgen_forms?access_token=${encodeURIComponent(accessToken)}`;
  const formsRes = await fetch(formsUrl);
  const formsText = await formsRes.text();
  if (formsRes.ok) return accessToken;

  let errBody: { error?: { code?: number; message?: string } } = {};
  try {
    errBody = JSON.parse(formsText);
  } catch {
    // non-JSON response
  }
  const is190 = errBody?.error?.code === 190;
  if (!is190) return accessToken; // not a token-type error, let caller handle

  const accountsUrl = `${FB_GRAPH_BASE}/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(accessToken)}`;
  const accountsRes = await fetch(accountsUrl);
  if (!accountsRes.ok) {
    const msg = (await accountsRes.text()) || accountsRes.statusText;
    throw new Error(
      `Could not get Page Access Token. Ensure the token has "pages_show_list" or "manage_pages" and that you manage the page. ${msg}`
    );
  }
  const accountsData = (await accountsRes.json()) as { data?: { id: string; access_token: string }[] };
  const pages = accountsData.data || [];
  const page = pages.find((p) => p.id === pageId);
  if (!page?.access_token) {
    throw new Error(
      `No Page Access Token found for Page ID "${pageId}". Ensure the token is for a user who manages this page and that "pages_show_list" or "manage_pages" is granted.`
    );
  }
  return page.access_token;
}

// Generate a unique lead ID by aggregating the highest numeric suffix in the DB.
// Uses $regex + $max in aggregation to avoid string-sort issues (e.g. "kas-00009" > "kas-00010" alphabetically).
async function generateLeadId(): Promise<string> {
  const result = await Lead.aggregate([
    { $match: { leadId: { $regex: /^kas-\d+$/ } } },
    {
      $project: {
        num: {
          $toInt: { $arrayElemAt: [{ $split: ["$leadId", "-"] }, 1] },
        },
      },
    },
    { $group: { _id: null, maxNum: { $max: "$num" } } },
  ]);
  const nextNumber = result.length > 0 && result[0].maxNum ? result[0].maxNum + 1 : 1;
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
// Required: accessToken and pageId. Uses Page ID to fetch all leadgen forms and their leads.
router.post("/import/facebook", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const raw = body as {
      accessToken?: string;
      pageId?: string;
      assignedTo?: string;
      groupId?: string | null;
    };
    const accessToken = typeof raw.accessToken === "string" ? raw.accessToken.trim() : "";
    const pageId = typeof raw.pageId === "string" ? raw.pageId.trim() : "";
    const assignedTo = (typeof raw.assignedTo === "string" ? raw.assignedTo.trim() : "") || "Sales Executive 1";
    const groupId = raw.groupId;

    if (!accessToken) {
      return res.status(400).json({
        error: "Missing or invalid credentials",
        details: "accessToken is required. Use a User or Page token with leads_retrieval; for User token also include pages_show_list or manage_pages so we can get the Page token.",
      });
    }

    if (!pageId) {
      return res.status(400).json({
        error: "Missing parameter",
        details: "Page ID is required. Set it in Settings > Facebook Lead Ads Integration.",
      });
    }

    let tokenToUse = accessToken;
    try {
      tokenToUse = await resolvePageAccessToken(accessToken, pageId);
    } catch (resolveErr: any) {
      return res.status(400).json({
        error: "Failed to get Page Access Token",
        details: resolveErr.message || String(resolveErr),
      });
    }

    const formsUrl = `${FB_GRAPH_BASE}/${pageId}/leadgen_forms?access_token=${encodeURIComponent(
      tokenToUse
    )}`;
    let formIds: string[] = [];
    try {
      const forms = await fetchAllFacebookPages<{ id: string }>(formsUrl);
      formIds = forms.map((f) => f.id);
    } catch (err: any) {
      return res.status(400).json({
        error: "Failed to fetch Facebook lead forms",
        details: err.message || String(err),
      });
    }

    if (formIds.length === 0) {
      return res.status(200).json({
        imported: 0,
        message: "No leadgen forms found for this page.",
      });
    }

    const allLeads = await fetchAllLeadsForForms(formIds, tokenToUse);

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

      const normalizedPhone = phone ? normalizePhone(phone) : "";
      if (!normalizedPhone || normalizedPhone.length < 10) {
        errors.push(`Lead "${name || email || 'unknown'}": valid phone required`);
        continue;
      }
      const emailVal = email && email.includes("@") ? email : `${name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")}@imported.lead`;
      const key = `${emailVal}|${normalizedPhone}`;
      if (byKey[key]) continue;
      byKey[key] = true;

      try {
        const exists = await leadExists(emailVal, normalizedPhone);
        if (exists) {
          continue;
        }
        await createLeadFromPayload({
          name,
          company: company || name,
          email: emailVal,
          phone: normalizedPhone,
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

// --- Sync Facebook (uses credentials stored in backend Settings) ---
// Uses GET so that syncing is a read-style operation from the client's perspective.
// assignedTo and groupId are provided as query parameters.
router.get("/sync/facebook", authenticate, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }
    const doc = await Integration.findOne({ key: FB_LEAD_ADS_KEY });
    const accessToken = (doc?.accessToken && typeof doc.accessToken === "string") ? doc.accessToken.trim() : "";
    const pageId = (doc?.pageId && typeof doc.pageId === "string") ? doc.pageId.trim() : "";

    if (!accessToken) {
      return res.status(400).json({
        error: "Facebook Lead Ads not configured",
        details: "Set Access Token and Page ID in Settings > Facebook Lead Ads Integration.",
      });
    }
    if (!pageId) {
      return res.status(400).json({
        error: "Facebook Lead Ads not configured",
        details: "Set Page ID in Settings > Facebook Lead Ads Integration.",
      });
    }

    let tokenToUse = accessToken;
    try {
      tokenToUse = await resolvePageAccessToken(accessToken, pageId);
    } catch (resolveErr: any) {
      return res.status(400).json({
        error: "Failed to get Page Access Token",
        details: resolveErr.message || String(resolveErr),
      });
    }

    const assignedTo =
      (typeof req.query.assignedTo === "string" ? (req.query.assignedTo as string).trim() : "") ||
      "Sales Executive 1";
    const groupId =
      typeof req.query.groupId === "string" && (req.query.groupId as string).trim()
        ? (req.query.groupId as string).trim()
        : null;

    const formsUrl = `${FB_GRAPH_BASE}/${pageId}/leadgen_forms?access_token=${encodeURIComponent(
      tokenToUse
    )}`;
    let formIds: string[] = [];
    try {
      const forms = await fetchAllFacebookPages<{ id: string }>(formsUrl);
      formIds = forms.map((f) => f.id);
    } catch (err: any) {
      return res.status(400).json({
        error: "Failed to fetch Facebook lead forms",
        details: err.message || String(err),
      });
    }

    if (formIds.length === 0) {
      return res.status(200).json({
        imported: 0,
        message: "No leadgen forms found for this page.",
      });
    }

    const allLeads = await fetchAllLeadsForForms(formIds, tokenToUse);

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

      const normalizedPhone = phone ? normalizePhone(phone) : "";
      if (!normalizedPhone || normalizedPhone.length < 10) {
        errors.push(`Lead "${name || email || 'unknown'}": valid phone required`);
        continue;
      }
      const emailVal = email && email.includes("@") ? email : `${name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")}@imported.lead`;
      const key = `${emailVal}|${normalizedPhone}`;
      if (byKey[key]) continue;
      byKey[key] = true;

      try {
        const exists = await leadExists(emailVal, normalizedPhone);
        if (exists) {
          continue;
        }
        await createLeadFromPayload({
          name,
          company: company || name,
          email: emailVal,
          phone: normalizedPhone,
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
    console.error("Facebook sync error:", error);
    return res.status(500).json({
      error: "Facebook sync failed",
      details: error.message || String(error),
    });
  }
});

// --- Google Ads Lead Form Webhook ---
// Google Ads will POST lead data to this endpoint.
// Verification: the request must include ?lead_key=YOUR_SECRET in the query string.
router.post("/webhook/google-ads", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    const leadKey = typeof req.query.lead_key === "string" ? req.query.lead_key.trim() : "";
    const expectedSecret = (process.env.GOOGLE_ADS_WEBHOOK_SECRET || "").trim();

    if (!expectedSecret) {
      return res.status(503).json({
        error: "Google Ads webhook not configured",
        details: "Server missing GOOGLE_ADS_WEBHOOK_SECRET. Set it in environment variables.",
      });
    }

    if (!leadKey || leadKey !== expectedSecret) {
      return res.status(401).json({ error: "Invalid webhook secret key" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const userColumnData = Array.isArray((body as any).user_column_data)
      ? (body as any).user_column_data
      : [];

    const getById = (ids: string[]): string => {
      const upperIds = ids.map((x) => x.toUpperCase());
      const entry = userColumnData.find((x: any) =>
        upperIds.includes(String(x.column_id || "").toUpperCase())
      );
      return entry && entry.string_value ? String(entry.string_value).trim() : "";
    };

    const name =
      getById(["FULL_NAME"]) ||
      `${getById(["FIRST_NAME"])} ${getById(["LAST_NAME"])}`.trim() ||
      "Imported Lead";
    const email = getById(["EMAIL"]);
    const phone = getById(["PHONE_NUMBER"]);
    const company = getById(["COMPANY_NAME"]);

    if (!phone || phone.replace(/\D/g, "").length < 10) {
      return res.status(400).json({ error: "Valid phone number is required" });
    }

    const emailVal =
      email && email.includes("@")
        ? email
        : `${name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")}@imported.lead`;

    const assignedTo =
      (typeof req.query.assignedTo === "string" ? (req.query.assignedTo as string).trim() : "") ||
      "Sales Executive 1";
    const groupId =
      typeof req.query.groupId === "string" && (req.query.groupId as string).trim()
        ? (req.query.groupId as string).trim()
        : null;

    await createLeadFromPayload({
      name,
      company: company || name,
      email: emailVal,
      phone: phone.replace(/\D/g, "").slice(-10),
      source: "Google Ads (Webhook)",
      assignedTo,
      notes: "Imported from Google Ads lead form webhook",
      groupId,
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Google Ads webhook error:", error);
    return res.status(500).json({
      error: "Google Ads webhook processing failed",
      details: error.message || String(error),
    });
  }
});

// --- Facebook Lead Ads Webhook ---
// 1) Verification (GET): Facebook sends hub.mode, hub.verify_token, hub.challenge
// 2) Delivery (POST): Facebook sends leadgen notifications; we fetch lead details using stored credentials

// Shared handler so both /webhook/facebook and /webhook respond to Meta's callback URL
function handleFacebookWebhookVerify(req: express.Request, res: express.Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    console.warn(
      "Facebook webhook verification attempted but FACEBOOK_WEBHOOK_VERIFY_TOKEN is not set on the server."
    );
  }

  if (mode === "subscribe" && token === FACEBOOK_WEBHOOK_VERIFY_TOKEN && challenge) {
    return res.status(200).send(String(challenge));
  }

  return res.sendStatus(403);
}

// Verification endpoint - handles both URL patterns Meta may call
router.get("/webhook/facebook", handleFacebookWebhookVerify);
router.get("/webhook", handleFacebookWebhookVerify);

// Shared delivery handler
async function handleFacebookWebhookDelivery(req: express.Request, res: express.Response) {
  try {
    // Always respond 200 immediately so Facebook doesn't retry on slow DB/Graph API calls.
    // We process asynchronously after sending the response.
    if (!verifyFacebookSignature(req)) {
      console.error("[FB Webhook] Signature verification failed — rejecting request.");
      return res.status(401).json({ error: "Invalid signature" });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection unavailable." });
    }

    const doc = await Integration.findOne({ key: FB_LEAD_ADS_KEY });
    const accessToken =
      doc && typeof doc.accessToken === "string" ? doc.accessToken.trim() : "";

    if (!accessToken) {
      console.error("[FB Webhook] No access token configured in Integration settings.");
      return res.status(503).json({
        error: "Facebook Lead Ads not configured",
        details: "Set Access Token and Page ID in Settings > Facebook Lead Ads Integration.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    console.log("[FB Webhook] Received payload:", JSON.stringify(body).slice(0, 500));

    const entries = Array.isArray((body as any).entry) ? (body as any).entry : [];

    const leadChanges: any[] = [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const ch of changes) {
        if (ch && ch.field === "leadgen") {
          leadChanges.push(ch);
        }
      }
    }

    if (leadChanges.length === 0) {
      console.log("[FB Webhook] No leadgen changes found in payload. Fields present:", entries.flatMap((e: any) => (e.changes || []).map((c: any) => c.field)));
      return res.status(200).json({ received: 0, imported: 0, message: "No leadgen changes in payload." });
    }

    console.log(`[FB Webhook] Processing ${leadChanges.length} leadgen change(s).`);
    let imported = 0;
    const errors: string[] = [];

    for (const change of leadChanges) {
      const value = change.value || {};
      const leadgenId: string | undefined = value.leadgen_id;

      if (!leadgenId) {
        errors.push("Missing leadgen_id in webhook change.");
        continue;
      }

      try {
        // leadgen_id is a numeric string — do NOT encodeURIComponent it, just put it in the path
        const leadUrl = `${FB_GRAPH_BASE}/${leadgenId}?fields=field_data&access_token=${encodeURIComponent(accessToken)}`;
        console.log(`[FB Webhook] Fetching lead ${leadgenId} from Graph API: ${leadUrl.replace(encodeURIComponent(accessToken), "***")}`);
        const leadRes = await fetch(leadUrl);
        if (!leadRes.ok) {
          const errText = await leadRes.text();
          console.error(`[FB Webhook] Failed to fetch lead ${leadgenId}:`, errText);
          errors.push(
            `Failed to fetch lead data for ${leadgenId}: ${errText || leadRes.statusText}`
          );
          continue;
        }

        const leadData = (await leadRes.json()) as {
          field_data?: { name: string; values: string[] }[];
        };
        console.log(`[FB Webhook] Lead ${leadgenId} field_data:`, JSON.stringify(leadData.field_data));
        const fieldData = leadData.field_data || [];

        const get = (names: string[]): string => {
          const f = fieldData.find((x) =>
            names.some((n) => n.toLowerCase() === (x.name || "").toLowerCase())
          );
          return f && Array.isArray(f.values) && f.values[0]
            ? String(f.values[0]).trim()
            : "";
        };

        const name =
          get(["full_name", "name", "Full Name", "Name", "first_name", "last_name"]) ||
          `${get(["first_name"])} ${get(["last_name"])}`.trim() ||
          "Imported Lead";
        const email = get(["email", "Email", "email_address"]);
        const phone = get([
          "phone_number",
          "phone",
          "Phone",
          "Phone Number",
          "mobile",
          "telephone",
        ]);
        const company = get(["company_name", "company", "Company", "business_name"]);

        const normalizedPhone = phone ? normalizePhone(phone) : "";
        if (!normalizedPhone || normalizedPhone.length < 10) {
          errors.push(`Lead "${name || email || "unknown"}": valid phone required`);
          continue;
        }

        const emailVal =
          email && email.includes("@")
            ? email
            : `${name
                .toLowerCase()
                .replace(/\s+/g, ".")
                .replace(/[^a-z0-9.]/g, "")}@imported.lead`;

        const exists = await leadExists(emailVal, normalizedPhone);
        if (exists) {
          continue;
        }

        await createLeadFromPayload({
          name,
          company: company || name,
          email: emailVal,
          phone: normalizedPhone,
          source: "Facebook Ads (Webhook)",
          assignedTo: "Sales Executive 1",
          notes: "Imported from Facebook Lead Ads webhook",
          groupId: null,
        });
        console.log(`[FB Webhook] ✅ Imported lead: ${name} | ${emailVal} | ${normalizedPhone}`);
        imported++;
      } catch (e: any) {
        errors.push(e?.message || `Failed to import lead for leadgen_id ${leadgenId}`);
      }
    }

    return res.status(200).json({
      received: leadChanges.length,
      imported,
      errors: errors.slice(0, 10),
      message: `Processed ${leadChanges.length} leadgen change(s); imported ${imported} lead(s).`,
    });
  } catch (error: any) {
    console.error("Facebook webhook error:", error);
    return res.status(500).json({
      error: "Facebook webhook processing failed",
      details: error.message || String(error),
    });
  }
}

// Delivery routes - handles both URL patterns Meta may call
router.post("/webhook/facebook", handleFacebookWebhookDelivery);
router.post("/webhook", handleFacebookWebhookDelivery);

export default router;
