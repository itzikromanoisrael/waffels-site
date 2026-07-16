const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(ROOT_DIR, "assets", "media", "uploads");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const CONTENT_JS_FILE = path.join(ROOT_DIR, "content.js");
const ENV_FILE = path.join(__dirname, ".env.local");

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
  ".xml": "application/xml; charset=utf-8",
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

const defaults = {
  port: 3000,
  publicBaseUrl: "",
  timeZone: "Asia/Jerusalem",
  googleCalendarId: "",
  slotCapacity: 1,
  depositAmountIls: 150,
  depositWindowMinutes: 15,
  workWeekdays: [0, 1, 2, 3, 4],
  slotLabels: ["09:00", "11:00", "13:00", "14:00"],
  bookingRateLimitWindowMs: 15 * 60 * 1000,
  bookingRateLimitMax: 8,
  adminSessionTtlMs: 8 * 60 * 60 * 1000,
  selfPingIntervalMs: 10 * 60 * 1000
};

const bookingRateLimits = new Map();
const adminSessions = new Map();

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

if (config.publicBaseUrl && !config.allowedOrigins.includes(config.publicBaseUrl)) {
  config.allowedOrigins.push(config.publicBaseUrl);
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify({ bookings: [] }, null, 2), "utf8");
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
  return config.workWeekdays.includes(date.getDay());
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
    "connect-src 'self' https://api.stripe.com https://www.googleapis.com https://oauth2.googleapis.com",
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
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (isLocalOrigin(normalized) && (!config.publicBaseUrl || isLocalOrigin(config.publicBaseUrl))) return true;
  return config.allowedOrigins.map(normalizeOrigin).filter(Boolean).includes(normalized);
}

function getCorsHeaders(request) {
  const origin = String(request.headers.origin || "");
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": normalizeOrigin(origin),
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

function requireAdmin(request, response) {
  if (isValidAdminSession(request)) return true;
  sendJson(request, response, 401, { ok: false, error: "admin-auth-required" });
  return false;
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
    workWeekdays: config.workWeekdays,
    slotLabels: config.slotLabels,
    slotCapacity: config.slotCapacity,
    depositAmountIls: config.depositAmountIls,
    depositWindowMinutes: config.depositWindowMinutes,
    states: BOOKING_STATUS
  };
}

async function handleApi(request, response, pathname, searchParams) {
  const database = readDatabase();

  if (request.method === "GET" && pathname === "/api/health") {
    return sendJson(request, response, 200, {
      ok: true,
      totalBookings: database.bookings.length,
      googleCalendarConfigured: isGoogleConfigured(),
      stripeConfigured: isStripeConfigured()
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
  const targetPath = pathname === "/"
    ? path.join(ROOT_DIR, "index.html")
    : path.join(ROOT_DIR, decodeURIComponent(pathname.replace(/^\/+/, "")));
  const normalized = path.normalize(targetPath);
  if (!normalized.startsWith(ROOT_DIR)) {
    sendText(_request, response, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    const notFoundPath = path.join(ROOT_DIR, "404.html");
    if (fs.existsSync(notFoundPath)) {
      response.writeHead(404, {
        ...getSecurityHeaders(),
        "Content-Type": CONTENT_TYPES[".html"],
        "Cache-Control": "no-cache",
        ...getCorsHeaders(_request)
      });
      fs.createReadStream(notFoundPath).pipe(response);
      return;
    }
    sendText(_request, response, 404, "Not found");
    return;
  }
  const extension = path.extname(normalized).toLowerCase();
  const contentType = CONTENT_TYPES[extension] || "application/octet-stream";
  const fileName = path.basename(normalized).toLowerCase();
  const cacheControl = fileName === "admin.html"
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

