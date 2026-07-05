const fs = require("fs");
const path = require("path");
const { CHAT_RESPONSE_SCHEMA, validateChatResponse } = require("./chat-contract");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_MODEL = "gpt-4o";
const REQUEST_TIMEOUT_MS = 12000;
let knowledgeCache = null;
let lastAIError = "";

function loadBrainKnowledge() {
  const candidates = [path.join(ROOT_DIR, "ai-brain"), path.join(ROOT_DIR, "..", "ai-brain")];
  const brainDir = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
  if (!brainDir) {
    return {
      dir: "",
      content: "לא נמצאו קבצי ai-brain. יש לפעול רק לפי כללי העסק הבטוחים שבפרומפט ולא להמציא מידע."
    };
  }

  const files = fs.readdirSync(brainDir)
    .filter((fileName) => fileName.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));
  const signature = files.map((fileName) => {
    const stat = fs.statSync(path.join(brainDir, fileName));
    return `${fileName}:${stat.mtimeMs}:${stat.size}`;
  }).join("|");
  if (knowledgeCache && knowledgeCache.dir === brainDir && knowledgeCache.signature === signature) return knowledgeCache;

  knowledgeCache = {
    dir: brainDir,
    signature,
    content: files.map((fileName) => {
      return `# ${fileName}\n\n${fs.readFileSync(path.join(brainDir, fileName), "utf8")}`;
    }).join("\n\n---\n\n").slice(0, 90000)
  };
  return knowledgeCache;
}

function buildSystemPrompt(knowledge) {
  return `
את פקידת הקבלה הדיגיטלית של Waffel's, עסק בוטיק לטיפוח כלבים של אורטל.

סגנון:
- עברית בלבד.
- חם, רגוע, מקצועי וקצר.
- לא רובוטי ולא ילדותי.
- קודם עונים לשאלה האמיתית של הלקוח, ואז שואלים שאלת המשך אחת בלבד.
- לא חוזרים על שאלה ולא מבקשים פרט שכבר נמצא ב-state.

כללי עסק ובטיחות:
- אין להבטיח תור או זמינות. אורטל בודקת את היומן וחוזרת עם אפשרויות.
- שעות הפעילות: ראשון עד חמישי 09:00-16:00. התור האחרון מתחיל ב-14:00.
- טיפול נמשך בדרך כלל סביב שעתיים, בהתאם לכלב, לפרווה ולהתנהגות.
- אין לתת מחיר סופי. מסבירים שהמחיר תלוי בגודל, מצב הפרווה, קשרים וסוג הטיפול.
- כלבים עם פרווה קצרה אינם מקבלים תספורת; הטיפול מתמקד במקלחת, ייבוש, הברשה, אוזניים וציפורניים לפי הצורך.
- לכלבים עם פרווה כפולה לא מאשרים גילוח אוטומטית. יש להזהיר בעדינות ולהסלים לאורטל.
- בקשת שיחה עם אדם עוצרת את השאלון. אם חסר טלפון, שואלים רק טלפון.
- אין לתת ייעוץ רפואי. מקרה רפואי, תוקפנות, קשרים חמורים, תלונה או אי ודאות עוברים לאורטל.
- ליד נשמר רק לאחר סיכום נקי ואישור מפורש של הלקוח.
- state_patch כולל רק שדות חדשים או שדות שהשתנו.
- next_question הוא מפתח קצר כמו phone, dog_name, breed, coat_condition או מחרוזת ריקה.
- כל הפלט חייב להיות אובייקט JSON בלבד שתואם בדיוק לחוזה. אין Markdown ואין טקסט מחוץ ל-JSON.

ידע עסקי זמין:
${knowledge}
`.trim();
}

async function buildAIChatResponse({ message, state = {}, apiKey = "", model = "" }) {
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const knowledge = loadBrainKnowledge();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(knowledge.content) },
          {
            role: "user",
            content: JSON.stringify({
              latest_customer_message: String(message || ""),
              current_state: state && typeof state === "object" && !Array.isArray(state) ? state : {}
            })
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "waffels_chat_response",
            strict: true,
            schema: CHAT_RESPONSE_SCHEMA
          }
        },
        temperature: 0.25,
        max_tokens: 700
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      lastAIError = `openai-http-${response.status}`;
      return null;
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      lastAIError = "openai-missing-content";
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (_error) {
      lastAIError = "openai-invalid-json";
      return null;
    }
    const validation = validateChatResponse(parsed);
    if (!validation.valid) {
      lastAIError = validation.error;
      return null;
    }
    lastAIError = "";
    return validation.value;
  } catch (error) {
    lastAIError = error?.name === "AbortError" ? "openai-timeout" : "openai-request-failed";
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getLastAIError() {
  return lastAIError;
}

module.exports = {
  buildAIChatResponse,
  loadBrainKnowledge,
  getLastAIError
};
