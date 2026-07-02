const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const chatBrain = require("./chat-brain");
const aiChatBrain = require("./ai-chat-brain");
const chatGuardrails = require("./chat-guardrails");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(ROOT_DIR, "assets", "media", "uploads");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const AI_BRAIN_FILE_NAMES = [
  "00_MASTER_PROMPT.md",
  "01_BUSINESS_PROFILE.md",
  "02_SERVICES_AND_PRICES.md",
  "03_POLICIES.md",
  "04_CUSTOMER_QUESTIONS.md",
  "05_SALES_SCRIPTS.md",
  "06_CONTENT_PERSONA_ORTAL.md",
  "07_LEAD_QUALIFICATION.md",
  "08_AGENT_TOOLS.md",
  "09_ESCALATION_RULES.md",
  "10_TEST_SCENARIOS.md",
  "11_CRM_SCHEMA.md",
  "12_BREED_COAT_KNOWLEDGE.md"
];
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const CONTENT_JS_FILE = path.join(ROOT_DIR, "content.js");
const ENV_FILE = path.join(__dirname, ".env.local");
const BAILEYS_AUTH_DIR = path.join(DATA_DIR, "baileys-auth");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const BOOKING_STATUS = {
  PENDING: "pending",
  APPROVED_WAITING_DEPOSIT: "approved_waiting_deposit",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  EXPIRED: "expired"
};

const RESERVATION_STATUSES = new Set([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.APPROVED_WAITING_DEPOSIT,
  BOOKING_STATUS.CONFIRMED
]);

const LOCKED_STATUSES = new Set([
  BOOKING_STATUS.APPROVED_WAITING_DEPOSIT,
  BOOKING_STATUS.CONFIRMED
]);

const CLOSED_BOOKING_WEEKDAYS = new Set([2, 5, 6]); // Tuesday, Friday, Saturday
const HEBREW_WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const OPEN_BOOKING_DAY_TEXT = "ראשון, שני, רביעי או חמישי";
const BUSINESS_HOURS_TEXT = "09:00-16:00";
const BOOKING_HOURS_TEXT = "09:00-14:00";
const WAFFELS_ACADEMY_CONTEXT = `
WAFFELS Academy היא מסלול פרימיום לטיפוח כלבים: מקצוע, ביטחון וחשיבה עסקית מהשטח.
האקדמיה נבנתה למי שרוצה להיכנס לעולם טיפוח הכלבים בצורה חכמה ומסודרת: לא רק להחזיק מכונה ומספריים, אלא להבין תהליך עבודה, סטנדרט שירות, התנהלות מול לקוחות ובניית ביטחון מקצועי אמיתי.

למי זה מתאים:
- מי שרוצה מקצוע אמיתי: מסלול שמחבר בין אהבה לכלבים לבין יכולת עבודה מסודרת, בטוחה ורווחית.
- מתחילים שרוצים סדר: למי שלא רוצה ללמוד במקרה, אלא לקבל שיטה ברורה מהבסיס ועד עבודה עצמאית.
- מי שחושב עסקית: למי שרוצה להבין גם שירות, תמחור, לקוחות וחוויית מספרה ברמה גבוהה.

מה לומדים:
- היכרות עם סוגי פרווה.
- רחצה, ייבוש והברשה מקצועית.
- עבודה נכונה עם ציוד מספרה מתקדם.
- הכנה מקצועית לתספורת.
- עקרונות גזירה, קווים וגימור נקי.
- ניהול כלב רגוע ובטוח בזמן טיפול.
- שירות, תקשורת ותיאום ציפיות מול לקוחות.
- בניית סטנדרט עבודה אישי ומקצועי.
- טיפים אמיתיים מהעבודה במספרה פעילה.

מה מקבלים:
- ליווי אישי.
- תרגול מעשי.
- חשיבה עסקית.
- סטנדרט עבודה גבוה.
- כלי ברור ומעשי להמשך הדרך.

מחיר הקורס: 15,900 ₪.
ענה על האקדמיה בקצרה ובגובה העיניים. אל תזרוק את כל המידע בבת אחת; שאל שאלת המשך אחת כדי להבין אם המתעניין מתחיל, בעל ניסיון, או חושב לפתוח עסק.
`.trim();

const defaults = {
  port: 3000,
  publicBaseUrl: "",
  timeZone: "Asia/Jerusalem",
  googleCalendarId: "",
  slotCapacity: 1,
  depositAmountIls: 200,
  depositWindowMinutes: 15,
  workWeekdays: [0, 1, 3, 4],
  slotLabels: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"],
  bookingRateLimitWindowMs: 15 * 60 * 1000,
  bookingRateLimitMax: 8,
  adminSessionTtlMs: 8 * 60 * 60 * 1000,
  selfPingIntervalMs: 10 * 60 * 1000
};

const bookingRateLimits = new Map();
const adminSessions = new Map();
let baileysModulePromise = null;
let aiBrainCache = null;
const whatsappState = {
  socket: null,
  status: "idle",
  qr: "",
  qrDataUrl: "",
  user: null,
  starting: false,
  reconnectTimer: null,
  lastConnectedAt: "",
  lastError: "",
  aiLastError: "",
  aiLastReplyAt: "",
  aiLastReplyTo: "",
  aiProcessing: new Set(),
  recentMessages: []
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

function parseJsonArray(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function parseCsvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const envFileValues = loadEnvFile(ENV_FILE);
const config = {
  port: Number(process.env.PORT || envFileValues.PORT || defaults.port),
  host: process.env.HOST || envFileValues.HOST || "0.0.0.0",
  publicBaseUrl: String(process.env.PUBLIC_BASE_URL || envFileValues.PUBLIC_BASE_URL || defaults.publicBaseUrl).replace(/\/+$/, ""),
  timeZone: process.env.TIME_ZONE || envFileValues.TIME_ZONE || defaults.timeZone,
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || envFileValues.GOOGLE_CALENDAR_ID || defaults.googleCalendarId,
  googleClientId: process.env.GOOGLE_CLIENT_ID || envFileValues.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || envFileValues.GOOGLE_CLIENT_SECRET || "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || envFileValues.GOOGLE_REFRESH_TOKEN || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || envFileValues.STRIPE_SECRET_KEY || "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || envFileValues.STRIPE_PUBLISHABLE_KEY || "",
  openAiApiKey: process.env.OPENAI_API_KEY || envFileValues.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || envFileValues.OPENAI_MODEL || "gpt-4o",
  aiDemoMode: String(process.env.AI_DEMO_MODE || envFileValues.AI_DEMO_MODE || "false").toLowerCase() === "true",
  aiAutoReplyEnabled: String(process.env.AI_AUTO_REPLY_ENABLED || envFileValues.AI_AUTO_REPLY_ENABLED || "true").toLowerCase() !== "false",
  whatsappToken: process.env.WHATSAPP_TOKEN || envFileValues.WHATSAPP_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || envFileValues.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || envFileValues.WHATSAPP_VERIFY_TOKEN || "",
  mondayApiToken: process.env.MONDAY_API_TOKEN || envFileValues.MONDAY_API_TOKEN || "",
  mondayBoardId: process.env.MONDAY_BOARD_ID || envFileValues.MONDAY_BOARD_ID || "5098925280",
  mondayGroupId: process.env.MONDAY_GROUP_ID || envFileValues.MONDAY_GROUP_ID || "",
  mondayColumnMap: (() => {
    try {
      const raw = process.env.MONDAY_COLUMN_MAP || envFileValues.MONDAY_COLUMN_MAP || "{}";
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
      return {};
    }
  })(),
  adminApprovalCode: process.env.ADMIN_APPROVAL_CODE || envFileValues.ADMIN_APPROVAL_CODE || "",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || envFileValues.ADMIN_PASSWORD_HASH || "",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || envFileValues.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  adminSessionTtlMs: Number(process.env.ADMIN_SESSION_TTL_MS || envFileValues.ADMIN_SESSION_TTL_MS || defaults.adminSessionTtlMs),
  allowedOrigins: parseCsvList(process.env.ALLOWED_ORIGINS || envFileValues.ALLOWED_ORIGINS || ""),
  enableHsts: String(process.env.ENABLE_HSTS || envFileValues.ENABLE_HSTS || "false").toLowerCase() === "true",
  trustProxy: String(process.env.TRUST_PROXY || envFileValues.TRUST_PROXY || "true").toLowerCase() !== "false",
  selfPingUrl: process.env.SELF_PING_URL || envFileValues.SELF_PING_URL || "",
  selfPingIntervalMs: Number(process.env.SELF_PING_INTERVAL_MS || envFileValues.SELF_PING_INTERVAL_MS || defaults.selfPingIntervalMs),
  slotCapacity: Number(process.env.SLOT_CAPACITY || envFileValues.SLOT_CAPACITY || defaults.slotCapacity),
  depositAmountIls: Number(process.env.DEPOSIT_AMOUNT_ILS || envFileValues.DEPOSIT_AMOUNT_ILS || defaults.depositAmountIls),
  depositWindowMinutes: Number(process.env.DEPOSIT_WINDOW_MINUTES || envFileValues.DEPOSIT_WINDOW_MINUTES || defaults.depositWindowMinutes),
  workWeekdays: parseJsonArray(process.env.WORK_WEEKDAYS || envFileValues.WORK_WEEKDAYS, defaults.workWeekdays).map(Number),
  slotLabels: parseJsonArray(process.env.SLOT_LABELS || envFileValues.SLOT_LABELS, defaults.slotLabels).map(String),
  bookingRateLimitWindowMs: Number(process.env.BOOKING_RATE_LIMIT_WINDOW_MS || envFileValues.BOOKING_RATE_LIMIT_WINDOW_MS || defaults.bookingRateLimitWindowMs),
  bookingRateLimitMax: Number(process.env.BOOKING_RATE_LIMIT_MAX || envFileValues.BOOKING_RATE_LIMIT_MAX || defaults.bookingRateLimitMax)
};

config.slotLabels = config.slotLabels.filter((slot) => {
  const match = String(slot).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 9 * 60 && minutes <= 14 * 60;
});
if (!config.slotLabels.length) config.slotLabels = defaults.slotLabels;

if (config.publicBaseUrl && !config.allowedOrigins.includes(config.publicBaseUrl)) {
  config.allowedOrigins.push(config.publicBaseUrl);
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify({ bookings: [] }, null, 2), "utf8");
  }
  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify({ leads: [] }, null, 2), "utf8");
  }
}

function ensureContentFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONTENT_FILE)) {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify({ content: {} }, null, 2), "utf8");
  }
}

function readSiteContent() {
  ensureContentFile();
  try {
    const data = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8"));
    return normalizeSiteContentResponse(data);
  } catch (_error) {
    return normalizeSiteContentResponse({});
  }
}

function writeSiteContent(payload) {
  ensureContentFile();
  const updatedAt = new Date().toISOString();
  fs.writeFileSync(
    CONTENT_FILE,
    JSON.stringify({ content: payload, updatedAt }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    CONTENT_JS_FILE,
    "window.siteContent = " + JSON.stringify(payload, null, 2) + ";\n",
    "utf8"
  );
  return updatedAt;
}

function getDefaultSiteContent() {
  return {
    business: {},
    sections: {},
    galleryItems: [],
    beforeAfterItems: [],
    services: [],
    reviews: [],
    academy: {}
  };
}

function normalizeSiteContentResponse(data = {}) {
  const incoming = data && typeof data === "object" && !Array.isArray(data)
    ? (data.content && typeof data.content === "object" && !Array.isArray(data.content) ? data.content : data)
    : {};
  return {
    content: {
      ...getDefaultSiteContent(),
      ...incoming,
      business: incoming.business && typeof incoming.business === "object" && !Array.isArray(incoming.business) ? incoming.business : {},
      sections: incoming.sections && typeof incoming.sections === "object" && !Array.isArray(incoming.sections) ? incoming.sections : {},
      galleryItems: Array.isArray(incoming.galleryItems) ? incoming.galleryItems : [],
      beforeAfterItems: Array.isArray(incoming.beforeAfterItems) ? incoming.beforeAfterItems : [],
      services: Array.isArray(incoming.services) ? incoming.services : [],
      reviews: Array.isArray(incoming.reviews) ? incoming.reviews : [],
      academy: incoming.academy && typeof incoming.academy === "object" && !Array.isArray(incoming.academy) ? incoming.academy : {}
    },
    updatedAt: data.updatedAt || ""
  };
}

function normalizeContentPayload(input) {
  if (input && typeof input === "object" && !Array.isArray(input) && input.content && typeof input.content === "object" && !Array.isArray(input.content)) {
    return input.content;
  }
  return input;
}

function mergeSiteContent(existingContent = {}, incomingContent = {}) {
  const safeExisting = existingContent && typeof existingContent === "object" && !Array.isArray(existingContent) ? existingContent : {};
  const safeIncoming = incomingContent && typeof incomingContent === "object" && !Array.isArray(incomingContent) ? incomingContent : {};
  return {
    ...safeExisting,
    ...safeIncoming,
    business: {
      ...(safeExisting.business && typeof safeExisting.business === "object" && !Array.isArray(safeExisting.business) ? safeExisting.business : {}),
      ...(safeIncoming.business && typeof safeIncoming.business === "object" && !Array.isArray(safeIncoming.business) ? safeIncoming.business : {})
    },
    sections: {
      ...(safeExisting.sections && typeof safeExisting.sections === "object" && !Array.isArray(safeExisting.sections) ? safeExisting.sections : {}),
      ...(safeIncoming.sections && typeof safeIncoming.sections === "object" && !Array.isArray(safeIncoming.sections) ? safeIncoming.sections : {})
    },
    admin: (
      safeExisting.admin && typeof safeExisting.admin === "object" && !Array.isArray(safeExisting.admin)
        ? safeExisting.admin
        : (safeIncoming.admin && typeof safeIncoming.admin === "object" && !Array.isArray(safeIncoming.admin)
          ? safeIncoming.admin
          : {})
    )
  };
}

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function sanitizeUploadName(value = "") {
  const parsed = path.parse(String(value || "upload"));
  return (parsed.name || "upload")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "upload";
}

function extensionFromUpload(mimeType = "", fileName = "") {
  const byMime = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov"
  };
  const fromMime = byMime[String(mimeType || "").toLowerCase()];
  if (fromMime) return fromMime;
  const fromName = path.extname(String(fileName || "")).toLowerCase();
  return CONTENT_TYPES[fromName] ? fromName : "";
}

function saveUploadedDataUrl(input = {}) {
  const dataUrl = String(input.dataUrl || "");
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    const error = new Error("invalid-data-url");
    error.code = "invalid-data-url";
    throw error;
  }

  const mimeType = String(input.mimeType || match[1] || "").toLowerCase();
  if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime))$/.test(mimeType)) {
    const error = new Error("unsupported-file-type");
    error.code = "unsupported-file-type";
    throw error;
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > 25 * 1024 * 1024) {
    const error = new Error("upload-too-large");
    error.code = "upload-too-large";
    throw error;
  }

  const extension = extensionFromUpload(mimeType, input.fileName);
  if (!extension) {
    const error = new Error("unsupported-file-type");
    error.code = "unsupported-file-type";
    throw error;
  }

  ensureUploadDir();
  const baseName = sanitizeUploadName(input.fileName);
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${baseName}${extension}`;
  const targetPath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(targetPath, buffer);
  return {
    ok: true,
    url: `./assets/media/uploads/${storedName}`,
    fileName: storedName,
    mimeType,
    size: buffer.length
  };
}

function stripControlChars(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeText(value, maxLength = 280) {
  return stripControlChars(value).slice(0, maxLength);
}

function sanitizeMultiline(value, maxLength = 1200) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? "972" + digits.slice(1) : digits;
}

function isValidPhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isValidSlot(value) {
  return config.slotLabels.includes(String(value || ""));
}

function isAllowedWorkDay(value) {
  if (!isValidIsoDate(value)) return false;
  const date = new Date(value + "T00:00:00");
  const weekday = date.getDay();
  return config.workWeekdays.includes(weekday) && !CLOSED_BOOKING_WEEKDAYS.has(weekday);
}

function isFutureOrToday(value) {
  if (!isValidIsoDate(value)) return false;
  const date = new Date(value + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

function normalizeStatus(status, depositStatus) {
  const next = String(status || BOOKING_STATUS.PENDING).trim();
  if (next === "approved") {
    return depositStatus === "paid" ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.APPROVED_WAITING_DEPOSIT;
  }
  if (Object.values(BOOKING_STATUS).includes(next)) return next;
  return BOOKING_STATUS.PENDING;
}

function normalizeDepositStatus(value, status) {
  if (value) return String(value);
  if (status === BOOKING_STATUS.CONFIRMED) return "paid";
  if (status === BOOKING_STATUS.APPROVED_WAITING_DEPOSIT) return "pending";
  if (status === BOOKING_STATUS.EXPIRED) return "expired";
  return "none";
}

function mapLegacyFields(booking) {
  booking.name = booking.fullName;
  booking.dog = booking.dogName;
  booking.date = booking.preferredDate;
  booking.slot = booking.preferredSlot;
  booking.photoDataUrl = booking.dogPhotoDataUrl;
  return booking;
}

function normalizeBooking(rawBooking) {
  const booking = { ...rawBooking };
  booking.id = String(booking.id || crypto.randomUUID());
  booking.approvalToken = String(booking.approvalToken || crypto.randomBytes(24).toString("hex"));
  booking.fullName = sanitizeText(booking.fullName || booking.name || "", 100);
  booking.phone = sanitizeText(booking.phone || "", 40);
  booking.dogName = sanitizeText(booking.dogName || booking.dog || "", 80);
  booking.dogBreed = sanitizeText(booking.dogBreed || "", 80);
  booking.dogAge = sanitizeText(booking.dogAge || "", 40);
  booking.serviceType = sanitizeText(booking.serviceType || "", 80);
  booking.preferredDate = sanitizeText(booking.preferredDate || booking.date || "", 20);
  booking.preferredSlot = sanitizeText(booking.preferredSlot || booking.slot || "", 20);
  booking.notes = sanitizeMultiline(booking.notes || "", 1200);
  booking.dogPhotoDataUrl = typeof booking.dogPhotoDataUrl === "string"
    ? booking.dogPhotoDataUrl
    : (typeof booking.photoDataUrl === "string" ? booking.photoDataUrl : "");
  booking.status = normalizeStatus(booking.status, booking.depositStatus);
  booking.depositStatus = normalizeDepositStatus(booking.depositStatus, booking.status);
  booking.depositAmountIls = Number(booking.depositAmountIls || config.depositAmountIls);
  booking.paymentUrl = typeof booking.paymentUrl === "string" ? booking.paymentUrl : "";
  booking.paymentSessionId = typeof booking.paymentSessionId === "string" ? booking.paymentSessionId : "";
  booking.paymentIntentId = typeof booking.paymentIntentId === "string" ? booking.paymentIntentId : "";
  booking.calendarEventId = typeof booking.calendarEventId === "string" ? booking.calendarEventId : "";
  booking.calendarHtmlLink = typeof booking.calendarHtmlLink === "string" ? booking.calendarHtmlLink : "";
  booking.calendarError = typeof booking.calendarError === "string" ? booking.calendarError : "";
  booking.createdAt = booking.createdAt || new Date().toISOString();
  booking.updatedAt = booking.updatedAt || booking.createdAt;
  booking.approvedAt = booking.approvedAt || "";
  booking.cancelledAt = booking.cancelledAt || "";
  booking.cancelReason = sanitizeText(booking.cancelReason || "", 200);
  booking.expiredAt = booking.expiredAt || "";
  booking.depositExpiresAt = booking.depositExpiresAt || "";
  booking.depositPaidAt = booking.depositPaidAt || "";
  booking.paymentStatus = booking.paymentStatus || "";
  return mapLegacyFields(booking);
}

function expireStaleBookings(bookings) {
  let changed = false;
  const now = Date.now();
  bookings.forEach((booking) => {
    if (
      booking.status === BOOKING_STATUS.APPROVED_WAITING_DEPOSIT
      && booking.depositStatus === "pending"
      && booking.depositExpiresAt
      && Date.parse(booking.depositExpiresAt) < now
    ) {
      booking.status = BOOKING_STATUS.EXPIRED;
      booking.depositStatus = "expired";
      booking.expiredAt = new Date().toISOString();
      booking.updatedAt = booking.expiredAt;
      booking.paymentUrl = "";
      changed = true;
    }
  });
  return changed;
}

function readDatabase() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf8"));
    const bookings = Array.isArray(parsed.bookings) ? parsed.bookings.map(normalizeBooking) : [];
    const changed = expireStaleBookings(bookings);
    if (changed) {
      writeDatabase({ bookings });
    }
    return { bookings };
  } catch (_error) {
    return { bookings: [] };
  }
}

function writeDatabase(database) {
  ensureDataFile();
  fs.writeFileSync(
    BOOKINGS_FILE,
    JSON.stringify({ bookings: (database.bookings || []).map(normalizeBooking) }, null, 2),
    "utf8"
  );
}

function normalizeLead(rawLead = {}) {
  const allowedStatuses = new Set(["new", "waiting_for_photo", "waiting_for_ortal", "price_sent", "booked", "completed", "archived"]);
  const allowedTemperatures = new Set(["hot", "warm", "cold"]);
  const status = allowedStatuses.has(String(rawLead.status || "")) ? String(rawLead.status) : "new";
  const temperature = allowedTemperatures.has(String(rawLead.temperature || "")) ? String(rawLead.temperature) : "warm";
  return {
    id: sanitizeText(rawLead.id || crypto.randomUUID(), 80),
    customer_name: sanitizeText(rawLead.customer_name || "", 100),
    phone: sanitizeText(rawLead.phone || "", 40),
    dog_name: sanitizeText(rawLead.dog_name || "", 80),
    breed: sanitizeText(rawLead.breed || "", 80),
    service_requested: sanitizeText(rawLead.service_requested || "", 120),
    notes: sanitizeMultiline(rawLead.notes || "", 1200),
    source: sanitizeText(rawLead.source || "website", 80),
    status,
    temperature,
    next_action: sanitizeText(rawLead.next_action || "", 120),
    monday_item_id: sanitizeText(rawLead.monday_item_id || "", 80),
    monday_sync_status: sanitizeText(rawLead.monday_sync_status || "", 40),
    monday_sync_error: sanitizeText(rawLead.monday_sync_error || "", 240),
    updatedAt: sanitizeText(rawLead.updatedAt || rawLead.createdAt || new Date().toISOString(), 40),
    createdAt: sanitizeText(rawLead.createdAt || new Date().toISOString(), 40)
  };
}

function readLeadsDatabase() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
    const leads = Array.isArray(parsed.leads) ? parsed.leads.map(normalizeLead) : [];
    return { leads };
  } catch (_error) {
    return { leads: [] };
  }
}

function writeLeadsDatabase(database) {
  ensureDataFile();
  fs.writeFileSync(
    LEADS_FILE,
    JSON.stringify({ leads: (database.leads || []).map(normalizeLead) }, null, 2),
    "utf8"
  );
}

function sanitizeLeadInput(input = {}) {
  return {
    customer_name: sanitizeText(input.customer_name || "", 100),
    phone: sanitizeText(input.phone || "", 40),
    dog_name: sanitizeText(input.dog_name || "", 80),
    breed: sanitizeText(input.breed || "", 80),
    service_requested: sanitizeText(input.service_requested || "", 120),
    notes: sanitizeMultiline(input.notes || "", 1200),
    source: sanitizeText(input.source || "website", 80),
    status: sanitizeText(input.status || "new", 40),
    temperature: sanitizeText(input.temperature || "warm", 40),
    next_action: sanitizeText(input.next_action || "", 120)
  };
}

function validateLead(input) {
  const errors = {};
  if (!input.phone) errors.phone = "required";
  if (!input.dog_name) errors.dog_name = "required";
  if (!input.service_requested) errors.service_requested = "required";
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

function mondayEnabled() {
  return Boolean(config.mondayApiToken && config.mondayBoardId);
}

function mondayGraphqlRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const request = https.request(
      {
        hostname: "api.monday.com",
        path: "/v2",
        method: "POST",
        headers: {
          "Authorization": config.mondayApiToken,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let payload = {};
          try {
            payload = text ? JSON.parse(text) : {};
          } catch (_error) {
            return reject(new Error(`monday-invalid-json:${response.statusCode}:${text.slice(0, 300)}`));
          }
          if (response.statusCode < 200 || response.statusCode >= 300 || payload.errors) {
            return reject(new Error(`monday-api-error:${response.statusCode}:${JSON.stringify(payload.errors || payload).slice(0, 500)}`));
          }
          resolve(payload.data || {});
        });
      }
    );
    request.on("error", reject);
    request.setTimeout(12000, () => request.destroy(new Error("monday-timeout")));
    request.write(body);
    request.end();
  });
}

function formatMondayDateValue(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatMondayStatusLabel(value) {
  const labels = {
    new: "חדש",
    waiting_for_photo: "ממתין לתמונה",
    waiting_for_ortal: "ממתין לאורטל",
    price_sent: "נשלח מחיר",
    booked: "נקבע תור",
    completed: "בוצע",
    archived: "ארכיון"
  };
  return labels[value] || value;
}

function formatMondayTemperatureLabel(value) {
  const labels = {
    hot: "🔥 ליד חם",
    warm: "🟡 ליד בינוני",
    cold: "❄️ ליד קר"
  };
  return labels[value] || value;
}

function formatMondayColumnValue(field, value) {
  if (field === "phone") return { phone: value, countryShortName: "IL" };
  if (field === "created_at") return { date: formatMondayDateValue(value) };
  if (field === "status") return { label: formatMondayStatusLabel(value) };
  if (field === "temperature") return { label: formatMondayTemperatureLabel(value) };
  if (field === "notes") return { text: String(value) };
  return String(value);
}

function buildMondayColumnValues(lead) {
  const map = config.mondayColumnMap || {};
  const values = {};
  const assignments = {
    customer_name: lead.customer_name || "לא נמסר",
    phone: lead.phone,
    dog_name: lead.dog_name,
    breed: lead.breed,
    service_requested: lead.service_requested,
    notes: lead.notes,
    source: lead.source,
    status: lead.status,
    temperature: lead.temperature,
    next_action: lead.next_action,
    created_at: lead.createdAt
  };
  for (const [field, columnId] of Object.entries(map)) {
    if (!columnId || !Object.prototype.hasOwnProperty.call(assignments, field)) continue;
    const value = assignments[field];
    if (!value) continue;
    values[columnId] = formatMondayColumnValue(field, value);
  }
  return values;
}

function buildMondayUpdateBody(lead) {
  const lines = [
    `שם לקוח: ${lead.customer_name || "לא נמסר"}`,
    `טלפון: ${lead.phone || "לא נמסר"}`,
    `שם הכלב: ${lead.dog_name || "לא נמסר"}`,
    `גזע: ${lead.breed || "לא נמסר"}`,
    `סוג טיפול: ${lead.service_requested || "לא נמסר"}`,
    lead.notes ? `הערות:\n${lead.notes}` : "",
    `מקור: ${lead.source || "website_chat_widget"}`,
    `נוצר: ${lead.createdAt || new Date().toISOString()}`
  ].filter(Boolean);
  return lines.join("\n");
}

async function syncLeadToMonday(lead) {
  if (!mondayEnabled()) {
    return { skipped: true, reason: "missing-monday-token-or-board" };
  }
  const itemName = `${lead.dog_name || "כלב"} - ${lead.service_requested || "ליד חדש"}${lead.phone ? ` - ${lead.phone}` : ""}`;
  const columnValues = buildMondayColumnValues(lead);
  const createItemMutation = config.mondayGroupId
    ? `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON) {
        create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id }
      }`
    : `mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON) {
        create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) { id }
      }`;
  const itemVariables = {
    boardId: String(config.mondayBoardId),
    itemName,
    columnValues: Object.keys(columnValues).length ? JSON.stringify(columnValues) : "{}",
    ...(config.mondayGroupId ? { groupId: config.mondayGroupId } : {})
  };
  const created = await mondayGraphqlRequest(createItemMutation, itemVariables);
  const itemId = created && created.create_item && created.create_item.id;
  if (!itemId) throw new Error("monday-create-item-missing-id");

  if (Object.keys(columnValues).length) {
    await mondayGraphqlRequest(
      `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          board_id: $boardId,
          item_id: $itemId,
          column_values: $columnValues,
          create_labels_if_missing: true
        ) { id }
      }`,
      {
        boardId: String(config.mondayBoardId),
        itemId: String(itemId),
        columnValues: JSON.stringify(columnValues)
      }
    );
  }

  await mondayGraphqlRequest(
    `mutation ($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) { id }
    }`,
    { itemId: String(itemId), body: buildMondayUpdateBody(lead) }
  );
  return { skipped: false, itemId: String(itemId) };
}

function sanitizeLeadPatch(input = {}) {
  const allowedStatuses = new Set(["new", "waiting_for_photo", "waiting_for_ortal", "price_sent", "booked", "completed", "archived"]);
  const allowedTemperatures = new Set(["hot", "warm", "cold"]);
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(input, "status")) {
    const status = sanitizeText(input.status || "", 40);
    if (allowedStatuses.has(status)) patch.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(input, "temperature")) {
    const temperature = sanitizeText(input.temperature || "", 40);
    if (allowedTemperatures.has(temperature)) patch.temperature = temperature;
  }
  if (Object.prototype.hasOwnProperty.call(input, "next_action")) {
    patch.next_action = sanitizeText(input.next_action || "", 120);
  }
  return patch;
}

function updateLeadById(leadId, patch) {
  const leadsDatabase = readLeadsDatabase();
  const index = leadsDatabase.leads.findIndex((lead) => lead.id === leadId);
  if (index < 0) return null;
  const updated = normalizeLead({
    ...leadsDatabase.leads[index],
    ...patch,
    updatedAt: new Date().toISOString()
  });
  leadsDatabase.leads[index] = updated;
  writeLeadsDatabase(leadsDatabase);
  return updated;
}

function getAiBrainDir() {
  const candidates = [
    path.join(ROOT_DIR, "ai-brain"),
    path.join(ROOT_DIR, "..", "ai-brain")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || "";
}

function loadAiBrain() {
  const brainDir = getAiBrainDir();
  if (!brainDir) {
    return {
      dir: "",
      content: "ai-brain לא נמצא. יש לענות בזהירות, לא להמציא מחירים, לא לתת ייעוץ רפואי, ולאסוף פרטי ליד בהדרגה."
    };
  }

  const signature = AI_BRAIN_FILE_NAMES.map((fileName) => {
    const filePath = path.join(brainDir, fileName);
    if (!fs.existsSync(filePath)) return `${fileName}:missing`;
    const stat = fs.statSync(filePath);
    return `${fileName}:${stat.mtimeMs}:${stat.size}`;
  }).join("|");

  if (aiBrainCache && aiBrainCache.signature === signature) return aiBrainCache;

  const content = AI_BRAIN_FILE_NAMES.map((fileName) => {
    const filePath = path.join(brainDir, fileName);
    if (!fs.existsSync(filePath)) return `# ${fileName}\n\n[קובץ חסר]`;
    return `# ${fileName}\n\n${fs.readFileSync(filePath, "utf8")}`;
  }).join("\n\n---\n\n");

  aiBrainCache = {
    dir: brainDir,
    signature,
    content
  };
  return aiBrainCache;
}

function getSecurityHeaders() {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self' http://127.0.0.1:3001 http://localhost:3001 https://api.stripe.com https://www.googleapis.com https://oauth2.googleapis.com",
    "frame-src https://www.google.com https://maps.google.com https://www.google.com/maps/ https://checkout.stripe.com",
    "font-src 'self' data:",
    "manifest-src 'self'",
    "worker-src 'self' blob:"
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=(self)",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    ...(config.enableHsts ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload" } : {})
  };
}

function normalizeOrigin(value = "") {
  try {
    return new URL(value).origin;
  } catch (_error) {
    return "";
  }
}

function isLocalOrigin(origin = "") {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

function isAllowedOrigin(origin = "") {
  if (!origin) return true;
  if (origin === "null" && (!config.publicBaseUrl || isLocalOrigin(config.publicBaseUrl))) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (isLocalOrigin(normalized) && (!config.publicBaseUrl || isLocalOrigin(config.publicBaseUrl))) return true;
  return config.allowedOrigins.map(normalizeOrigin).filter(Boolean).includes(normalized);
}

function getCorsHeaders(request) {
  const origin = String(request.headers.origin || "");
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin === "null" ? "null" : normalizeOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Session",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}

function sendJson(request, response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    ...getSecurityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...getCorsHeaders(request),
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendText(request, response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    ...getSecurityHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...getCorsHeaders(request),
    ...headers
  });
  response.end(payload);
}

function sendDownload(request, response, statusCode, payload, contentType, filename) {
  response.writeHead(statusCode, {
    ...getSecurityHeaders(),
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${filename}"`,
    ...getCorsHeaders(request)
  });
  response.end(payload);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function getClientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "unknown";
}

function isRateLimited(request) {
  const key = getClientIp(request);
  const now = Date.now();
  const entry = bookingRateLimits.get(key) || { count: 0, resetAt: now + config.bookingRateLimitWindowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + config.bookingRateLimitWindowMs;
  }
  entry.count += 1;
  bookingRateLimits.set(key, entry);
  return entry.count > config.bookingRateLimitMax;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex"), iterations = 210000) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2:${iterations}:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const value = String(storedHash || "");
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password || ""), salt, iterations, Buffer.from(expected, "hex").length, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function createAdminSession() {
  const token = crypto.randomBytes(32).toString("base64url");
  const signature = crypto
    .createHmac("sha256", config.adminSessionSecret)
    .update(token)
    .digest("base64url");
  const sessionToken = `${token}.${signature}`;
  adminSessions.set(sessionToken, Date.now() + config.adminSessionTtlMs);
  return sessionToken;
}

function isValidAdminSession(request) {
  const sessionToken = String(request.headers["x-admin-session"] || "").trim();
  if (!sessionToken) return false;
  const expiresAt = adminSessions.get(sessionToken);
  if (!expiresAt || expiresAt < Date.now()) {
    adminSessions.delete(sessionToken);
    return false;
  }
  const [token, signature] = sessionToken.split(".");
  if (!token || !signature) return false;
  const expected = crypto
    .createHmac("sha256", config.adminSessionSecret)
    .update(token)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  adminSessions.set(sessionToken, Date.now() + config.adminSessionTtlMs);
  return true;
}

function isLocalRequest(request) {
  const remote = String(request.socket?.remoteAddress || "");
  const host = String(request.headers.host || "");
  return (
    remote === "127.0.0.1" ||
    remote === "::1" ||
    remote === "::ffff:127.0.0.1" ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:")
  );
}

function allowLocalDevAdmin(request) {
  return !config.adminPasswordHash && isLocalRequest(request);
}

function requireAdmin(request, response) {
  if (isValidAdminSession(request)) return true;
  sendJson(request, response, 401, { ok: false, error: "admin-auth-required" });
  return false;
}

async function loadBaileysModule() {
  if (!baileysModulePromise) {
    baileysModulePromise = import("@whiskeysockets/baileys");
  }
  const module = await baileysModulePromise;
  return {
    makeWASocket: module.default || module.makeWASocket,
    useMultiFileAuthState: module.useMultiFileAuthState,
    fetchLatestBaileysVersion: module.fetchLatestBaileysVersion,
    DisconnectReason: module.DisconnectReason || {}
  };
}

function getWhatsappStatus() {
  return {
    ok: true,
    status: whatsappState.status,
    connected: whatsappState.status === "connected",
    hasQr: Boolean(whatsappState.qrDataUrl || whatsappState.qr),
    qrDataUrl: whatsappState.qrDataUrl,
    user: whatsappState.user,
    lastConnectedAt: whatsappState.lastConnectedAt,
    lastError: whatsappState.lastError,
    ai: {
      enabled: config.aiAutoReplyEnabled,
      configured: Boolean(config.openAiApiKey),
      model: config.openAiModel,
      demoMode: config.aiDemoMode,
      quotaOk: Boolean(config.openAiApiKey && !config.aiDemoMode),
      lastReplyAt: whatsappState.aiLastReplyAt,
      lastReplyTo: whatsappState.aiLastReplyTo,
      lastError: whatsappState.aiLastError
    },
    autoReply: {
      ready: Boolean(config.aiDemoMode || config.openAiApiKey),
      route: "conversation-engine"
    },
    cloudApi: {
      configured: Boolean(config.whatsappToken && config.whatsappPhoneNumberId && config.whatsappVerifyToken),
      phoneNumberIdConfigured: Boolean(config.whatsappPhoneNumberId),
      verifyTokenConfigured: Boolean(config.whatsappVerifyToken)
    }
  };
}

function getPublicWhatsappStatus() {
  return {
    ok: true,
    whatsapp: {
      status: whatsappState.status,
      connected: whatsappState.status === "connected",
      lastConnectedAt: whatsappState.lastConnectedAt,
      lastError: whatsappState.lastError
    },
    ai: {
      enabled: config.aiAutoReplyEnabled,
      configured: Boolean(config.openAiApiKey),
      model: config.openAiModel,
      demoMode: config.aiDemoMode,
      quotaOk: Boolean(config.openAiApiKey && !config.aiDemoMode),
      lastReplyAt: whatsappState.aiLastReplyAt,
      lastReplyTo: whatsappState.aiLastReplyTo,
      lastError: whatsappState.aiLastError
    },
    autoReply: {
      ready: Boolean(config.aiDemoMode || config.openAiApiKey),
      route: "conversation-engine"
    },
    cloudApi: {
      configured: Boolean(config.whatsappToken && config.whatsappPhoneNumberId && config.whatsappVerifyToken),
      phoneNumberIdConfigured: Boolean(config.whatsappPhoneNumberId),
      verifyTokenConfigured: Boolean(config.whatsappVerifyToken)
    }
  };
}

function rememberWhatsappMessage(message) {
  if (!message || !message.key) return;
  const remoteJid = String(message.key.remoteJid || "");
  if (!remoteJid || remoteJid === "status@broadcast") return;
  const text =
    (message.message && message.message.conversation)
    || (message.message && message.message.extendedTextMessage && message.message.extendedTextMessage.text)
    || (message.message && message.message.imageMessage && message.message.imageMessage.caption)
    || (message.message && message.message.videoMessage && message.message.videoMessage.caption)
    || "";
  const item = {
    id: String(message.key.id || crypto.randomUUID()),
    fromMe: Boolean(message.key.fromMe),
    remoteJid,
    phone: remoteJid.replace(/@.+$/, ""),
    name: message.pushName || "",
    text: sanitizeMultiline(text || "[media]", 2000),
    timestamp: Number(message.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000
  };
  whatsappState.recentMessages = [
    item,
    ...whatsappState.recentMessages.filter((existing) => existing.id !== item.id)
  ].slice(0, 100);
}

function scheduleWhatsappReconnect() {
  if (whatsappState.reconnectTimer) return;
  whatsappState.reconnectTimer = setTimeout(() => {
    whatsappState.reconnectTimer = null;
    startWhatsappConnection().catch((error) => {
      whatsappState.status = "error";
      whatsappState.lastError = String(error.message || error);
      console.warn("WhatsApp reconnect failed:", whatsappState.lastError);
    });
  }, 5000);
  whatsappState.reconnectTimer.unref();
}

async function startWhatsappConnection() {
  if (whatsappState.starting) return getWhatsappStatus();
  if (whatsappState.status === "connected" && whatsappState.socket) return getWhatsappStatus();

  whatsappState.starting = true;
  whatsappState.status = "connecting";
  whatsappState.lastError = "";
  whatsappState.qr = "";
  whatsappState.qrDataUrl = "";
  ensureDataFile();

  try {
    const {
      makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      DisconnectReason
    } = await loadBaileysModule();
    const { state, saveCreds } = await useMultiFileAuthState(BAILEYS_AUTH_DIR);
    let version;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest && latest.version;
    } catch (error) {
      console.warn("Could not fetch latest WhatsApp version:", String(error.message || error));
    }

    const socket = makeWASocket({
      auth: state,
      browser: ["WAFFELS", "Chrome", "1.0.0"],
      printQRInTerminal: true,
      ...(version ? { version } : {})
    });

    whatsappState.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("messages.upsert", (event) => {
      (event.messages || []).forEach((message) => {
        rememberWhatsappMessage(message);
      });
    });
    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        whatsappState.status = "qr";
        whatsappState.qr = qr;
        whatsappState.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        qrcodeTerminal.generate(qr, { small: true });
      }
      if (connection === "open") {
        whatsappState.status = "connected";
        whatsappState.qr = "";
        whatsappState.qrDataUrl = "";
        whatsappState.user = socket.user || null;
        whatsappState.lastConnectedAt = new Date().toISOString();
        whatsappState.lastError = "";
      }
      if (connection === "close") {
        const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
          ? lastDisconnect.error.output.statusCode
          : 0;
        whatsappState.socket = null;
        whatsappState.status = statusCode === DisconnectReason.loggedOut ? "logged_out" : "disconnected";
        whatsappState.lastError = lastDisconnect && lastDisconnect.error
          ? String(lastDisconnect.error.message || lastDisconnect.error)
          : "";
        if (statusCode !== DisconnectReason.loggedOut) scheduleWhatsappReconnect();
      }
    });

    return getWhatsappStatus();
  } catch (error) {
    whatsappState.status = "error";
    whatsappState.lastError = String(error.message || error);
    throw error;
  } finally {
    whatsappState.starting = false;
  }
}

async function stopWhatsappConnection(removeAuth = false) {
  if (whatsappState.reconnectTimer) {
    clearTimeout(whatsappState.reconnectTimer);
    whatsappState.reconnectTimer = null;
  }
  const socket = whatsappState.socket;
  whatsappState.socket = null;
  whatsappState.qr = "";
  whatsappState.qrDataUrl = "";
  whatsappState.status = removeAuth ? "logged_out" : "disconnected";
  if (socket) {
    try {
      if (removeAuth && typeof socket.logout === "function") {
        await socket.logout();
      } else if (typeof socket.end === "function") {
        socket.end(new Error("admin-disconnect"));
      }
    } catch (error) {
      whatsappState.lastError = String(error.message || error);
    }
  }
  if (removeAuth && fs.existsSync(BAILEYS_AUTH_DIR)) {
    fs.rmSync(BAILEYS_AUTH_DIR, { recursive: true, force: true });
    whatsappState.user = null;
  }
  return getWhatsappStatus();
}

async function sendWhatsappMessage(phone, message) {
  if (!whatsappState.socket || whatsappState.status !== "connected") {
    const error = new Error("whatsapp-not-connected");
    error.code = "whatsapp-not-connected";
    throw error;
  }
  const intlPhone = normalizePhone(phone);
  const text = sanitizeMultiline(message || "", 2000);
  if (!intlPhone || !text) {
    const error = new Error("invalid-whatsapp-message");
    error.code = "invalid-whatsapp-message";
    throw error;
  }
  const jid = intlPhone + "@s.whatsapp.net";
  await whatsappState.socket.sendMessage(jid, { text });
  return { ok: true, to: intlPhone };
}

function buildBaseUrl(request) {
  const host = request.headers.host || "localhost:" + config.port;
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (request.socket && request.socket.encrypted ? "https" : "http");
  if (config.publicBaseUrl) {
    const configured = String(config.publicBaseUrl).replace(/\/+$/, "");
    const configuredIsLocal = /localhost|127\.0\.0\.1/i.test(configured);
    const requestIsLocal = /localhost|127\.0\.0\.1/i.test(host);
    if (!configuredIsLocal || requestIsLocal) {
      return configured;
    }
  }
  return protocol + "://" + host;
}

function isReservationStatus(status) {
  return RESERVATION_STATUSES.has(status);
}

function isLockedBookingStatus(status) {
  return LOCKED_STATUSES.has(status);
}

function countReservations(bookings, date, slot, exceptId = "") {
  return bookings.filter((item) =>
    item.preferredDate === date
    && item.preferredSlot === slot
    && item.id !== exceptId
    && isReservationStatus(item.status)
  ).length;
}

function hasLockedReservation(bookings, date, slot, exceptId = "") {
  return bookings.some((item) =>
    item.preferredDate === date
    && item.preferredSlot === slot
    && item.id !== exceptId
    && isLockedBookingStatus(item.status)
  );
}

function getSlotAvailability(bookings, date) {
  return config.slotLabels.map((slot) => {
    const reservedCount = countReservations(bookings, date, slot);
    const locked = hasLockedReservation(bookings, date, slot);
    const available = !locked && reservedCount < config.slotCapacity;
    return {
      slot,
      capacity: config.slotCapacity,
      reservedCount,
      locked,
      available,
      state: available ? "available" : "fully_booked"
    };
  });
}

function sanitizeBookingInput(input) {
  return {
    fullName: sanitizeText(input.fullName || input.name || "", 100),
    phone: sanitizeText(input.phone || "", 40),
    dogName: sanitizeText(input.dogName || input.dog || "", 80),
    dogBreed: sanitizeText(input.dogBreed || "", 80),
    dogAge: sanitizeText(input.dogAge || "", 40),
    serviceType: sanitizeText(input.serviceType || "", 80),
    preferredDate: sanitizeText(input.preferredDate || input.date || "", 20),
    preferredSlot: sanitizeText(input.preferredSlot || input.slot || "", 20),
    notes: sanitizeMultiline(input.notes || "", 1200),
    dogPhotoDataUrl: typeof input.dogPhotoDataUrl === "string"
      ? input.dogPhotoDataUrl
      : (typeof input.photoDataUrl === "string" ? input.photoDataUrl : "")
  };
}

function validateBooking(input) {
  const errors = {};
  if (!input.fullName) errors.fullName = "missing";
  if (!isValidPhone(input.phone)) errors.phone = "invalid";
  if (!input.dogName) errors.dogName = "missing";
  if (!input.serviceType) errors.serviceType = "missing";
  if (!isValidIsoDate(input.preferredDate)) errors.preferredDate = "invalid";
  if (!isFutureOrToday(input.preferredDate)) errors.preferredDate = "past";
  if (!isAllowedWorkDay(input.preferredDate)) errors.preferredDate = "closed_day";
  if (!isValidSlot(input.preferredSlot)) errors.preferredSlot = "invalid";
  if (input.dogPhotoDataUrl && input.dogPhotoDataUrl.length > 4_500_000) errors.dogPhotoDataUrl = "too_large";
  return { valid: Object.keys(errors).length === 0, errors };
}

function sortBookingsByDate(bookings) {
  return [...bookings].sort((a, b) => {
    const left = `${a.preferredDate || ""}T${a.preferredSlot || "00:00"}`;
    const right = `${b.preferredDate || ""}T${b.preferredSlot || "00:00"}`;
    return left.localeCompare(right);
  });
}

function filterBookingsByStatus(bookings, rawStatus) {
  const status = String(rawStatus || "").trim();
  if (!status) return sortBookingsByDate(bookings);
  const wanted = new Set(status.split(",").map((item) => item.trim()).filter(Boolean));
  return sortBookingsByDate(bookings.filter((item) => wanted.has(item.status)));
}

function csvCell(value) {
  const text = String(value || "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function bookingPaymentLabel(booking) {
  if (booking.depositStatus === "paid" || booking.status === BOOKING_STATUS.CONFIRMED) return "׳©׳•׳׳";
  if (booking.status === BOOKING_STATUS.APPROVED_WAITING_DEPOSIT || booking.depositStatus === "pending") return "׳׳׳×׳™׳ ׳׳×׳©׳׳•׳";
  if (booking.status === BOOKING_STATUS.CANCELLED) return "׳‘׳•׳˜׳";
  if (booking.status === BOOKING_STATUS.EXPIRED) return "׳₪׳’ ׳×׳•׳§׳£";
  return "׳׳ ׳©׳•׳׳";
}

function buildBookingsCsv(bookings) {
  const headers = [
    "׳¡׳˜׳˜׳•׳¡",
    "׳×׳©׳׳•׳",
    "׳©׳ ׳׳§׳•׳—",
    "׳˜׳׳₪׳•׳",
    "׳©׳ ׳”׳›׳׳‘",
    "׳’׳–׳¢",
    "׳’׳™׳",
    "׳©׳™׳¨׳•׳×",
    "׳×׳׳¨׳™׳",
    "׳©׳¢׳”",
    "׳׳§׳“׳׳”",
    "׳ ׳•׳¦׳¨ ׳‘׳×׳׳¨׳™׳",
    "׳¢׳•׳“׳›׳ ׳‘׳×׳׳¨׳™׳",
    "׳”׳¢׳¨׳•׳×"
  ];
  const rows = sortBookingsByDate(bookings).map((booking) => [
    booking.status,
    bookingPaymentLabel(booking),
    booking.fullName,
    booking.phone,
    booking.dogName,
    booking.dogBreed,
    booking.dogAge,
    booking.serviceType,
    booking.preferredDate,
    booking.preferredSlot,
    booking.depositAmountIls ? `${booking.depositAmountIls} ג‚×` : "",
    booking.createdAt,
    booking.updatedAt,
    booking.notes
  ]);
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function padIcs(value) {
  return String(value).padStart(2, "0");
}

function formatIcsDate(date) {
  return date.getUTCFullYear()
    + padIcs(date.getUTCMonth() + 1)
    + padIcs(date.getUTCDate())
    + "T"
    + padIcs(date.getUTCHours())
    + padIcs(date.getUTCMinutes())
    + padIcs(date.getUTCSeconds())
    + "Z";
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildBookingsIcs(bookings) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WAFFELS//Bookings//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];
  sortBookingsByDate(bookings)
    .filter((booking) => booking.preferredDate && booking.preferredSlot && booking.status !== BOOKING_STATUS.CANCELLED && booking.status !== BOOKING_STATUS.EXPIRED)
    .forEach((booking) => {
      const [year, month, day] = String(booking.preferredDate || "").split("-").map(Number);
      const [hour, minute] = String(booking.preferredSlot || "09:00").split(":").map(Number);
      const start = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const description = [
        `׳׳§׳•׳—: ${booking.fullName || ""}`,
        `׳˜׳׳₪׳•׳: ${booking.phone || ""}`,
        `׳›׳׳‘: ${booking.dogName || ""}`,
        `׳©׳™׳¨׳•׳×: ${booking.serviceType || ""}`,
        `׳×׳©׳׳•׳: ${bookingPaymentLabel(booking)}`,
        `׳”׳¢׳¨׳•׳×: ${booking.notes || ""}`
      ].join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${escapeIcs(booking.id || crypto.randomUUID())}@waffels`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(start)}`,
        `DTEND:${formatIcsDate(end)}`,
        `SUMMARY:${escapeIcs("WAFFELS - " + (booking.dogName || booking.fullName || "׳×׳•׳¨"))}`,
        `LOCATION:${escapeIcs("WAFFELS - ׳”׳•׳“ ׳”׳©׳¨׳•׳")}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        "END:VEVENT"
      );
    });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function buildApprovalLink(request, booking) {
  return buildBaseUrl(request) + "/approve-booking.html?token=" + encodeURIComponent(booking.approvalToken);
}

function buildPaymentSuccessUrl(request, booking) {
  return buildBaseUrl(request)
    + "/payment-success.html?booking_id=" + encodeURIComponent(booking.id)
    + "&session_id={CHECKOUT_SESSION_ID}";
}

function buildPaymentCancelUrl(request, booking) {
  return buildBaseUrl(request)
    + "/payment-cancelled.html?booking_id=" + encodeURIComponent(booking.id);
}

function buildCustomerPaymentWhatsappLink(booking, paymentUrl) {
  const intlPhone = normalizePhone(booking.phone);
  if (!intlPhone || !paymentUrl) return "";
  const lines = [
    `׳”׳™׳™ ${booking.fullName || ""}`,
    "׳”׳×׳•׳¨ ׳©׳׳ ׳‘-WAFFELS ׳׳•׳©׳¨ ׳•׳׳׳×׳™׳ ׳׳×׳©׳׳•׳ ׳׳§׳“׳׳”.",
    `׳©׳ ׳”׳›׳׳‘: ${booking.dogName || ""}`,
    `׳©׳™׳¨׳•׳×: ${booking.serviceType || ""}`,
    `׳×׳׳¨׳™׳: ${booking.preferredDate || ""}`,
    `׳©׳¢׳”: ${booking.preferredSlot || ""}`,
    `׳›׳“׳™ ׳׳©׳¨׳™׳™׳ ׳¡׳•׳₪׳™׳× ׳׳× ׳”׳©׳¢׳”, ׳׳©׳׳׳™׳ ׳¢׳›׳©׳™׳• ׳׳§׳“׳׳” ׳©׳ ${booking.depositAmountIls} ׳©\"׳—:`,
    paymentUrl
  ];
  return "https://wa.me/" + intlPhone + "?text=" + encodeURIComponent(lines.join("\n"));
}

function buildOrtalWhatsappLink(request, booking) {
  const ortalPhone = "972528978102";
  const lines = [
    "׳”׳™׳™ ׳׳•׳¨׳˜׳,",
    "׳‘׳§׳©׳× ׳×׳•׳¨ ׳—׳“׳©׳” ׳׳”׳׳×׳¨.",
    `׳©׳: ${booking.fullName}`,
    `׳˜׳׳₪׳•׳: ${booking.phone}`,
    `׳©׳ ׳”׳›׳׳‘: ${booking.dogName}`,
    `׳’׳–׳¢: ${booking.dogBreed || "-"}`,
    `׳’׳™׳: ${booking.dogAge || "-"}`,
    `׳©׳™׳¨׳•׳×: ${booking.serviceType || "-"}`,
    `׳×׳׳¨׳™׳: ${booking.preferredDate}`,
    `׳©׳¢׳”: ${booking.preferredSlot}`,
    `׳”׳¢׳¨׳•׳×: ${booking.notes || "-"}`,
    booking.dogPhotoDataUrl ? "׳¦׳•׳¨׳₪׳” ׳×׳׳•׳ ׳× ׳›׳׳‘ ׳׳׳¢׳¨׳›׳×." : "׳׳ ׳¦׳•׳¨׳₪׳” ׳×׳׳•׳ ׳”.",
    "",
    "׳§׳™׳©׳•׳¨ ׳׳׳™׳©׳•׳¨ ׳”׳×׳•׳¨:",
    buildApprovalLink(request, booking)
  ];
  return "https://wa.me/" + ortalPhone + "?text=" + encodeURIComponent(lines.join("\n"));
}

function isGoogleConfigured() {
  return Boolean(config.googleCalendarId && config.googleClientId && config.googleClientSecret && config.googleRefreshToken);
}

function isStripeConfigured() {
  return Boolean(config.stripeSecretKey);
}

async function getGoogleAccessToken() {
  const body = new URLSearchParams();
  body.set("client_id", config.googleClientId);
  body.set("client_secret", config.googleClientSecret);
  body.set("refresh_token", config.googleRefreshToken);
  body.set("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error("google-token-failed");
  }
  const json = await response.json();
  return json.access_token;
}

async function createCalendarEvent(booking) {
  if (!isGoogleConfigured()) {
    return { mode: "not-configured", eventId: "", htmlLink: "" };
  }

  const [year, month, day] = String(booking.preferredDate || "").split("-").map(Number);
  const [hour, minute] = String(booking.preferredSlot || "09:00").split(":").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, hour - 3, minute || 0));
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const payload = {
    summary: `WAFFELS | ${booking.dogName || "Booking"}`,
    description: [
      `Customer: ${booking.fullName || ""}`,
      `Phone: ${booking.phone || ""}`,
      `Dog: ${booking.dogName || ""}`,
      `Breed: ${booking.dogBreed || "-"}`,
      `Service: ${booking.serviceType || "-"}`,
      `Notes: ${booking.notes || "-"}`
    ].join("\n"),
    start: {
      dateTime: start.toISOString(),
      timeZone: config.timeZone
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: config.timeZone
    }
  };

  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(config.googleCalendarId) + "/events",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error("google-calendar-failed:" + text);
  }

  const json = await response.json();
  return {
    mode: "api",
    eventId: json.id || "",
    htmlLink: json.htmlLink || ""
  };
}

async function createStripeCheckoutSession(request, booking) {
  if (!isStripeConfigured()) return null;

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", buildPaymentSuccessUrl(request, booking));
  form.set("cancel_url", buildPaymentCancelUrl(request, booking));
  form.set("payment_method_types[0]", "card");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "ils");
  form.set("line_items[0][price_data][unit_amount]", String(Math.round(booking.depositAmountIls * 100)));
  form.set("line_items[0][price_data][product_data][name]", "WAFFELS deposit");
  form.set("line_items[0][price_data][product_data][description]", `Deposit for ${booking.dogName || "booking"}`);
  form.set("metadata[booking_id]", booking.id);
  form.set("metadata[approval_token]", booking.approvalToken);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + config.stripeSecretKey,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("stripe-session-failed:" + text);
  }

  return response.json();
}

async function getStripeCheckoutSession(sessionId) {
  if (!isStripeConfigured() || !sessionId) return null;
  const response = await fetch(
    "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId),
    {
      headers: { Authorization: "Bearer " + config.stripeSecretKey }
    }
  );
  if (!response.ok) {
    throw new Error("stripe-session-fetch-failed");
  }
  return response.json();
}

async function ensurePaymentLink(request, booking) {
  if (booking.paymentUrl && booking.paymentSessionId && booking.depositStatus !== "paid") {
    return {
      paymentUrl: booking.paymentUrl,
      paymentSessionId: booking.paymentSessionId
    };
  }
  const session = await createStripeCheckoutSession(request, booking);
  if (!session) {
    booking.paymentUrl = "";
    booking.paymentSessionId = "";
    return { paymentUrl: "", paymentSessionId: "" };
  }
  booking.paymentUrl = session.url || "";
  booking.paymentSessionId = session.id || "";
  return {
    paymentUrl: booking.paymentUrl,
    paymentSessionId: booking.paymentSessionId
  };
}

async function markBookingApproved(request, database, booking) {
  if (booking.status === BOOKING_STATUS.CONFIRMED) {
    return {
      booking,
      paymentUrl: "",
      paymentWhatsappUrl: "",
      paymentRequired: false
    };
  }
  if (hasLockedReservation(database.bookings, booking.preferredDate, booking.preferredSlot, booking.id)) {
    const conflict = new Error("slot-already-approved");
    conflict.code = "slot-already-approved";
    throw conflict;
  }
  booking.status = BOOKING_STATUS.APPROVED_WAITING_DEPOSIT;
  booking.approvedAt = new Date().toISOString();
  booking.updatedAt = booking.approvedAt;
  booking.depositStatus = "pending";
  booking.depositAmountIls = booking.depositAmountIls || config.depositAmountIls;
  booking.depositExpiresAt = new Date(Date.now() + config.depositWindowMinutes * 60 * 1000).toISOString();
  booking.calendarError = "";
  const payment = await ensurePaymentLink(request, booking);
  writeDatabase(database);
  return {
    booking,
    paymentUrl: payment.paymentUrl,
    paymentWhatsappUrl: buildCustomerPaymentWhatsappLink(booking, payment.paymentUrl),
    paymentRequired: Boolean(payment.paymentUrl)
  };
}

async function finalizePaidBooking(database, booking) {
  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.depositStatus = "paid";
  booking.depositPaidAt = new Date().toISOString();
  booking.updatedAt = booking.depositPaidAt;
  if (!booking.calendarEventId) {
    try {
      const calendarResult = await createCalendarEvent(booking);
      booking.calendarEventId = calendarResult.eventId || "";
      booking.calendarHtmlLink = calendarResult.htmlLink || "";
      booking.calendarMode = calendarResult.mode || "api";
      booking.calendarError = "";
    } catch (error) {
      booking.calendarError = String(error.message || error);
    }
  }
  writeDatabase(database);
  return booking;
}

async function handleFinalizePayment(database, booking, sessionId) {
  if (booking.depositStatus === "paid" || booking.status === BOOKING_STATUS.CONFIRMED) {
    return finalizePaidBooking(database, booking);
  }
  if (!sessionId) {
    const missing = new Error("missing-session");
    missing.code = "missing-session";
    throw missing;
  }
  const session = await getStripeCheckoutSession(sessionId);
  if (!session || session.payment_status !== "paid") {
    const unpaid = new Error("payment-not-completed");
    unpaid.code = "payment-not-completed";
    throw unpaid;
  }
  booking.paymentSessionId = session.id || booking.paymentSessionId;
  booking.paymentStatus = session.payment_status || "paid";
  booking.paymentIntentId = session.payment_intent || booking.paymentIntentId || "";
  return finalizePaidBooking(database, booking);
}

function cancelBooking(database, booking, reason = "") {
  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledAt = new Date().toISOString();
  booking.updatedAt = booking.cancelledAt;
  booking.cancelReason = sanitizeText(reason || "cancelled-by-admin", 200);
  booking.paymentUrl = "";
  writeDatabase(database);
  return booking;
}

function getBookingConfigResponse() {
  return {
    workWeekdays: config.workWeekdays.filter((weekday) => !CLOSED_BOOKING_WEEKDAYS.has(Number(weekday))),
    closedWeekdays: Array.from(CLOSED_BOOKING_WEEKDAYS),
    businessHours: BUSINESS_HOURS_TEXT,
    bookingHours: BOOKING_HOURS_TEXT,
    slotLabels: config.slotLabels,
    slotCapacity: config.slotCapacity,
    depositAmountIls: config.depositAmountIls,
    depositWindowMinutes: config.depositWindowMinutes,
    states: BOOKING_STATUS
  };
}

const conversationStore = new Map();

function createLeadState(conversationId, customerPhone = "") {
  return {
    conversationId,
    customerPhone: customerPhone || "",
    phone: customerPhone || "",
    customer_name: "",
    dog_name: "",
    service_requested: "",
    breed: "",
    notes: "",
    escalation_required: false,
    escalation_reason: "",
    savedLeadId: "",
    fullName: "",
    dogBreed: "",
    dogAge: "",
    dogWeight: "",
    estimatedWeight: "",
    lastGrooming: "",
    lastGroom: "",
    coatCondition: "",
    hasMats: "",
    behavior: "",
    isCalm: "",
    hasPhoto: false,
    requestedDate: "",
    preferredSlot: "",
    priceEstimate: "",
    leadScore: 0,
    leadStatus: "new",
    missingFields: [],
    conversationStage: "greeting",
    messageCount: 0,
    lastUserMessage: "",
    lastBotMessage: "",
    updatedAt: new Date().toISOString()
  };
}

function getConversationRecord(conversationId, customerPhone = "") {
  const key = sanitizeMultiline(conversationId || customerPhone || crypto.randomUUID(), 120);
  if (!conversationStore.has(key)) {
    conversationStore.set(key, {
      leadState: createLeadState(key, customerPhone),
      messages: []
    });
  }
  const record = conversationStore.get(key);
  if (customerPhone && !record.leadState.customerPhone) {
    record.leadState.customerPhone = normalizePhone(customerPhone);
  }
  record.leadState = normalizeLeadState(record.leadState, key, customerPhone);
  return record;
}

function normalizeLeadState(leadState = {}, conversationId = "", customerPhone = "") {
  const base = createLeadState(conversationId || leadState.conversationId || "", customerPhone || leadState.customerPhone || leadState.phone || "");
  const next = { ...base, ...leadState };
  next.customerPhone = normalizePhone(next.customerPhone || next.phone || customerPhone || "");
  next.phone = next.customerPhone;
  next.customer_name = sanitizeText(next.customer_name || next.fullName || "", 100);
  next.fullName = sanitizeText(next.fullName || next.customer_name || "", 100);
  next.dog_name = sanitizeText(next.dog_name || next.dogName || "", 80);
  next.service_requested = sanitizeText(next.service_requested || next.serviceType || next.requestedService || "", 120);
  next.breed = sanitizeText(next.breed || next.dogBreed || "", 80);
  next.notes = sanitizeMultiline(next.notes || "", 1200);
  next.escalation_required = Boolean(next.escalation_required);
  next.escalation_reason = sanitizeText(next.escalation_reason || "", 200);
  next.savedLeadId = sanitizeText(next.savedLeadId || "", 80);
  next.dogBreed = next.dogBreed || next.breed || "";
  next.dogWeight = next.dogWeight || next.estimatedWeight || "";
  next.estimatedWeight = next.estimatedWeight || next.dogWeight || "";
  next.lastGrooming = next.lastGrooming || next.lastGroom || "";
  next.lastGroom = next.lastGroom || next.lastGrooming || "";
  next.coatCondition = next.coatCondition || next.hasMats || "";
  next.hasMats = next.hasMats || next.coatCondition || "";
  next.behavior = next.behavior || next.isCalm || "";
  next.isCalm = next.isCalm || next.behavior || "";
  next.requestedDate = next.requestedDate || next.preferredSlot || "";
  next.preferredSlot = next.preferredSlot || next.requestedDate || "";
  next.priceEstimate = next.priceEstimate || "";
  next.leadScore = Number(next.leadScore) || 0;
  next.leadStatus = next.leadStatus || "new";
  next.missingFields = Array.isArray(next.missingFields) ? next.missingFields : [];
  next.conversationStage = next.conversationStage || "greeting";
  return next;
}

function inferLeadStateFromText(leadState, message) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  const next = normalizeLeadState(leadState);
  const previousStage = next.conversationStage || "";
  next.messageCount += 1;
  next.lastUserMessage = sanitizeMultiline(text, 2000);
  next.updatedAt = new Date().toISOString();

  if (!next.customerPhone) {
    const phoneMatch = text.match(/(?:\+?972|0)?5\d[\d\s-]{6,11}\d/);
    if (phoneMatch) {
      next.customerPhone = normalizePhone(phoneMatch[0]);
      next.phone = next.customerPhone;
    }
  }
  if (!next.service_requested) {
    const serviceMatch = text.match(/(תספורת|מקלחת|רחצה|סידור פרווה|פתיחת קשרים|גזירת ציפורניים|ניקוי אוזניים|טיפוח|תור)/i);
    if (serviceMatch) next.service_requested = serviceMatch[1];
  }
  if (!next.dog_name) {
    const dogNameMatch = text.match(/(?:שם הכלב|קוראים לו|קוראים לה|לכלב קוראים|לכלבה קוראים)\s+([א-תA-Za-z0-9'-]{2,30})/i);
    if (dogNameMatch) next.dog_name = sanitizeText(dogNameMatch[1], 80);
  }
  if (!next.customer_name) {
    const customerNameMatch = text.match(/(?:קוראים לי|אני)\s+([א-תA-Za-z'-]{2,30})/i);
    if (customerNameMatch) {
      next.customer_name = sanitizeText(customerNameMatch[1], 100);
      next.fullName = next.customer_name;
    }
  }
  if (/(תמונה|מצורף|שלחתי|העליתי|צירפתי|שלחתי תמונה)/i.test(text)) next.hasPhoto = true;
  if (/(היום|מחר|השבוע|ביום|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/i.test(text)) {
    next.requestedDate = sanitizeMultiline(text, 120);
    next.preferredSlot = next.requestedDate;
  }
  if (!next.dogBreed) {
    const breedMatch = text.match(/(שיצו|שי צו|פומרניאן|שפיץ|מלטז|פודל|יורקשייר|לברדור|גולדן|פקינז|בישון|דוברמן|דלמטי|בוקסר|האסקי|סמוייד|קוקר|ביגל|כלב קטן|כלב בינוני|כלב גדול)/i);
    if (breedMatch) next.dogBreed = breedMatch[1];
  }
  if (!next.dogAge) {
    const ageMatch = text.match(/(?:בן|בת)\s*([\d.]+|שנה|שנתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר)/i);
    if (ageMatch) next.dogAge = ageMatch[0];
  }
  if (!next.dogWeight) {
    const weightMatch = text.match(/(\d{1,2})\s*(?:קילו|קג|ק\"ג|kg)/i);
    if (weightMatch) {
      next.dogWeight = `${weightMatch[1]} קילו`;
      next.estimatedWeight = next.dogWeight;
    }
  }
  if (!next.coatCondition && (
    /(קשרים|קשר|בלי קשרים|אין קשרים|הרבה קשרים|מלא קשרים|נשירה|פרווה|קרחות|קרחת|רגיל|רגילה|נקי|בסדר|כן|לא|קצת)/i.test(text) ||
    previousStage === "collect_coat_condition"
  )) {
    if (/בלי קשרים|אין קשרים/i.test(text)) next.coatCondition = "אין קשרים";
    else if (/מלא קשרים|הרבה קשרים|קשרים קשים|ראסטות/i.test(text)) next.coatCondition = "קשרים קשים";
    else if (/קשרים|קשר/i.test(text)) next.coatCondition = "יש קשרים";
    else if (/נשירה/i.test(text)) next.coatCondition = "נשירה";
    else if (/קרחות|קרחת/i.test(text)) next.coatCondition = "חשד עור/קרחות";
    else if (previousStage === "collect_coat_condition" && /^(כן|יש|קצת|יש קצת|נראה לי שכן)$/i.test(text.trim())) next.coatCondition = "יש קשרים";
    else if (previousStage === "collect_coat_condition" && /^(לא|אין|בלי|רגיל|רגילה|נקי|בסדר|מצב רגיל)$/i.test(text.trim())) next.coatCondition = "אין קשרים / מצב רגיל";
    next.hasMats = next.coatCondition;
  }
  if (!next.behavior && /(רגוע|רגועה|פחדן|נושך|נשך|לא רגוע|עצבני|מפחד|לא נותן)/i.test(text)) {
    next.behavior = /לא רגוע|פחדן|נושך|נשך|עצבני|מפחד|לא נותן/i.test(text) ? "טיפול מורכב / צריך סבלנות" : "רגוע";
    next.isCalm = next.behavior;
  }
  if (!next.lastGrooming && /(לפני|חודש|חודשים|חצי שנה|שנה|תספורת אחרונה|לא יודע|לא זוכר)/i.test(text)) {
    next.lastGrooming = sanitizeMultiline(text, 120);
    next.lastGroom = next.lastGrooming;
  }
  next.missingFields = getMissingLeadFields(next);
  next.conversationStage = getConversationStage(next, lower);
  next.leadScore = calculateLeadScore(next);
  next.leadStatus = next.leadScore >= 70 ? "qualified" : (next.leadScore >= 35 ? "collecting" : "new");

  return next;
}

function getMissingLeadFields(leadState) {
  const missing = [];
  if (!leadState.service_requested) missing.push("שירות מבוקש");
  if (!leadState.dog_name) missing.push("שם הכלב");
  if (!leadState.customerPhone && !leadState.phone) missing.push("טלפון");
  if (!leadState.customer_name && !leadState.fullName) missing.push("שם הלקוח");
  if (!leadState.breed && !leadState.dogBreed) missing.push("גזע / גודל");
  if (!leadState.notes && !leadState.coatCondition && !leadState.behavior) missing.push("הערות / מצב פרווה / התנהגות");
  return missing;
}

function calculateLeadScore(leadState) {
  let score = 0;
  if (leadState.customerPhone || leadState.phone) score += 30;
  if (leadState.dog_name) score += 25;
  if (leadState.service_requested) score += 25;
  if (leadState.customer_name || leadState.fullName) score += 8;
  if (leadState.breed || leadState.dogBreed) score += 6;
  if (leadState.notes || leadState.coatCondition || leadState.behavior) score += 6;
  return Math.min(score, 100);
}

function detectConversationIntent(message) {
  const text = String(message || "").toLowerCase();
  if (/^\s*(.)\1{4,}\s*$/.test(text) || /http|www\.|קזינו|הלוואה|ספאם|xxx/i.test(text)) return "spam_or_low_quality";
  if (/כמה עולה|מחיר|עלות|כמה זה|בלי תמונה/.test(text)) return "price_question";
  if (/תור|לקבוע|אפשר(?:\s+ב|\s+היום)?|היום|מחר|מתי פנוי|פנוי|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת/.test(text)) return "appointment_request";
  if (/תמונה|מצורף|שלחתי|צירפתי|העליתי/.test(text)) return "photo_sent";
  if (/קרחות|קרחת|פצע|פציעה|דם|גירוי|עור|אדום|אלופציה|bsd|alopecia/.test(text)) return "complaint_or_concern";
  if (/שיצו|שי צו|פומרניאן|שפיץ|פודל|מלטז|יורקשייר|לברדור|גולדן|פקינז|בישון|דוברמן|דלמטי|בוקסר|האסקי|סמוייד|כלב קטן|כלב בינוני|כלב גדול/.test(text)) return "breed_info";
  if (/תספורת|רחצה|דילול|מריטה|ציפורניים|אוזניים|נשירה|קשרים|גור/.test(text)) return "service_question";
  return "unclear";
}

function getRelativeRequestedWeekday(text) {
  const now = new Date();
  const requested = new Date(now);
  if (/מחר/.test(text)) requested.setDate(requested.getDate() + 1);
  else if (/היום/.test(text)) requested.setDate(requested.getDate());
  else return null;
  return requested.getDay();
}

function detectClosedBookingDayRequest(message) {
  const text = String(message || "").toLowerCase();
  if (/שלישי/.test(text)) return "שלישי";
  if (/שישי/.test(text)) return "שישי";
  if (/שבת/.test(text)) return "שבת";
  const relativeWeekday = getRelativeRequestedWeekday(text);
  if (relativeWeekday !== null && CLOSED_BOOKING_WEEKDAYS.has(relativeWeekday)) {
    return HEBREW_WEEKDAY_NAMES[relativeWeekday];
  }
  return "";
}

function detectOutsideBookingHoursRequest(message) {
  const text = String(message || "");
  const match = text.match(/(?:ב|בשעה\s*)?(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  const totalMinutes = hour * 60 + minute;
  if (totalMinutes < 9 * 60 || totalMinutes > 14 * 60) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return "";
}

function getConversationStage(leadState, text = "") {
  if (/(מה שלומך|מה נשמע|אהלן|שלום|היי)\s*$/i.test(text) && leadState.messageCount <= 1) return "greeting";
  if (!leadState.dogBreed) return "collect_breed";
  if (!leadState.dogAge || !(leadState.dogWeight || leadState.estimatedWeight)) return "collect_age_weight";
  if (!(leadState.lastGrooming || leadState.lastGroom)) return "collect_last_grooming";
  if (!(leadState.coatCondition || leadState.hasMats)) return "collect_coat_condition";
  if (!leadState.hasPhoto) return "ask_photo";
  if (!leadState.priceEstimate) return "quote_range";
  return "offer_booking";
}

function getNextConversationAction(leadState, message) {
  const intent = detectConversationIntent(message);
  if (intent === "spam_or_low_quality") return "human_review";
  if (intent === "complaint_or_concern") return "human_review";
  const stage = getConversationStage(leadState, String(message || "").toLowerCase());
  if (stage === "ask_photo") return "ask_photo";
  if (stage === "quote_range") return "quote_range";
  if (stage === "offer_booking") return "offer_booking";
  if (stage === "human_review") return "human_review";
  return "collect_info";
}

function getWafflesWhatsappUrl(message = "היי אורטל, אשמח להמשיך לתיאום טיפול לכלב שלי 🐶") {
  const site = readSiteContent().content || {};
  const business = site.business || {};
  const phone = String(business.phoneIntl || business.phone || "972528978102").replace(/[^\d]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function getWebsiteAiRedirectText() {
  return `כדי שאורטל תיתן הערכה אמיתית ותבדוק תור, צריך להכין 3 תמונות: צד, פנים ותמונה בעמידה. בגלל שכל כלב מקבל חלון אישי של 1-4 שעות, שריון מקום נעשה עם מקדמת ביטחון של 200 ₪. שלחו את התמונות בוואטסאפ ונמשיך משם לקישור תיאום מאובטח: ${getWafflesWhatsappUrl("היי אורטל, אשמח לשלוח תמונות ולבדוק תור לכלב שלי 🐶")}`;
}

function appendWebsiteAiRedirect(reply, source) {
  if (source !== "ai-screen") return reply;
  if (/אקדמיה|לימודים|קורס|הכשרה|ספרות כלבים|WAFFLES Academy/i.test(reply)) return reply;
  if (/wa\.me\//i.test(reply)) return reply;
  if (/איך אני (יכולה|יכול) לעזור/.test(reply)) return reply;
  return reply;
}

function getGroomingPricingReply(message) {
  const text = String(message || "").toLowerCase();
  const asksPrice = /כמה עולה|מחיר|עלות|כמה זה|כמה/.test(text);
  if (!asksPrice) return "";

  const hasPoodle = /פודל|poodle/.test(text);
  const hasShortCoat = /דוברמן|doberman|קצר פרווה|דלמטי|בוקסר|ויסלה|ויימרנר|נשירה/.test(text);
  const hasSmall = /קטן|טוי|toy|ננסי|מיני|mini/.test(text);
  const hasPom = /פומרניאן|שפיץ|pom|spitz/.test(text);
  const hasShih = /שיצו|שי צו|מלטז|יורקשייר|בישון/.test(text);
  const hasBig = /גדול|לברדור|גולדן|רועה|האסקי|סמוייד/.test(text);
  const hasMedium = /בינוני|קוקר|ביגל/.test(text);
  const hasMats = /קשרים|קשר|מוזנח|ראסטות|פרווה סבוכה/.test(text);

  let reply = "תספורת לכלב קטן מתחילה בדרך כלל סביב 180-250 ₪, אבל המחיר הסופי נקבע לפי זמן העבודה בפועל, מצב הפרווה והתמונה של הכלב.";
  if (hasShortCoat) {
    reply = "טיפול לכלב קצר פרווה כמו דוברמן/דלמטי כולל הוצאת שיער מת, רחצה מקצועית, ייבוש, ניקוי אוזניים וגזירת ציפורניים. העלות היא בדרך כלל 170-180 ₪ לשעת עבודה, לפי מצב הפרווה בפועל.";
  } else if (hasPoodle && hasSmall) {
    reply = "תספורת לפודל קטן חדש היא בטווח של 170 ₪ לשעת עבודה עד 180 ₪ לשעתיים. המחיר הסופי נקבע לפי זמן העבודה בפועל ומצב הפרווה.";
  } else if (hasPoodle) {
    reply = "תספורת לפודל היא בדרך כלל בטווח של 250-450 ₪, לפי גודל הכלב, סגנון התספורת, קשרים וזמן העבודה בפועל.";
  } else if (hasPom) {
    reply = "טיפול לפומרניאן/שפיץ הוא בדרך כלל בטווח של 220-380 ₪, לפי צפיפות הפרווה, נשירה, קשרים והאם צריך דילול או שיקום פרווה.";
  } else if (hasShih) {
    reply = "תספורת לשיצו/מלטז/כלב קטן דומה היא בדרך כלל בטווח של 180-280 ₪, לפי מצב הפרווה וזמן העבודה בפועל.";
  } else if (hasBig) {
    reply = "טיפול לכלב גדול הוא בדרך כלל בטווח של 350-500 ₪, ויכול להשתנות לפי צפיפות הפרווה, קשרים, התנהגות וזמן העבודה בפועל.";
  } else if (hasMedium) {
    reply = "טיפול לכלב בינוני הוא בדרך כלל בטווח של 250-350 ₪, לפי מצב הפרווה, קשרים וזמן העבודה בפועל.";
  }

  if (hasMats) {
    reply += " אם יש קשרים קשים או ראסטות, יכולה להיות תוספת כי העבודה נעשית בזהירות ולא בלחץ.";
  }
  return reply;
}

function estimateConversationPriceRange(leadState) {
  const breed = String(leadState.dogBreed || "").toLowerCase();
  const weight = String(leadState.dogWeight || leadState.estimatedWeight || "").toLowerCase();
  const coat = String(leadState.coatCondition || leadState.hasMats || "").toLowerCase();
  let range = "180-250 ₪";

  if (/כלב גדול|לברדור|גולדן|האסקי|סמוייד|רועה|גדול|25|30|40/.test(breed + " " + weight)) {
    range = "350-500 ₪";
  } else if (/כלב בינוני|בינוני|קוקר|ביגל|12|15|18|20/.test(breed + " " + weight)) {
    range = "250-350 ₪";
  } else if (/פודל/.test(breed) && !/קטן|טוי|ננסי|מיני/.test(breed + " " + weight)) {
    range = "250-450 ₪";
  }

  if (/קשרים קשים|מלא קשרים|הרבה קשרים|ראסטות/.test(coat)) {
    range += " + תוספת קשרים קשים 100-200 ₪";
  } else if (/קשרים|יש קשר/.test(coat)) {
    range += " + תוספת קשרים קלים 50-100 ₪";
  }

  if (/נושך|לא רגוע|טיפול מורכב|מפחד|לא נותן/.test(String(leadState.behavior || leadState.isCalm || "").toLowerCase())) {
    range += " (טיפול מורכב ייקבע אחרי בדיקה)";
  }

  return range;
}

function createConversationResult(reply, leadState, nextAction, confidence = 0.86, shouldEscalateToOrtal = false) {
  return {
    reply: sanitizeMultiline(reply, 1600),
    updatedLeadState: leadState,
    nextAction,
    confidence,
    shouldEscalateToOrtal
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildRuleBasedConversationResult(leadState, message, source = "") {
  const text = String(message || "").toLowerCase();
  const intent = detectConversationIntent(message);
  const stage = leadState.conversationStage || getConversationStage(leadState, text);
  const breed = String(leadState.dogBreed || "").trim();
  const hasBreed = Boolean(breed);
  const hasPhoto = Boolean(leadState.hasPhoto);
  const next = { ...leadState };
  const closedDayName = detectClosedBookingDayRequest(message);
  const outsideBookingHour = detectOutsideBookingHoursRequest(message);

  if (intent === "spam_or_low_quality") {
    return createConversationResult("לא בטוחה שהבנתי 🙂 אפשר לכתוב לי בקצרה איזה כלב יש ומה צריך לעשות?", next, "human_review", 0.55, true);
  }

  if (/(מה שלומך|מה קורה|מה נשמע|היי|שלום|ערב טוב|בוקר טוב|אהלן)/.test(text) && text.length < 18) {
    const reply = source === "academy-screen"
      ? "מעולה, מה נשמע?? איך אני יכולה לעזור לגבי הלימודים או הקורסים באקדמיה של אורטל? 🎓"
      : "מעולה, מה נשמע?? איך אני יכולה לעזור לכם ולכלב שלכם היום? 😊";
    return createConversationResult(reply, next, "collect_info", 0.92, false);
  }

  if (source === "academy-screen") {
    if (/אין לי ניסיון|בלי ניסיון|מתחיל|מתחילה|מתחילים|חדש בתחום/.test(text)) {
      return createConversationResult(
        "זה מתאים בדיוק למתחילים שרוצים סדר ולא ללמוד במקרה.\nהמסלול מתחיל מהבסיס: סוגי פרווה, רחצה, ייבוש, הברשה, ציוד, הכנה לתספורת ועבודה בטוחה עם הכלב. מה יותר מעניין אותך — מקצוע חדש או פתיחת עסק?",
        next,
        "collect_info",
        0.9,
        false
      );
    }
    if (/למי מתאים|מתאים לי|מי מתאים|למי זה/.test(text)) {
      return createConversationResult(
        "הקורס מתאים למי שרוצה מקצוע אמיתי, למתחילים שרוצים שיטה מסודרת, וגם למי שחושב עסקית ורוצה להבין שירות, תמחור ולקוחות.\nיש לך ניסיון קודם עם כלבים או שאת/ה מתחיל/ה מאפס?",
        next,
        "collect_info",
        0.9,
        false
      );
    }
    if (/מה מקבלים|מקבלים|כולל בליווי|ליווי|תרגול|עסקית|סטנדרט/.test(text)) {
      return createConversationResult(
        "מקבלים ליווי אישי, תרגול מעשי, חשיבה עסקית, סטנדרט עבודה גבוה וכלי ברור להמשך הדרך.\nהמטרה היא שלא רק תדע/י לבצע טיפול, אלא תרגיש/י ביטחון מקצועי מול כלב ולקוח.",
        next,
        "collect_info",
        0.9,
        false
      );
    }
    if (/מחיר|עלות|כמה עולה|זמנים|ימים|שעות|מתי/.test(text)) {
      return createConversationResult(
        "מחיר הקורס הוא 15,900 ₪.\nזה מסלול פרימיום עם ליווי אישי ותרגול מעשי, לא קורס המוני. כדי לבדוק התאמה, יש לך ניסיון קודם או שאת/ה מתחיל/ה מאפס?",
        next,
        "collect_info",
        0.88,
        false
      );
    }
    if (/מה לומדים|סילבוס|תוכנית|מסלול|נושאים|כולל/.test(text)) {
      return createConversationResult(
        "זה מסלול פרימיום מעשי: סוגי פרווה, רחצה וייבוש מקצועי, עבודה עם ציוד, הכנה לתספורת, גזירה, קווים וגימור נקי.\nבנוסף לומדים ניהול כלב רגוע, שירות מול לקוחות, תיאום ציפיות וסטנדרט עבודה אישי. יש תחום שמעניין אותך במיוחד?",
        next,
        "collect_info",
        0.9,
        false
      );
    }
    if (/פודל|פומרניאן|מריטה|bsd|אלופציה|שיקום פרווה|קשרים/.test(text)) {
      return createConversationResult(
        "זה בדיוק חלק מההתמחות של WAFFELS Academy 🙂 לומדים איך לאבחן פרווה, לעבוד בלי למהר, להבין מתי דילול/פתיחת קשרים/שיקום מתאים, ומתי צריך זהירות או בדיקה וטרינרית.\nאת/ה רוצה ללמוד את זה כמקצוע מלא או לחיזוק טכניקה קיימת?",
        next,
        "collect_info",
        0.9,
        false
      );
    }
    if (/להירשם|רוצה להצטרף|שיחת התאמה|לקבוע|תיאום|מתאים לי/.test(text)) {
      return createConversationResult(
        `מעולה 🙂 השלב הבא הוא שיחת התאמה קצרה עם אורטל: ניסיון קודם, מטרות וזמינות.\nאפשר לשלוח הודעה כאן: ${getWafflesWhatsappUrl("היי אורטל, אשמח לבדוק התאמה ל-WAFFELS Academy ולמסלול הפרימיום")}`,
        next,
        "offer_booking",
        0.9,
        true
      );
    }
  }

  if (/לא רוצה לשלוח תמונה|אין לי תמונה|בלי תמונה|לא שולח|לא אשלח/.test(text)) {
    const range = hasBreed ? estimateConversationPriceRange(next) : "180-500 ₪ לפי גודל, פרווה וקשרים";
    next.priceEstimate = range;
    return createConversationResult(
      `אין בעיה, בלי תמונה אפשר לתת רק טווח כללי ולא מחיר סופי.\n${hasBreed ? `ל${breed} זה לרוב באזור ${range}, אם הפרווה במצב רגיל.` : `בדרך כלל זה באזור ${range}.`} אם יש קשרים או טיפול מורכב זה יכול לעלות יותר.`,
      next,
      "quote_range",
      0.84,
      false
    );
  }

  if (intent === "complaint_or_concern") {
    return createConversationResult(
      "הבנתי. במקרה כזה חשוב שאורטל תראה תמונה לפני שקובעים טיפול.\nאם יש פצע פתוח, גירוי חזק או בעיית עור פעילה, עדיף גם להתייעץ עם וטרינר לפני תספורת.",
      next,
      "human_review",
      0.9,
      true
    );
  }

  if (intent === "photo_sent") {
    next.hasPhoto = true;
    if (hasBreed && (next.dogWeight || next.estimatedWeight) && (next.coatCondition || next.hasMats)) {
      const range = estimateConversationPriceRange(next);
      next.priceEstimate = range;
      return createConversationResult(
        `מעולה, תודה 🙂 לפי הפרטים זה נראה באזור ${range}, בכפוף לאישור של אורטל לפי התמונה.\nרוצה שאבדוק לך תור? איזה יום או שעה נוחים לך?`,
        next,
        "offer_booking",
        0.88,
        false
      );
    }
    if (hasBreed && !(next.dogWeight || next.estimatedWeight)) {
      return createConversationResult("מעולה, תודה 🙂 כדי לדייק את הטווח, כמה הוא שוקל בערך?", next, "collect_info", 0.86, false);
    }
    return createConversationResult("מעולה, תודה 🙂 עכשיו אפשר לדייק יותר. איזה סוג כלב זה וכמה בערך הוא שוקל?", next, "collect_info", 0.86, false);
  }

  if (intent === "price_question") {
    if (!hasBreed) {
      return createConversationResult("היי 🙂 בשמחה. זה תלוי בסוג הכלב ובמצב הפרווה.\nאיזה סוג כלב זה בערך?", next, "collect_info", 0.94, false);
    }
    if (!hasPhoto) {
      const range = estimateConversationPriceRange(next);
      next.priceEstimate = range;
      return createConversationResult(
        `בלי תמונה אני לא רוצה להטעות אותך, אז זה רק טווח כללי.\nל${breed} זה לרוב באזור ${range}, והמחיר הסופי תלוי במצב הפרווה והקשרים.`,
        next,
        "ask_photo",
        0.88,
        false
      );
    }
    const range = estimateConversationPriceRange(next);
    next.priceEstimate = range;
    return createConversationResult(`לפי מה שכתבת, הטווח המשוער הוא ${range}.\nכדי שאורטל תאשר מחיר ותור, צריך גם 3 תמונות: צד, פנים ותמונה בעמידה.`, next, "offer_booking", 0.86, false);
  }

  if (intent === "appointment_request") {
    if (closedDayName) {
      return createConversationResult(
        `ביום ${closedDayName} אורטל לא מקבלת תורים, כדי לשמור על עבודה רגועה ומדויקת.\nאפשר לבדוק לך ${OPEN_BOOKING_DAY_TEXT}. איזה יום מהם הכי נוח לך?`,
        next,
        "offer_booking",
        0.92,
        false
      );
    }
    if (outsideBookingHour) {
      return createConversationResult(
        `בשעה ${outsideBookingHour} לא מתחילים תורים חדשים. שעות קביעת התורים הן ${BOOKING_HOURS_TEXT}, והמספרה פעילה עד 16:00.\nאיזו שעה בין 09:00 ל-14:00 הכי נוחה לך?`,
        next,
        "offer_booking",
        0.9,
        false
      );
    }
    if (!hasBreed || !hasPhoto) {
      return createConversationResult("אבדוק לך 🙂 קודם רק כדי שלא נקבע משהו לא מתאים —\nאיזה סוג כלב זה, ויש לך תמונה עדכנית שלו?", next, "collect_info", 0.88, false);
    }
    return createConversationResult(
      "מעולה, אפשר לבדוק 🙂 איזו שעה בין 09:00 ל-14:00 נוחה לך יותר?\nאחרי שאורטל מאשרת חלון ביומן, שומרים את המקום עם מקדמת ביטחון של 200 ₪.",
      next,
      "offer_booking",
      0.88,
      true
    );
  }

  if (/נושך|נשך|לא רגוע|מפחד|לא נותן|עצבני/.test(text)) {
    return createConversationResult("סבבה, חשוב לדעת את זה מראש כדי לא להלחיץ אותו.\nאיזה סוג כלב זה, ומתי הייתה התספורת האחרונה?", next, "collect_info", 0.9, false);
  }

  if (/מלא קשרים|הרבה קשרים|קשרים קשים|קשרים|קשר/.test(text)) {
    return createConversationResult("סבבה, אז המחיר יכול להשתנות לפי מצב הפרווה.\nתשלח לי רגע תמונה עדכנית שלו, כדי שאורטל תוכל לתת הערכת מחיר אמיתית ולא סתם לזרוק מספר.", next, "ask_photo", 0.92, false);
  }

  if (/פומרניאן|שפיץ/.test(text) && /נשירה|פרווה|קרחות|דילול/.test(text)) {
    return createConversationResult("הבנתי. בפומרניאן נשירה או דילול פרווה יכולים להיות רגישים, אז עדיף שאורטל תראה תמונה לפני שממליצים.\nבן כמה הוא בערך, ויש לך תמונה עדכנית?", next, "ask_photo", 0.86, false);
  }

  if (intent === "breed_info" || hasBreed) {
    if (!leadState.dogAge && !(leadState.dogWeight || leadState.estimatedWeight)) {
      return createConversationResult("מעולה. בן כמה הוא בערך וכמה הוא שוקל?", next, "collect_info", 0.9, false);
    }
    if (!(leadState.dogWeight || leadState.estimatedWeight)) {
      return createConversationResult("מעולה. וכמה הוא שוקל בערך?", next, "collect_info", 0.9, false);
    }
    if (!leadState.dogAge) {
      return createConversationResult("מעולה. בן כמה הוא בערך?", next, "collect_info", 0.9, false);
    }
    if (!(leadState.lastGrooming || leadState.lastGroom)) {
      return createConversationResult("מעולה. מתי הייתה התספורת האחרונה שלו?", next, "collect_info", 0.88, false);
    }
    if (!(leadState.coatCondition || leadState.hasMats)) {
      return createConversationResult("סבבה. איך הפרווה שלו כרגע — יש קשרים או שהיא יחסית מסודרת?", next, "collect_info", 0.88, false);
    }
    if (!hasPhoto) {
      return createConversationResult("מעולה, זה מספיק כדי להתקדם.\nתשלח לי רגע תמונה עדכנית שלו, ואז אורטל תוכל לתת טווח אמיתי ולהתקדם לתור.", next, "ask_photo", 0.88, false);
    }
    const range = estimateConversationPriceRange(next);
    next.priceEstimate = range;
    return createConversationResult(
      `מעולה 🙂 לפי הפרטים זה באזור ${range}, בכפוף לתמונה ולבדיקה של אורטל.\nרוצה שאבדוק לך תור? איזה יום נוח לך?`,
      next,
      "offer_booking",
      0.86,
      false
    );
  }

  if (stage === "collect_last_grooming") {
    return createConversationResult("סבבה. מתי הייתה התספורת האחרונה שלו?", next, "collect_info", 0.8, false);
  }
  if (stage === "collect_coat_condition") {
    return createConversationResult("איך הפרווה שלו כרגע — יש קשרים או שהיא יחסית מסודרת?", next, "collect_info", 0.8, false);
  }
  if (stage === "ask_photo") {
    return createConversationResult("מעולה, אנחנו כבר כמעט שם.\nתשלח לי רגע תמונה עדכנית שלו, ואז אפשר לדייק מחיר ולהתקדם לתור.", next, "ask_photo", 0.84, false);
  }
  if (stage === "quote_range") {
    const range = estimateConversationPriceRange(next);
    next.priceEstimate = range;
    return createConversationResult(
      `לפי מה שכתבת, הטווח המשוער הוא ${range}, בכפוף לתמונה ולבדיקה של אורטל.\nרוצה שאבדוק לך תור? איזה יום נוח לך?`,
      next,
      "offer_booking",
      0.84,
      false
    );
  }

  return createConversationResult("אני לא רוצה להטעות אותך, צריך עוד פרט קטן כדי לדייק.\nאיזה סוג כלב זה בערך?", next, "collect_info", 0.62, false);
}

function buildConversationSystemPrompt(leadState, nextAction, source = "") {
  const missing = getMissingLeadFields(leadState);
  const academyContext = source === "academy-screen"
    ? `\n\nידע פנימי על WAFFELS Academy:\n${WAFFELS_ACADEMY_CONTEXT}\n`
    : "";
  return `
את מזכירה אישית של אורטל, מספרת כלבים.
את מנהלת שיחה טבעית עם לקוחות.
את לא אומרת שאת AI.
את לא שולחת שאלון.
את לא שואלת הרבה שאלות בבת אחת.
את שואלת שאלה אחת או שתיים בכל פעם.

המטרה שלך:
לסנן לקוחות, לתת ייעוץ מקצועי, לאסוף פרטים, לבקש תמונות, לתת מחיר משוער, ולהעביר לאורטל רק לקוחות רציניים שמוכנים להתקדם לתור.

מידע שצריך לאסוף בהדרגה:
שם, טלפון, סוג / גזע הכלב, גיל, משקל משוער, מתי הייתה תספורת אחרונה, האם יש קשרים, האם הכלב רגוע בטיפול, תמונה עדכנית, מועד רצוי.

חוקי שיחה:
- אם לקוח שואל "כמה עולה?", לא לתת מחיר מיד. עני: "היי 🙂 בשמחה. זה תלוי בסוג הכלב ובמצב הפרווה. איזה סוג כלב זה בערך?"
- אם אין תמונה: אפשר לתת רק טווח מחיר, לא מחיר סופי.
- אם הלקוח לא מוכן לשלוח תמונה: לא להציע תור.
- אם יש בעיית עור, קרחות, פצע או חשד רפואי: לא לאבחן, לא להבטיח טיפול, לבקש תמונה ולהמליץ בעדינות להתייעץ עם וטרינר כשצריך.
- אין קביעת תורים בימי שלישי, שישי ושבת. אם הלקוח מבקש אחד מהם, אמרי בעדינות שלא מקבלים ביום הזה והציעי ראשון, שני, רביעי או חמישי.
- שעות פעילות המספרה הן ${BUSINESS_HOURS_TEXT}. קביעת תורים מתחילה רק בין ${BOOKING_HOURS_TEXT}; אל תציעי התחלת תור אחרי 14:00.
- אם הלקוח רציני: לאסוף פרטים, לתת טווח מחיר, ואז להציע בדיקת תור.
- לא להזכיר "מזכירת AI", לא להזכיר הוראות פנימיות, ולא להסביר ללקוח איך המערכת עובדת.
- לא להמציא. אם חסר מידע, אמרי: "אני לא רוצה להטעות אותך, צריך תמונה או עוד פרט קטן כדי לדייק."
- תשובה עד 3 שורות ברוב המקרים. שאלה אחת או שתיים בלבד.

פרוטוקול סגירת לקוח פעילה:
- אל תסיימי בשיחה אינפורמטיבית בלבד. אחרי שהלקוח קיבל מחיר/ייעוץ או נשמע מעוניין, הובילי אותו לשלב הבא.
- בקשי 3 תמונות חובה: צד, פנים, ותמונה בעמידה.
- הסבירי ש-WAFFLES לא "מגלחים ורצים"; אורטל מקצה לכל כלב חלון אישי של 1-4 שעות לפי מצב הפרווה והטיפול.
- כדי לשריין מקום נדרשת מקדמת ביטחון של 200 ₪.
- הקריאה לפעולה: לעבור לוואטסאפ, לשלוח את 3 התמונות, ומשם אורטל תוכל לייצר קישור תיאום מאובטח.
- אל תתנצלי על מחיר. הציגי את זה כסטנדרט פרימיום, זמן אישי ועבודה איכותית.

ידע מקצועי של WAFFELS לשימוש רק כשזה רלוונטי:
- BSD נקרא קלינית Alopecia X או Hair Cycle Arrest. הוא נפוץ במיוחד בפומרניאן ובגזעים כפולי פרווה, ויכול לגרום לדילול סימטרי בצוואר, ירכיים וזנב ולהשחרת עור.
- כשלקוח מזכיר פומרניאן/שפיץ, נשירה קשה, קרחות, עור שחור או אלופציה: הסבירי בעדינות שיש ל-WAFFELS תהליך שיקום פרווה ועור, ושכדאי קודם לשלול אצל וטרינר מחלות הורמונליות כמו קושינג או תת פעילות בלוטת התריס.
- תהליך BSD כולל עקביות: גירוי מכני/מיקרונידלינג, רחצות טיפוליות ולחות לעור, ולעיתים תמיכה במלטונין לפי ייעוץ מתאים. אל תבטיחי ריפוי ואל תתני אבחון רפואי.
- פודלים ופרוות מורכבות: WAFFELS מתמחה בתספורות ביתיות אומנותיות וסטנדרט גזע, כולל כלבים מוזנחים, קשרים קשים או התנהגות מאתגרת, עם חלונות זמן ולא טיפול בלחץ.
- דוברמן וכלבים קצרי פרווה: הטיפול כולל הוצאת שיער מת בזמן נשירה, רחצה כפולה/מקצועית לפי צורך, הברקה, ניקוי אוזניים וגזירת ציפורניים. גם בכלב קצר פרווה לא עושים טיפול חפוז.
- מריטה ידנית: שירות ידני מדויק לגזעים מתאימים כדי לשמור על מרקם, קשיחות וצבע הפרווה. זה טיפול ארוך ומקצועי שלרוב לוקח 2-4 שעות.
- כל טיפול סטנדרטי כולל ניקוי אוזניים, גזירת ציפורניים, רחצה מקצועית, ייבוש, הברשה, פתיחת קשרים ועיצוב מותאם. אורטל לא "מגלחת ורצה".
- WAFFLES Academy: אם שואלים על לימודים, אפשר להסביר בקצרה שיש הכשרה בהיגיינה בסיסית, ניהול קשרים בלי כאב, פודלים/פומרניאן, שיקום BSD, מריטה, ותמחור/ניהול עסק פרימיום.
- מידע שהיה בעבר באתר ועכשיו שייך רק למנגנון החכם: עבודות אמיתיות מהמספרה, תהליך טיפוח מסודר ובטוח, סוגי תספורות והתאמת טיפול, שירות מקצועי ומותגים מובילים.
- תהליך טיפוח מסודר: אבחון פרווה וקשרים, רחצה מקצועית, ייבוש והברשה, תספורת וגימור, ואז הנחיות לבית לשמירה על הפרווה בין תורים.
- סוגי טיפול: תספורת גזע, תספורת ביתית, דילול פרווה מקצועי, מריטה לשיער זיפי, טיפול תומך באלופציה X, וטיפוח ראשוני לגורים.
- שירות ומותגים: העבודה מבוססת על טיפול רגוע, מוצרים מקצועיים, התאמה לסוג הפרווה והעור, ושמירה על תוצאה נקייה ובריאה. אם לקוח מבקש לראות עבודות, הפני אותו בעדינות לאינסטגרם או בקשי לעבור לוואטסאפ.
- אל תזרקי את כל הידע בבת אחת. התנהגי כיועצת פרימיום: עני לפי הצורך, קצר, ורק אחרי שהלקוח פתח את הנושא.

טון:
עברית טבעית, קצר, חם, ישיר, כמו מזכירה אמיתית בוואטסאפ.

מצב ליד נוכחי:
- טלפון: ${leadState.customerPhone || "חסר"}
- שם: ${leadState.fullName || "חסר"}
- סוג / גזע: ${leadState.dogBreed || "חסר"}
- גיל: ${leadState.dogAge || "חסר"}
- משקל: ${leadState.estimatedWeight || "חסר"}
- תספורת אחרונה: ${leadState.lastGroom || "חסר"}
- קשרים: ${leadState.hasMats || "חסר"}
- רגוע בטיפול: ${leadState.isCalm || "חסר"}
- תמונה: ${leadState.hasPhoto ? "יש" : "אין"}
- מועד רצוי: ${leadState.preferredSlot || "חסר"}
- חסר עכשיו: ${missing.length ? missing.join(", ") : "לא חסר מידע בסיסי"}
- nextAction פנימי: ${nextAction}
${academyContext}

החזירי JSON בלבד, בלי markdown:
{
  "reply": "הטקסט ללקוח",
  "updatedLeadState": {},
  "nextAction": "collect_info | ask_photo | quote_range | offer_booking | human_review",
  "confidence": 0.0,
  "shouldEscalateToOrtal": false
}
אם confidence מתחת 0.65, אל תעני נחרץ. שאלי שאלה קצרה להבהרה.
`.trim();
}

function generateDemoConversationReply(message, source = "") {
  const text = String(message || "").toLowerCase();
  if (/(מה שלומך|מה קורה|מה נשמע|היי|שלום|ערב טוב|בוקר טוב|אהלן)/.test(text) && text.length < 18) {
    if (source === "academy-screen") {
      return "מעולה, מה נשמע?? איך אני יכולה לעזור לגבי הלימודים או הקורסים באקדמיה של אורטל? 🎓";
    }
    return "מעולה, מה נשמע?? איך אני יכולה לעזור לכם ולכלב שלכם היום? 😊";
  }
  if (/דוברמן|doberman|קצר פרווה|דלמטי|בוקסר|ויסלה|נשירה/.test(text)) {
    return `וואו, דוברמן! גזע מדהים 🙂 לכלבים קצרי פרווה הטיפול מתמקד בהוצאת שיער מת בזמן נשירה, רחצה מקצועית, ייבוש, ניקוי אוזניים וגזירת ציפורניים. גם כאן אורטל לא עושה חצי עבודה, אלא מקצה חלון אישי ורגוע לכלב.

העלות היא בדרך כלל 170-180 ₪ לשעת עבודה, לפי מצב הפרווה בפועל.

כדי לסגור תור צריך 3 תמונות: צד, פנים ותמונה בעמידה. שריון מקום נעשה עם מקדמת ביטחון של 200 ₪ שמקוזזת מהמחיר הסופי. אפשר לשלוח את התמונות בוואטסאפ כאן: ${getWafflesWhatsappUrl("היי אורטל, אשמח לשלוח תמונות ולבדוק תור לדוברמן שלי 🐶")}`;
  }
  if (/עבודות|תמונות|גלריה|לפני ואחרי|דוגמאות/.test(text)) {
    return "בטח 🙂 יש לאורטל עבודות אמיתיות מהמספרה, כולל לפני/אחרי. הכי נוח לשלוח לך דוגמאות שמתאימות לסוג הכלב שלך. איזה גזע הכלב?";
  }
  if (/תהליך|איך עובד|מה כולל|כולל בטיפול|שלבים/.test(text)) {
    return "הטיפול בנוי מסודר: אבחון פרווה וקשרים, רחצה מקצועית, ייבוש והברשה, תספורת וגימור, ואז הנחיות לבית. איזה סוג כלב זה?";
  }
  if (/סוגי תספורות|תספורת גזע|תספורת ביתית|דילול|התאמת טיפול/.test(text)) {
    return "אורטל מתאימה את הטיפול לפי הגזע, מבנה הגוף, מצב הפרווה והבקשה שלך: תספורת גזע, תספורת ביתית, דילול, מריטה או טיפול עדין לגורים. איזה סוג כלב יש לך?";
  }
  if (/מותגים|מוצרים|שמפו|חומרים|מקצועי/.test(text)) {
    return "אורטל עובדת עם מוצרים מקצועיים שמתאימים לסוג הפרווה והעור, כדי שהטיפול יהיה נקי, רגוע ובריא לכלב. יש לכלב רגישות בעור או פרווה מיוחדת?";
  }
  if (/bsd|אלופציה|alopecia|עור שחור|השחרת עור|קרחות|קרחת|נשירה קשה|שיקום פרווה/.test(text)) {
    return `מבינה. בפומרניאן/שפיץ זה יכול להתאים למקרים של דילול פרווה או BSD/אלופציה X, אבל קודם חשוב לשלול עניין הורמונלי אצל וטרינר כמו קושינג או תת פעילות בלוטת התריס.

אורטל מתמחה בשיקום פרווה ועור, והטיפול דורש עקביות ולא טיפול חד פעמי. כדי לבדוק התאמה לתהליך, צריך 3 תמונות: צד, פנים ותמונה בעמידה, ואם יש אז גם צילום קרוב של האזור הדליל.

שלחו את התמונות בוואטסאפ ואורטל תוכל לכוון לתוכנית ולתור מתאים. יהיה בסדר, אנחנו איתכם ❤️ שריון מקום נעשה עם מקדמת ביטחון של 200 ₪: ${getWafflesWhatsappUrl("היי אורטל, אשמח לשלוח תמונות ולבדוק שיקום פרווה לכלב שלי 🐶")}`;
  }
  if (/אקדמיה|לימודים|קורס|הכשרה|ללמוד|ספרות כלבים/.test(text)) {
    return "בשמחה 🙂 באקדמיה של אורטל לומדים עבודה מעשית על היגיינה, קשרים, פודלים/פומרניאן, מריטה, שיקום פרווה וניהול עסק פרימיום. יש לך ניסיון קודם בתחום?";
  }
  if (/מריטה|hand stripping|סטריפינג|stripping/.test(text)) {
    return "כן, אורטל עושה מריטה ידנית לגזעים שמתאימים לזה. זה טיפול מדויק וארוך ששומר על המרקם והצבע של הפרווה. איזה גזע הכלב?";
  }
  if (/פודל|קשרים קשים|מוזנח|מוזנחת|מפחד|נושך|לא נותן/.test(text)) {
    return `פודלים וכלבי פרווה מורכבת הם בדיוק המקום שבו העבודה של אורטל מורגשת. הטיפול כולל פתיחת קשרים בזהירות, רחצה מקצועית, ייבוש, עיצוב תספורת לפי הגזע או הבקשה, ניקוי אוזניים וגזירת ציפורניים.

ב-WAFFLES לא מגלחים ורצים, אלא מקצים זמן עבודה אמיתי לפי מצב הפרווה. כדי שאורטל תעריך נכון צריך 3 תמונות: צד, פנים ותמונה בעמידה. אפשר לשלוח בוואטסאפ ונמשיך לשריון תור עם מקדמת ביטחון של 200 ₪: ${getWafflesWhatsappUrl("היי אורטל, אשמח לשלוח תמונות ולבדוק תור לפודל שלי 🐶")}`;
  }
  if (/כמה עולה|מחיר|עלות|כמה זה/.test(text)) {
    return "היי 🙂 בשמחה. זה תלוי בסוג הכלב ובמצב הפרווה. איזה סוג כלב זה בערך?";
  }
  if (/(שיצו|שי צו|פומרניאן|שפיץ|פודל|מלטז|יורקשייר|לברדור|גולדן|פקינז|בישון)/.test(text)) {
    return "מעולה. בן כמה הוא בערך וכמה הוא שוקל?";
  }
  if (/(קשרים|קשר|בלי קשרים|אין קשרים|הרבה קשרים)/.test(text)) {
    return "כדי שאורטל תיתן הערכת מחיר אמיתית ולא סתם תזרוק מספר, צריך 3 תמונות: צד, פנים ותמונה בעמידה. אפשר לשלוח אותן בוואטסאפ כאן: " + getWafflesWhatsappUrl("היי אורטל, אשמח לשלוח תמונות ולבדוק תור לכלב שלי 🐶");
  }
  if (/(?:בן|בת)\s*[\d.]+|שנה|שנתיים|חודש|חודשים|\d{1,2}\s*(?:קילו|קג|ק\"ג|kg)/.test(text)) {
    return "סבבה. מתי הייתה התספורת האחרונה שלו, ויש לו קשרים בפרווה?";
  }
  if (/סגור|לקבוע|תור|מתאים|יאללה|רוצה|איך ממשיכים|נשמע טוב|אפשר/.test(text)) {
    return `מעולה 🙂 כדי שאורטל תבדוק תור בצורה רצינית, תכין 3 תמונות: צד, פנים ותמונה בעמידה. בגלל שהיא מקצה לכל כלב חלון אישי של 1-4 שעות, שריון מקום נעשה עם מקדמת ביטחון של 200 ₪. שלח את התמונות בוואטסאפ ונמשיך משם לקישור תיאום מאובטח: ${getWafflesWhatsappUrl("היי אורטל, אשמח לשלוח תמונות ולבדוק תור לכלב שלי 🐶")}`;
  }
  return "היי 🙂 בשמחה. איזה סוג כלב זה בערך?";
}

async function generateConversationReply(record, leadState, message, nextAction, source = "") {
  const cleanMessage = sanitizeMultiline(message, 2000);
  const fallbackResult = buildRuleBasedConversationResult(leadState, cleanMessage, source);
  if (config.aiDemoMode) {
    return {
      ...fallbackResult,
      reply: appendWebsiteAiRedirect(fallbackResult.reply, source)
    };
  }
  if (!config.openAiApiKey) {
    return {
      ...fallbackResult,
      reply: appendWebsiteAiRedirect(fallbackResult.reply, source)
    };
  }

  const history = record.messages.slice(-8);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openAiModel,
      messages: [
        { role: "system", content: buildConversationSystemPrompt(leadState, nextAction, source) },
        ...history,
        { role: "user", content: cleanMessage }
      ],
      response_format: { type: "json_object" },
      max_tokens: 420,
      temperature: 0.55
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (/insufficient_quota/i.test(errorText)) {
      return {
        ...fallbackResult,
        reply: appendWebsiteAiRedirect(fallbackResult.reply, source)
      };
    }
    throw new Error(`openai-failed: ${errorText}`);
  }

  const json = await response.json();
  try {
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}");
    const confidence = Number(parsed.confidence);
    const reply = sanitizeMultiline(parsed.reply || "", 1600);
    const result = {
      reply: reply || fallbackResult.reply,
      updatedLeadState: {
        ...leadState,
        ...(isPlainObject(parsed.updatedLeadState) ? parsed.updatedLeadState : {})
      },
      nextAction: parsed.nextAction || fallbackResult.nextAction,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : fallbackResult.confidence,
      shouldEscalateToOrtal: Boolean(parsed.shouldEscalateToOrtal)
    };
    if (result.confidence < 0.65) {
      result.reply = "אני לא רוצה להטעות אותך, צריך עוד פרט קטן כדי לדייק.\nאיזה סוג כלב זה בערך?";
      result.nextAction = "collect_info";
    }
    result.reply = appendWebsiteAiRedirect(result.reply, source);
    return result;
  } catch (_error) {
    return {
      ...fallbackResult,
      reply: appendWebsiteAiRedirect(fallbackResult.reply, source)
    };
  }
}

function hasSensitiveOrUncertainSignal(message, leadState = {}) {
  const text = `${message || ""} ${leadState.notes || ""} ${leadState.coatCondition || ""} ${leadState.behavior || ""}`.toLowerCase();
  return /(פצע|דימום|דם|דלקת|כאב|כואב|גירוי|עור אדום|בעיית עור|קרחות|קרחת|אלופציה|bsd|טפיל|פרעוש|קרציה|נושך|נשך|תוקפ|מפחד מאוד|חרדה|לא נותן|תלונה|כועס|אכזבה|לא מרוצה|מחיר סופי|כמה בדיוק|בטוח\?|לא בטוח)/i.test(text);
}

function buildBrainConversationSystemPrompt(leadState, nextAction, source = "") {
  const brain = loadAiBrain();
  const missing = getMissingLeadFields(leadState);
  return `
את העוזרת החכמה של Waffel's Dog Grooming.
את עונה בעברית, RTL טבעי, חם ומקצועי.
את משתמשת בידע ובהוראות מתוך קבצי ai-brain בלבד.

כללי חובה:
- לא להמציא מחירים ולא לתת מחיר סופי.
- אם שואלים מחיר: להסביר שהמחיר תלוי בגודל הכלב, סוג ומצב הפרווה והשירות, ושאורטל תאשר מחיר.
- לא לתת ייעוץ רפואי, אבחנה רפואית או טיפול רפואי.
- במקרים רפואיים, פחד קיצוני, נשיכות, קשרים קשים, תלונה, מחיר סופי או אי ודאות: להסלים לאורטל.
- לא לשאול את כל הפרטים בבת אחת. לשאול שאלה אחת או שתיים בלבד.
- לא לומר שאת OpenAI או AI. אפשר לומר "אני אעביר לאורטל" כשצריך.
- תשובה ללקוח תהיה קצרה, נעימה ומעשית.

מטרת השיחה:
1. לענות לפי המוח העסקי.
2. לאסוף ליד בהדרגה.
3. כאשר יש לפחות phone + dog_name + service_requested, לסמן qualified=true.
4. אם יש מקרה רגיש או לא בטוח, לסמן escalation_required=true ולהסביר בקצרה escalation_reason.
5. אחרי ליד בשל או רגיש עם טלפון, לומר שאורטל תבדוק את הפרטים ותחזור.

מצב ליד נוכחי:
${JSON.stringify({
  customer_name: leadState.customer_name || leadState.fullName || "",
  phone: leadState.phone || leadState.customerPhone || "",
  dog_name: leadState.dog_name || "",
  breed: leadState.breed || leadState.dogBreed || "",
  service_requested: leadState.service_requested || "",
  notes: leadState.notes || leadState.coatCondition || leadState.behavior || "",
  missing_fields: missing,
  nextAction,
  source
}, null, 2)}

החזר JSON בלבד, בלי markdown:
{
  "reply": "תשובה קצרה ללקוח בעברית",
  "updatedLeadState": {
    "customer_name": "",
    "phone": "",
    "dog_name": "",
    "breed": "",
    "service_requested": "",
    "notes": "",
    "escalation_required": false,
    "escalation_reason": ""
  },
  "qualified": false,
  "nextAction": "collect_info | save_lead | escalate_to_ortal",
  "confidence": 0.0,
  "shouldEscalateToOrtal": false
}

אם הלקוח סיפק פרט חדש, עדכן אותו ב-updatedLeadState והשאר פרטים קיימים.
אם חסר טלפון, אל תסמן qualified=true.

--- ai-brain ---
${brain.content}
`.trim();
}

function buildSafeConversationFallback(leadState, message, source = "") {
  const next = normalizeLeadState(leadState);
  const text = String(message || "");
  const sensitive = hasSensitiveOrUncertainSignal(text, next);
  if (sensitive) {
    next.escalation_required = true;
    next.escalation_reason = "מקרה רגיש או לא ודאי שדורש בדיקה של אורטל";
  }
  const missing = getMissingLeadFields(next);
  let reply = "בשמחה. כדי שאורטל תוכל לכוון אותך הכי מדויק ונעים לכלב שלך, אפשר לשאול איך קוראים לכלב ומה השירות שחשבת עליו?";
  if (sensitive) {
    reply = "כדי לא להטעות אותך, אני מעביר/ה את זה לאורטל. אם יש כאב, פצע, דימום או גירוי חריג, חשוב להתייעץ גם עם וטרינר. אפשר להשאיר טלפון לחזרה?";
  } else if (isQualifiedLeadState(next)) {
    reply = "תודה, הפרטים נשמרו. אורטל תעבור עליהם ותחזור אליך בצורה מסודרת.";
  } else if (!next.service_requested) {
    reply = "בשמחה 🙂 מה תרצו עבור הכלב - תספורת, מקלחת, סידור פרווה או שאלה לפני תיאום?";
  } else if (!next.dog_name) {
    reply = "מעולה. איך קוראים לכלב?";
  } else if (!next.phone && !next.customerPhone) {
    reply = "תודה. מה מספר הטלפון שאורטל תוכל לחזור אליו?";
  } else if (missing.length) {
    reply = "תודה, זה עוזר. יש עוד משהו שחשוב שאורטל תדע, כמו גזע, גודל, קשרים או רגישות?";
  } else {
    reply = "תודה, הפרטים נשמרו. אורטל תעבור עליהם ותחזור אליך בצורה מסודרת.";
  }
  return {
    reply,
    updatedLeadState: next,
    nextAction: sensitive ? "escalate_to_ortal" : "collect_info",
    confidence: 0.72,
    shouldEscalateToOrtal: sensitive
  };
}

function normalizeAiLeadUpdate(baseLeadState, update = {}) {
  const merged = normalizeLeadState({ ...baseLeadState, ...(isPlainObject(update) ? update : {}) });
  merged.customerPhone = normalizePhone(merged.phone || merged.customerPhone || "");
  merged.phone = merged.customerPhone;
  merged.customer_name = sanitizeText(merged.customer_name || merged.fullName || "", 100);
  merged.fullName = merged.fullName || merged.customer_name;
  merged.dog_name = sanitizeText(merged.dog_name || "", 80);
  merged.breed = sanitizeText(merged.breed || merged.dogBreed || "", 80);
  merged.dogBreed = merged.dogBreed || merged.breed;
  merged.service_requested = sanitizeText(merged.service_requested || "", 120);
  merged.notes = sanitizeMultiline(merged.notes || "", 1200);
  merged.escalation_required = Boolean(merged.escalation_required);
  merged.escalation_reason = sanitizeText(merged.escalation_reason || "", 200);
  return merged;
}

async function generateConversationReply(record, leadState, message, nextAction, source = "") {
  const cleanMessage = sanitizeMultiline(message, 2000);
  const fallbackResult = buildSafeConversationFallback(leadState, cleanMessage, source);

  if (!config.openAiApiKey || config.aiDemoMode) {
    return fallbackResult;
  }

  const history = record.messages.slice(-8);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.openAiModel,
        messages: [
          { role: "system", content: buildBrainConversationSystemPrompt(leadState, nextAction, source) },
          ...history,
          { role: "user", content: cleanMessage }
        ],
        response_format: { type: "json_object" },
        max_tokens: 520,
        temperature: 0.35
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI conversation failed:", errorText);
      return fallbackResult;
    }

    const json = await response.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}");
    const confidence = Number(parsed.confidence);
    const updatedLeadState = normalizeAiLeadUpdate(leadState, parsed.updatedLeadState || {});
    if (hasSensitiveOrUncertainSignal(cleanMessage, updatedLeadState)) {
      updatedLeadState.escalation_required = true;
      updatedLeadState.escalation_reason = updatedLeadState.escalation_reason || "זוהה מקרה רגיש או לא ודאי";
    }
    const safeReply = sanitizeMultiline(parsed.reply || "", 1600);
    return {
      reply: safeReply || fallbackResult.reply,
      updatedLeadState,
      nextAction: parsed.nextAction || (updatedLeadState.escalation_required ? "escalate_to_ortal" : "collect_info"),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.75,
      shouldEscalateToOrtal: Boolean(parsed.shouldEscalateToOrtal || updatedLeadState.escalation_required)
    };
  } catch (error) {
    console.error("AI conversation parse failed:", String(error.message || error));
    return fallbackResult;
  }
}

function isQualifiedLeadState(leadState) {
  return Boolean((leadState.phone || leadState.customerPhone) && leadState.dog_name && leadState.service_requested);
}

function buildLeadPayloadFromState(leadState, source = "") {
  return sanitizeLeadInput({
    customer_name: leadState.customer_name || leadState.fullName || "",
    phone: leadState.phone || leadState.customerPhone || "",
    dog_name: leadState.dog_name || "",
    breed: leadState.breed || leadState.dogBreed || "",
    service_requested: leadState.service_requested || "",
    notes: [
      leadState.notes || "",
      leadState.escalation_required ? `נדרשת הסלמה לאורטל: ${leadState.escalation_reason || "מקרה רגיש / לא ודאי"}` : ""
    ].filter(Boolean).join("\n"),
    source: source || "website_ai_chat"
  });
}

async function saveQualifiedLeadIfNeeded(record, leadState, source = "") {
  const normalized = normalizeLeadState(leadState);
  if (normalized.savedLeadId || !isQualifiedLeadState(normalized)) {
    return { saved: false, lead: null };
  }
  const input = buildLeadPayloadFromState(normalized, source);
  const validation = validateLead(input);
  if (!validation.valid) return { saved: false, lead: null };

  const leadsDatabase = readLeadsDatabase();
  let lead = normalizeLead({
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  });
  leadsDatabase.leads.push(lead);
  writeLeadsDatabase(leadsDatabase);
  try {
    const mondayResult = await syncLeadToMonday(lead);
    lead = normalizeLead({
      ...lead,
      monday_item_id: mondayResult.itemId || "",
      monday_sync_status: mondayResult.skipped ? "skipped" : "synced",
      monday_sync_error: mondayResult.reason || "",
      updatedAt: new Date().toISOString()
    });
  } catch (mondayError) {
    console.error("Monday lead sync failed", {
      leadId: lead.id,
      error: String(mondayError.message || mondayError)
    });
    lead = normalizeLead({
      ...lead,
      monday_sync_status: "failed",
      monday_sync_error: String(mondayError.message || mondayError).slice(0, 240),
      updatedAt: new Date().toISOString()
    });
  }
  leadsDatabase.leads[leadsDatabase.leads.length - 1] = lead;
  writeLeadsDatabase(leadsDatabase);
  normalized.savedLeadId = lead.id;
  record.leadState = normalized;
  return { saved: true, lead };
}

async function handleConversationMessage(input) {
  const channel = input.channel === "whatsapp" ? "whatsapp" : "website";
  const conversationId = sanitizeMultiline(input.conversationId || input.customerPhone || crypto.randomUUID(), 120);
  const message = sanitizeMultiline(input.message || "", 2000);
  if (!message) {
    const error = new Error("message-required");
    error.code = "message-required";
    throw error;
  }

  const record = getConversationRecord(conversationId, input.customerPhone || "");
  const leadState = inferLeadStateFromText(record.leadState, message);
  const nextAction = getNextConversationAction(leadState, message);
  const conversationResult = await generateConversationReply(record, leadState, message, nextAction, input.source || "");
  const reply = conversationResult.reply;
  const updatedLeadState = normalizeLeadState({
    ...leadState,
    ...(conversationResult.updatedLeadState || {}),
    missingFields: getMissingLeadFields(conversationResult.updatedLeadState || leadState),
    conversationStage: getConversationStage(conversationResult.updatedLeadState || leadState, message),
    leadScore: calculateLeadScore(conversationResult.updatedLeadState || leadState),
    leadStatus: calculateLeadScore(conversationResult.updatedLeadState || leadState) >= 70
      ? "qualified"
      : (calculateLeadScore(conversationResult.updatedLeadState || leadState) >= 35 ? "collecting" : "new")
  }, conversationId, input.customerPhone || "");

  updatedLeadState.lastBotMessage = reply;
  updatedLeadState.updatedAt = new Date().toISOString();
  record.leadState = updatedLeadState;
  const leadSaveResult = await saveQualifiedLeadIfNeeded(record, updatedLeadState, input.source || "website_ai_chat");
  if (leadSaveResult.saved) {
    updatedLeadState.savedLeadId = leadSaveResult.lead.id;
    record.leadState = updatedLeadState;
  }
  record.messages = [
    ...record.messages,
    { role: "user", content: message },
    { role: "assistant", content: reply }
  ].slice(-20);
  conversationStore.set(conversationId, record);

  return {
    reply,
    leadState: updatedLeadState,
    nextAction: conversationResult.nextAction || nextAction,
    confidence: conversationResult.confidence,
    shouldEscalateToOrtal: conversationResult.shouldEscalateToOrtal,
    leadSaved: leadSaveResult.saved,
    leadId: leadSaveResult.lead ? leadSaveResult.lead.id : updatedLeadState.savedLeadId,
    channel,
    conversationId
  };
}

function extractCloudWebhookMessage(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message || !message.from) return null;
  if (message.text?.body) {
    return { from: message.from, text: message.text.body };
  }
  if (message.image?.id) {
    return { from: message.from, text: "הלקוח שלח תמונה עדכנית של הכלב", hasPhoto: true };
  }
  return { from: message.from, text: "" };
}

async function sendWhatsAppCloudMessage(to, text) {
  if (!config.whatsappToken || !config.whatsappPhoneNumberId) {
    const error = new Error("whatsapp-cloud-not-configured");
    error.code = "whatsapp-cloud-not-configured";
    throw error;
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${config.whatsappPhoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.whatsappToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`whatsapp-cloud-send-failed: ${errorText}`);
  }
}

async function handleApi(request, response, pathname, searchParams) {
  const database = readDatabase();

  if (request.method === "GET" && pathname === "/api/health") {
    return sendJson(request, response, 200, {
      ok: true,
      totalBookings: database.bookings.length,
      googleCalendarConfigured: isGoogleConfigured(),
      stripeConfigured: isStripeConfigured(),
      openAiConfigured: Boolean(config.openAiApiKey),
      aiDemoMode: config.aiDemoMode,
      whatsappCloudConfigured: Boolean(config.whatsappToken && config.whatsappPhoneNumberId && config.whatsappVerifyToken)
    });
  }

  if (request.method === "POST" && pathname === "/api/admin/login") {
    const body = await readJsonBody(request);
    const password = String(body.password || "").trim();
    if (!config.adminPasswordHash) {
      return sendJson(request, response, 503, { ok: false, error: "admin-password-not-configured" });
    }
    if (!verifyPassword(password, config.adminPasswordHash)) {
      return sendJson(request, response, 403, { ok: false, error: "invalid-admin-password" });
    }
    return sendJson(request, response, 200, {
      ok: true,
      token: createAdminSession(),
      expiresInMs: config.adminSessionTtlMs
    });
  }

  if (request.method === "GET" && pathname === "/api/admin/session") {
    return sendJson(request, response, 200, { ok: true, authenticated: isValidAdminSession(request) });
  }

  if (request.method === "POST" && pathname === "/api/chat") {
    try {
      const body = await readJsonBody(request);
      const message = sanitizeMultiline(body.message || "", 2000);
      const inputState = body.state && typeof body.state === "object" && !Array.isArray(body.state) ? body.state : {};
      let result = null;
      if (config.openAiApiKey) {
        const aiResult = await aiChatBrain.buildAIChatResponse({
          message,
          state: inputState,
          apiKey: config.openAiApiKey,
          model: config.openAiModel
        });
        if (aiResult) {
          result = chatGuardrails.applyChatGuardrails({ result: aiResult, message, state: inputState });
        }
      }
      if (!result) {
        result = chatBrain.buildChatResponse({ message, state: inputState });
      }
      const stateAfterPatch = {
        ...inputState,
        ...(result.state_patch || {})
      };
      const specialContext = ["appointment", "human_handoff"].includes(stateAfterPatch.conversation_stage);
      const leadReady = Boolean(
        stateAfterPatch.phone
        && stateAfterPatch.service_requested
        && (stateAfterPatch.dog_name || stateAfterPatch.breed || specialContext)
      );
      const explicitConfirmation = /^(כן|מאשר|מאשרת|שלח|אפשר לשלוח)[.!?]?$/.test(message);
      return sendJson(request, response, 200, {
        reply: sanitizeMultiline(result.reply || "", 1800) || "כרגע המענה החכם לא מוגדר, אבל אפשר להשאיר פרטים ואורטל תחזור אליך.",
        state_patch: result.state_patch || {},
        intent: result.intent || "other",
        confidence: result.confidence || "low",
        lead_ready: leadReady,
        should_save_lead: Boolean(result.should_save_lead && leadReady && explicitConfirmation),
        escalate_to_ortal: Boolean(result.escalate_to_ortal),
        next_question: sanitizeMultiline(result.next_question || "", 400),
        notes: sanitizeMultiline(result.notes || "", 800)
      });
    } catch (error) {
      return sendJson(request, response, 500, {
        reply: "כרגע המענה החכם לא מוגדר, אבל אפשר להשאיר פרטים ואורטל תחזור אליך.",
        state_patch: {},
        intent: "other",
        lead_ready: false,
        should_save_lead: false,
        escalate_to_ortal: true,
        next_question: "",
        error: "chat-failed"
      });
    }
  }

  if (request.method === "POST" && pathname === "/api/conversation/message") {
    try {
      const body = await readJsonBody(request);
      const result = await handleConversationMessage({
        channel: body.channel,
        conversationId: body.conversationId,
        customerPhone: body.customerPhone,
        message: body.message,
        source: body.source
      });
      return sendJson(request, response, 200, {
        reply: result.reply,
        leadState: result.leadState,
        nextAction: result.nextAction,
        confidence: result.confidence,
        shouldEscalateToOrtal: result.shouldEscalateToOrtal,
        leadSaved: result.leadSaved,
        leadId: result.leadId
      });
    } catch (error) {
      const status = error.code === "message-required" ? 400 : 500;
      return sendJson(request, response, status, { ok: false, error: error.code || "conversation-failed", detail: String(error.message || error) });
    }
  }

  if (request.method === "POST" && pathname === "/api/website-chat") {
    try {
      const body = await readJsonBody(request);
      const conversationId = body.conversationId || `website-${crypto.randomUUID()}`;
      const result = await handleConversationMessage({
        channel: "website",
        conversationId,
        customerPhone: body.customerPhone || body.phone || "",
        message: body.message,
        source: body.source
      });
      return sendJson(request, response, 200, {
        ok: true,
        conversationId: result.conversationId,
        reply: result.reply,
        leadState: result.leadState,
        nextAction: result.nextAction,
        confidence: result.confidence,
        shouldEscalateToOrtal: result.shouldEscalateToOrtal,
        leadSaved: result.leadSaved,
        leadId: result.leadId
      });
    } catch (error) {
      const status = error.code === "message-required" ? 400 : 500;
      return sendJson(request, response, status, { ok: false, error: error.code || "website-chat-failed", detail: String(error.message || error) });
    }
  }

  if (request.method === "GET" && pathname === "/api/whatsapp/webhook") {
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === config.whatsappVerifyToken) {
      return sendText(request, response, 200, challenge || "");
    }
    return sendText(request, response, 403, "Forbidden");
  }

  if (request.method === "POST" && pathname === "/api/whatsapp/webhook") {
    try {
      const body = await readJsonBody(request);
      const incoming = extractCloudWebhookMessage(body);
      if (!incoming || !incoming.from || !incoming.text) {
        return sendJson(request, response, 200, { ok: true, ignored: true });
      }
      const result = await handleConversationMessage({
        channel: "whatsapp",
        conversationId: incoming.from,
        customerPhone: incoming.from,
        message: incoming.text
      });
      if (result.reply) {
        await sendWhatsAppCloudMessage(incoming.from, result.reply);
      }
      return sendJson(request, response, 200, { ok: true });
    } catch (error) {
      console.error("WhatsApp Cloud webhook failed:", error);
      return sendJson(request, response, 500, { ok: false, error: error.code || "whatsapp-webhook-failed", detail: String(error.message || error) });
    }
  }

  if (request.method === "GET" && pathname === "/api/whatsapp/status") {
    if (!isValidAdminSession(request)) {
      return sendJson(request, response, 200, getPublicWhatsappStatus());
    }
    return sendJson(request, response, 200, getWhatsappStatus());
  }

  if (request.method === "POST" && pathname === "/api/whatsapp/connect") {
    if (!requireAdmin(request, response)) return true;
    try {
      return sendJson(request, response, 200, await startWhatsappConnection());
    } catch (error) {
      return sendJson(request, response, 500, { ok: false, error: "whatsapp-connect-failed", detail: String(error.message || error) });
    }
  }

  if (request.method === "POST" && pathname === "/api/whatsapp/disconnect") {
    if (!requireAdmin(request, response)) return true;
    const body = await readJsonBody(request);
    return sendJson(request, response, 200, await stopWhatsappConnection(Boolean(body.logout)));
  }

  if (request.method === "GET" && pathname === "/api/whatsapp/messages") {
    if (!requireAdmin(request, response)) return true;
    return sendJson(request, response, 200, { ok: true, items: whatsappState.recentMessages });
  }

  if (request.method === "POST" && pathname === "/api/whatsapp/send") {
    if (!requireAdmin(request, response)) return true;
    const body = await readJsonBody(request);
    try {
      return sendJson(request, response, 200, await sendWhatsappMessage(body.phone, body.message));
    } catch (error) {
      const status = ["whatsapp-not-connected", "invalid-whatsapp-message"].includes(error.code) ? 400 : 500;
      return sendJson(request, response, status, { ok: false, error: error.code || "whatsapp-send-failed", detail: String(error.message || error) });
    }
  }

  if (request.method === "GET" && pathname === "/api/booking-config") {
    return sendJson(request, response, 200, getBookingConfigResponse());
  }

  if (request.method === "GET" && pathname === "/api/content") {
    return sendJson(request, response, 200, readSiteContent());
  }

  if (request.method === "POST" && pathname === "/api/content") {
    if (!requireAdmin(request, response)) return true;
    try {
      const input = await readJsonBody(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return sendJson(request, response, 400, { ok: false, error: "payload is missing" });
      }
      const payload = normalizeContentPayload(input);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return sendJson(request, response, 400, { ok: false, error: "payload is missing" });
      }
      if (Object.prototype.hasOwnProperty.call(payload, "content") && payload.content == null && Object.keys(payload).length === 1) {
        return sendJson(request, response, 400, { ok: false, error: "payload is missing" });
      }
      const existingContent = readSiteContent().content || {};
      const mergedContent = mergeSiteContent(existingContent, payload);
      const updatedAt = writeSiteContent(mergedContent);
      return sendJson(request, response, 200, { ok: true, success: true, updatedAt });
    } catch (error) {
      console.error("POST /api/content failed:", error);
      return sendJson(request, response, 500, { ok: false, error: String(error.message || error) });
    }
  }

  if (request.method === "POST" && pathname === "/api/upload") {
    if (!requireAdmin(request, response)) return true;
    try {
      const input = await readJsonBody(request);
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return sendJson(request, response, 400, { error: "invalid-upload" });
      }
      return sendJson(request, response, 200, saveUploadedDataUrl(input));
    } catch (error) {
      const status = ["invalid-data-url", "unsupported-file-type", "upload-too-large"].includes(error.code) ? 400 : 500;
      return sendJson(request, response, status, { error: error.code || "upload-failed" });
    }
  }

  if (request.method === "GET" && pathname === "/api/leads") {
    if (!isValidAdminSession(request) && !allowLocalDevAdmin(request)) {
      return sendJson(request, response, 401, { ok: false, error: "admin-auth-required" });
    }
    const leadsDatabase = readLeadsDatabase();
    return sendJson(request, response, 200, { ok: true, items: leadsDatabase.leads });
  }

  if (request.method === "POST" && pathname === "/api/leads") {
    try {
      const input = sanitizeLeadInput(await readJsonBody(request));
      const validation = validateLead(input);
      if (!validation.valid) {
        return sendJson(request, response, 400, { ok: false, error: "validation-failed", fields: validation.errors });
      }

      const leadsDatabase = readLeadsDatabase();
      let lead = normalizeLead({
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      });
      leadsDatabase.leads.push(lead);
      writeLeadsDatabase(leadsDatabase);

      try {
        const mondayResult = await syncLeadToMonday(lead);
        lead = normalizeLead({
          ...lead,
          monday_item_id: mondayResult.itemId || "",
          monday_sync_status: mondayResult.skipped ? "skipped" : "synced",
          monday_sync_error: mondayResult.reason || "",
          updatedAt: new Date().toISOString()
        });
      } catch (mondayError) {
        console.error("Monday lead sync failed", {
          leadId: lead.id,
          error: String(mondayError.message || mondayError)
        });
        lead = normalizeLead({
          ...lead,
          monday_sync_status: "failed",
          monday_sync_error: String(mondayError.message || mondayError).slice(0, 240),
          updatedAt: new Date().toISOString()
        });
      }
      leadsDatabase.leads[leadsDatabase.leads.length - 1] = lead;
      writeLeadsDatabase(leadsDatabase);

      return sendJson(request, response, 201, { ok: true, lead });
    } catch (error) {
      return sendJson(request, response, 400, { ok: false, error: "invalid-lead-payload", detail: String(error.message || error) });
    }
  }

  const leadPatchMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (request.method === "PATCH" && leadPatchMatch) {
    if (!isValidAdminSession(request) && !allowLocalDevAdmin(request)) {
      return sendJson(request, response, 401, { ok: false, error: "admin-auth-required" });
    }
    const leadId = decodeURIComponent(leadPatchMatch[1]);
    const patch = sanitizeLeadPatch(await readJsonBody(request));
    if (!Object.keys(patch).length) {
      return sendJson(request, response, 400, { ok: false, error: "empty-or-invalid-patch" });
    }
    const lead = updateLeadById(leadId, patch);
    if (!lead) return sendJson(request, response, 404, { ok: false, error: "lead-not-found" });
    return sendJson(request, response, 200, { ok: true, lead });
  }

  const leadArchiveMatch = pathname.match(/^\/api\/leads\/([^/]+)\/archive$/);
  if (request.method === "PATCH" && leadArchiveMatch) {
    if (!isValidAdminSession(request) && !allowLocalDevAdmin(request)) {
      return sendJson(request, response, 401, { ok: false, error: "admin-auth-required" });
    }
    const leadId = decodeURIComponent(leadArchiveMatch[1]);
    const lead = updateLeadById(leadId, { status: "archived", next_action: "סגור כלא רלוונטי / ארכיון" });
    if (!lead) return sendJson(request, response, 404, { ok: false, error: "lead-not-found" });
    return sendJson(request, response, 200, { ok: true, lead });
  }

  if (request.method === "GET" && pathname === "/api/bookings/export.csv") {
    if (!requireAdmin(request, response)) return true;
    const status = searchParams.get("status");
    const items = filterBookingsByStatus(database.bookings, status);
    return sendDownload(request, response, 200, buildBookingsCsv(items), "text/csv; charset=utf-8", "waffels-bookings.csv");
  }

  if (request.method === "GET" && pathname === "/api/bookings/calendar.ics") {
    if (!requireAdmin(request, response)) return true;
    const status = searchParams.get("status");
    const items = filterBookingsByStatus(database.bookings, status || "approved_waiting_deposit,confirmed");
    return sendDownload(request, response, 200, buildBookingsIcs(items), "text/calendar; charset=utf-8", "waffels-calendar.ics");
  }

  if (request.method === "GET" && pathname === "/api/bookings") {
    if (!requireAdmin(request, response)) return true;
    const status = searchParams.get("status");
    return sendJson(request, response, 200, { items: filterBookingsByStatus(database.bookings, status) });
  }

  if (request.method === "GET" && pathname === "/api/bookings/by-token") {
    const token = String(searchParams.get("token") || "").trim();
    if (!token) return sendJson(request, response, 400, { error: "missing-token" });
    const booking = database.bookings.find((item) => item.approvalToken === token);
    if (!booking) return sendJson(request, response, 404, { error: "booking-not-found" });
    return sendJson(request, response, 200, { booking });
  }

  if (request.method === "GET" && pathname === "/api/availability") {
    const date = sanitizeText(searchParams.get("date") || "", 20);
    if (!isValidIsoDate(date)) {
      return sendJson(request, response, 400, { error: "invalid-date" });
    }
    return sendJson(request, response, 200, {
      date,
      workday: isAllowedWorkDay(date),
      slots: getSlotAvailability(database.bookings, date)
    });
  }

  if (request.method === "POST" && pathname === "/api/bookings") {
    if (isRateLimited(request)) {
      return sendJson(request, response, 429, { error: "rate-limited" });
    }
    const input = sanitizeBookingInput(await readJsonBody(request));
    const validation = validateBooking(input);
    if (!validation.valid) {
      return sendJson(request, response, 400, { error: "validation-failed", fields: validation.errors });
    }
    if (hasLockedReservation(database.bookings, input.preferredDate, input.preferredSlot)) {
      return sendJson(request, response, 409, { error: "slot-locked" });
    }
    if (countReservations(database.bookings, input.preferredDate, input.preferredSlot) >= config.slotCapacity) {
      return sendJson(request, response, 409, { error: "slot-taken" });
    }

    const booking = normalizeBooking({
      ...input,
      status: BOOKING_STATUS.PENDING,
      depositStatus: "none",
      depositAmountIls: config.depositAmountIls,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    database.bookings.push(booking);
    writeDatabase(database);

    return sendJson(request, response, 201, {
      booking,
      approvalLink: buildApprovalLink(request, booking),
      ortalWhatsappUrl: buildOrtalWhatsappLink(request, booking),
      message: "׳”׳‘׳§׳©׳” ׳ ׳©׳׳¨׳” ׳‘׳׳¢׳¨׳›׳× ׳•׳׳׳×׳™׳ ׳” ׳׳׳™׳©׳•׳¨ ׳©׳ ׳׳•׳¨׳˜׳."
    });
  }

  if (request.method === "POST" && pathname === "/api/bookings/approve-by-token") {
    const body = await readJsonBody(request);
    const token = sanitizeText(body.token || "", 80);
    const approvalCode = sanitizeText(body.approvalCode || "", 80);
    const booking = database.bookings.find((item) => item.approvalToken === token);
    if (!booking) return sendJson(request, response, 404, { error: "booking-not-found" });
    if (config.adminApprovalCode && approvalCode !== config.adminApprovalCode) {
      return sendJson(request, response, 403, { error: "invalid-approval-code" });
    }
    try {
      const result = await markBookingApproved(request, database, booking);
      return sendJson(request, response, 200, result);
    } catch (error) {
      if (error.code === "slot-already-approved") {
        return sendJson(request, response, 409, { error: "slot-already-approved" });
      }
      return sendJson(request, response, 500, { error: "approve-failed", detail: String(error.message || error) });
    }
  }

  const approveMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/approve$/);
  if (request.method === "POST" && approveMatch) {
    if (!requireAdmin(request, response)) return true;
    const bookingId = decodeURIComponent(approveMatch[1]);
    const booking = database.bookings.find((item) => item.id === bookingId);
    if (!booking) return sendJson(request, response, 404, { error: "booking-not-found" });
    try {
      const result = await markBookingApproved(request, database, booking);
      return sendJson(request, response, 200, result);
    } catch (error) {
      if (error.code === "slot-already-approved") {
        return sendJson(request, response, 409, { error: "slot-already-approved" });
      }
      return sendJson(request, response, 500, { error: "approve-failed", detail: String(error.message || error) });
    }
  }

  const cancelMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
  if (request.method === "POST" && cancelMatch) {
    if (!requireAdmin(request, response)) return true;
    const bookingId = decodeURIComponent(cancelMatch[1]);
    const booking = database.bookings.find((item) => item.id === bookingId);
    if (!booking) return sendJson(request, response, 404, { error: "booking-not-found" });
    const body = await readJsonBody(request);
    return sendJson(request, response, 200, { booking: cancelBooking(database, booking, body.reason || "") });
  }

  const rejectMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/reject$/);
  if (request.method === "POST" && rejectMatch) {
    if (!requireAdmin(request, response)) return true;
    const bookingId = decodeURIComponent(rejectMatch[1]);
    const booking = database.bookings.find((item) => item.id === bookingId);
    if (!booking) return sendJson(request, response, 404, { error: "booking-not-found" });
    return sendJson(request, response, 200, { booking: cancelBooking(database, booking, "rejected-by-admin") });
  }

  const paymentLinkMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/payment-link$/);
  if (request.method === "POST" && paymentLinkMatch) {
    const bookingId = decodeURIComponent(paymentLinkMatch[1]);
    const booking = database.bookings.find((item) => item.id === bookingId);
    if (!booking) return sendJson(request, response, 404, { error: "booking-not-found" });
    const body = await readJsonBody(request);
    const approvalToken = sanitizeText(body.token || request.headers["x-approval-token"] || "", 120);
    if (!isValidAdminSession(request) && approvalToken !== booking.approvalToken) {
      return sendJson(request, response, 401, { error: "admin-auth-required" });
    }
    if (booking.depositStatus === "paid" || booking.status === BOOKING_STATUS.CONFIRMED) {
      return sendJson(request, response, 200, {
        booking,
        paymentUrl: "",
        paymentWhatsappUrl: "",
        paymentRequired: false
      });
    }
    try {
      const payment = await ensurePaymentLink(request, booking);
      writeDatabase(database);
      return sendJson(request, response, 200, {
        booking,
        paymentUrl: payment.paymentUrl,
        paymentWhatsappUrl: buildCustomerPaymentWhatsappLink(booking, payment.paymentUrl),
        paymentRequired: Boolean(payment.paymentUrl)
      });
    } catch (error) {
      return sendJson(request, response, 500, { error: "payment-link-failed", detail: String(error.message || error) });
    }
  }

  if (request.method === "POST" && pathname === "/api/bookings/finalize-payment") {
    const body = await readJsonBody(request);
    const bookingId = sanitizeText(body.bookingId || "", 80);
    const sessionId = sanitizeText(body.sessionId || "", 180);
    const booking = database.bookings.find((item) => item.id === bookingId);
    if (!booking) return sendJson(request, response, 404, { error: "booking-not-found" });
    try {
      const finalized = await handleFinalizePayment(database, booking, sessionId || booking.paymentSessionId);
      return sendJson(request, response, 200, { booking: finalized });
    } catch (error) {
      if (error.code === "missing-session") {
        return sendJson(request, response, 400, { error: "missing-session" });
      }
      if (error.code === "payment-not-completed") {
        return sendJson(request, response, 409, { error: "payment-not-completed" });
      }
      return sendJson(request, response, 500, { error: "payment-finalize-failed", detail: String(error.message || error) });
    }
  }

  return false;
}

function serveStatic(_request, response, pathname) {
  const staticPathname = pathname === "/admin/leads" || pathname === "/admin/leads/"
    ? "/admin/leads.html"
    : pathname;
  const targetPath = staticPathname === "/"
    ? path.join(ROOT_DIR, "index.html")
    : path.join(ROOT_DIR, decodeURIComponent(staticPathname.replace(/^\/+/, "")));
  const normalized = path.normalize(targetPath);
  if (!normalized.startsWith(ROOT_DIR)) {
    sendText(_request, response, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    sendText(_request, response, 404, "Not found");
    return;
  }
  const extension = path.extname(normalized).toLowerCase();
  const contentType = CONTENT_TYPES[extension] || "application/octet-stream";
  const fileName = path.basename(normalized).toLowerCase();
  const cacheControl = fileName === "admin.html" || /\.(?:html|js|css)$/i.test(normalized)
    ? "no-store"
    : /\.(?:png|jpe?g|gif|webp|svg|ico|mp4|mov|webmanifest)$/i.test(normalized)
    ? "public, max-age=86400"
    : "no-cache";
  response.writeHead(200, {
    ...getSecurityHeaders(),
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    ...getCorsHeaders(_request),
    ...(fileName === "admin.html" ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {})
  });
  fs.createReadStream(normalized).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(String(request.headers.origin || ""))) {
        return sendJson(request, response, 403, { error: "cors-origin-denied" });
      }
      response.writeHead(204, {
        ...getSecurityHeaders(),
        ...getCorsHeaders(request),
        "Cache-Control": "no-store"
      });
      response.end();
      return;
    }
    const url = new URL(request.url, "http://localhost:" + config.port);
    if (url.pathname.startsWith("/api/") && !isAllowedOrigin(String(request.headers.origin || ""))) {
      return sendJson(request, response, 403, { error: "cors-origin-denied" });
    }
    const handled = await handleApi(request, response, url.pathname, url.searchParams);
    if (handled !== false) return;
    serveStatic(request, response, url.pathname);
  } catch (error) {
    sendJson(request, response, 500, { error: "server-error", detail: String(error.message || error) });
  }
});

server.listen(config.port, config.host, () => {
  console.log("WAFFELS server listening on http://" + config.host + ":" + config.port);
  if (!config.adminPasswordHash) {
    console.warn("WARNING: ADMIN_PASSWORD_HASH is not configured. Admin login is disabled until you set it.");
  }
  if (config.selfPingUrl) {
    setInterval(async () => {
      try {
        const response = await fetch(config.selfPingUrl, { cache: "no-store" });
        if (!response.ok) console.warn("Self-ping returned", response.status);
      } catch (error) {
        console.warn("Self-ping failed:", String(error.message || error));
      }
    }, config.selfPingIntervalMs).unref();
  }
});

