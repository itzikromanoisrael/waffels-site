function normalizeHebrewText(text) {
  return String(text || "")
    .trim()
    .replace(/[״"]/g, '"')
    .replace(/[׳']/g, "'")
    .replace(/\s+/g, " ");
}

function sanitizeText(value, limit = 1200) {
  return normalizeHebrewText(value).replace(/\u0000/g, "").slice(0, limit);
}

function appendNote(existing, note) {
  const current = sanitizeText(existing, 1600);
  const cleanNote = sanitizeText(note, 500);
  if (!cleanNote || current.includes(cleanNote)) return current;
  return current ? `${current}\n${cleanNote}` : cleanNote;
}

function isGibberish(message) {
  const text = normalizeHebrewText(message);
  if (!text) return true;
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  const hasDigits = /\d/.test(text);
  const hasKnownEnglish = /\b(dog|poodle|yorkie|yorkshire|husky|grooming|bath|haircut|price|appointment)\b/i.test(text);
  const mostlySymbols = text.length >= 4 && !/[a-zA-Z\u0590-\u05FF0-9]/.test(text.replace(/\s/g, ""));
  const randomLatin = /^[a-zA-Z]{8,}$/.test(text) && !hasKnownEnglish;
  return mostlySymbols || randomLatin || (!hasHebrew && !hasKnownEnglish && !hasDigits);
}

const BREEDS = [
  { match: ["יורקשר", "יורקשיר", "יורקשייר", "יורקי", "yorkie", "yorkshire"], value: "יורקשייר", coat: "long_silky" },
  { match: ["טוי פודל", "פודל ננסי", "פודל", "poodle"], value: "פודל", coat: "curly" },
  { match: ["מלטיפו", "מלטי פו"], value: "מלטיפו", coat: "curly" },
  { match: ["קאבפו", "קאבאפו"], value: "קאבפו", coat: "curly" },
  { match: ["קוקאפו"], value: "קוקאפו", coat: "curly" },
  { match: ["גולדנדודל", "לברדודל", "דודל"], value: "דודל", coat: "curly" },
  { match: ["שי צו", "שיצו"], value: "שיצו", coat: "long_silky" },
  { match: ["מלטזי", "מלטז"], value: "מלטז", coat: "long_silky" },
  { match: ["פיט בול", "פיטבול"], value: "פיטבול", coat: "short_smooth" },
  { match: ["סטאפורדשייר", "סטפורדשייר", "אמסטף", "סטאף"], value: "אמסטף", coat: "short_smooth" },
  { match: ["דוברמן"], value: "דוברמן", coat: "short_smooth" },
  { match: ["בוקסר"], value: "בוקסר", coat: "short_smooth" },
  { match: ["ביגל"], value: "ביגל", coat: "short_smooth" },
  { match: ["פינצ'ר", "פינצר"], value: "פינצ׳ר", coat: "short_smooth" },
  { match: ["בולדוג צרפתי"], value: "בולדוג צרפתי", coat: "short_smooth" },
  { match: ["האסקי סיבירי", "האסקי", "husky"], value: "האסקי", coat: "double_coat" },
  { match: ["סמויד"], value: "סמויד", coat: "double_coat" },
  { match: ["פומרניין", "פומרניאן"], value: "פומרניאן", coat: "double_coat" },
  { match: ["גולדן רטריבר", "גולדן"], value: "גולדן רטריבר", coat: "double_coat" },
  { match: ["רועה גרמני"], value: "רועה גרמני", coat: "double_coat" },
  { match: ["קורגי"], value: "קורגי", coat: "double_coat" }
];

function normalizeBreed(raw) {
  const text = normalizeHebrewText(raw).toLowerCase();
  for (const breed of BREEDS) {
    if (breed.match.some((candidate) => text.includes(candidate.toLowerCase()))) {
      return { breed: breed.value, coat_type_key: breed.coat };
    }
  }
  return null;
}

function coatTypeLabel(coatKey) {
  return {
    short_smooth: "פרווה קצרה",
    curly: "פרווה מתולתלת / צפופה",
    long_silky: "פרווה ארוכה / משיית",
    double_coat: "פרווה כפולה",
    wire: "פרווה זיפית"
  }[coatKey] || "";
}

function serviceForCoat(breed, coatKey) {
  if (coatKey === "short_smooth") return "טיפול טיפוח מלא לפרווה קצרה";
  if (coatKey === "curly" || coatKey === "long_silky") return `טיפול טיפוח מלא ל${breed || "כלב"} / תספורת ועיצוב`;
  if (coatKey === "double_coat") return "טיפול פרווה כפולה / הוצאת פרווה מתה";
  return "טיפול טיפוח מלא מותאם אישית";
}

function detectHumanHandoff(message) {
  const text = normalizeHebrewText(message);
  return /(אין לי כוח לבוט|לא רוצה בוט|תביא לי מישהו|אפשר לדבר עם בן אדם|תן לי את אורטל|אני רוצה לדבר עם מישהו|תתקשרו אליי|הבוט מעצבן|נציג|בן אדם)/.test(text);
}

function detectFrustration(message) {
  const text = normalizeHebrewText(message);
  return /(מה זה משנה|שאלתי שאלה|לא ענית לי|אתה חופר|את לא עונה|אתה לא מבין|אתה לא מתוכנת טוב|זה לא מה ששאלתי|מה אתה לא מבין)/.test(text);
}

function detectSmallTalk(message) {
  const text = normalizeHebrewText(message);
  return /^(היי|שלום|אהלן|מה נשמע|מה שלומך|שלומי טוב|בוקר טוב|ערב טוב|תודה|סבבה|מעולה)[\s!?.,]*$/.test(text)
    || /^(היי|שלום|אהלן).*(מה שלומך|מה נשמע|שלומי טוב)[\s!?.,]*$/.test(text);
}

function detectAppointment(message) {
  return /(תור|תורים|היום|השבוע|זמינות|להגיע|לקבוע|מתי אפשר|אפשר להגיע|פנוי|פנויים)/.test(normalizeHebrewText(message));
}

function detectPrice(message) {
  return /(כמה עולה|מחיר|עלות|כמה יעלה|הצעת מחיר)/.test(normalizeHebrewText(message));
}

function detectDurationQuestion(message) {
  return /(כמה זמן.*(?:טיפול|תספורת|מקלחת)|(?:טיפול|תספורת|מקלחת).*כמה זמן|כמה זמן זה לוקח)/.test(normalizeHebrewText(message));
}

function detectServiceIncludesQuestion(message) {
  return /(מה כולל הטיפול|מה כלול בטיפול|איזה טיפול עושים|מה עושים בטיפול)/.test(normalizeHebrewText(message));
}

function detectDoubleCoatShaveWarning(message, coatTypeKey = "") {
  const text = normalizeHebrewText(message);
  return coatTypeKey === "double_coat" && /(גילוח|לגלח|קצר ממש|לעשות קצר|לגלח אותו קצר|לגלח אותה קצר)/.test(text);
}

function detectGroomingInfo(message) {
  return /(פרטים|מה כולל|מה כלול|טיפול|מקלחת|תספורת|סידור|טיפוח|פרווה|קשרים|לא ראה מקלחת|לא הסתפר|לא טופל)/.test(normalizeHebrewText(message));
}

function isConfirmation(message) {
  return /^(כן|מאשר|מאשרת|שלח|אפשר לשלוח|מאושר|יאללה|אישור)[.!?]?$/.test(normalizeHebrewText(message));
}

function extractIsraeliPhone(message) {
  const match = String(message || "").match(/(?:\+972|972|0)?5\d[\s-]?\d{3}[\s-]?\d{4}/);
  if (!match) return "";
  let phone = match[0].replace(/[^\d+]/g, "");
  if (phone.startsWith("+972")) phone = `0${phone.slice(4)}`;
  if (phone.startsWith("972")) phone = `0${phone.slice(3)}`;
  return phone;
}

function extractCustomerName(message) {
  const text = normalizeHebrewText(message);
  const patterns = [
    /שמי\s+([א-ת]{2,12})/,
    /קוראים לי\s+([א-ת]{2,12})/,
    /השם שלי\s+([א-ת]{2,12})/,
    /אני\s+([א-ת]{2,12})(?:\s|$)/
  ];
  const blocked = /^(שאלה|תור|מחיר|כלב|כלבה|בוט|מישהו|אורטל|טיפול|מקלחת|תספורת|מכפר|מהוד|מרעננה|מהרצליה|עם|רוצה|צריך|צריכה|מעוניין|יש|לי)$/;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && !blocked.test(match[1])) return match[1];
  }
  return "";
}

function extractCity(message) {
  const match = normalizeHebrewText(message).match(/מ(כפר סבא|הוד השרון|רעננה|הרצליה|פתח תקווה|רמת השרון|תל אביב|רמת גן)/);
  return match ? match[1] : "";
}

function extractDogNameAndBreed(message) {
  const text = normalizeHebrewText(message);
  const patterns = [
    /^([א-ת]{2,16})\s+(?:הוא|היא)\s+(.+)$/,
    /הכלב שלי\s+([א-ת]{2,16})\s+הוא\s+(.+)/,
    /הכלבה שלי\s+([א-ת]{2,16})\s+היא\s+(.+)/,
    /קוראים לו\s+([א-ת]{2,16})\s+והוא\s+(.+)/,
    /קוראים לה\s+([א-ת]{2,16})\s+והיא\s+(.+)/
  ];
  const blocked = /^(היי|שלום|אני|שמי|רשמתי|תור|מחיר|מישהו|בוט|מקלחת|תספורת)$/;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || blocked.test(match[1])) continue;
    const breedInfo = normalizeBreed(match[2]);
    if (breedInfo) return { dog_name: match[1], ...breedInfo };
  }
  return null;
}

function extractDogNameOnly(message, state = {}) {
  const text = normalizeHebrewText(message);
  const blocked = /^(שאלה|תור|מחיר|בוט|מישהו|אורטל|טיפול|מקלחת|תספורת|מה|למה|איך)$/;
  const patterns = [
    /לכלב קוראים\s+([א-ת]{2,16})/,
    /לכלבה קוראים\s+([א-ת]{2,16})/,
    /קוראים לכלב\s+([א-ת]{2,16})/,
    /קוראים לכלבה\s+([א-ת]{2,16})/,
    /השם שלו\s+([א-ת]{2,16})/,
    /השם שלה\s+([א-ת]{2,16})/,
    /שמו\s+([א-ת]{2,16})/,
    /שמה\s+([א-ת]{2,16})/,
    /כלב בשם\s+([א-ת]{2,16})/,
    /כלבה בשם\s+([א-ת]{2,16})/,
    /בשם\s+([א-ת]{2,16})/,
    /קוראים לו\s+([א-ת]{2,16})/,
    /קוראים לה\s+([א-ת]{2,16})/,
    /שם הכלב\s+([א-ת]{2,16})/,
    /הכלב שלי\s+([א-ת]{2,16})/,
    /הכלבה שלי\s+([א-ת]{2,16})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && !blocked.test(match[1])) return match[1];
  }
  const askedForDogName = ["dog_name", "dog_name_and_breed", "dog_name_and_phone"].includes(state.last_bot_question);
  if (askedForDogName && /^[א-ת]{2,16}$/.test(text) && !blocked.test(text)) return text;
  return "";
}

function extractPreferredDate(message) {
  const text = normalizeHebrewText(message);
  if (/ל?שבוע הבא/.test(text)) return "שבוע הבא";
  const day = text.match(/ביום\s+(ראשון|שני|שלישי|רביעי|חמישי)/);
  if (day) return `ביום ${day[1]}`;
  if (/מחר/.test(text)) return "מחר";
  if (/היום/.test(text)) return "היום";
  if (/השבוע/.test(text)) return "השבוע";
  return "";
}

function detectCoatCondition(message) {
  const text = normalizeHebrewText(message);
  if (/(לא ראה מקלחת|לא הסתפר|לא טופל|כמה חודשים|הרבה זמן)/.test(text)) return "לא טופל כמה חודשים / דורש בדיקת מצב פרווה";
  if (/(מלא קשרים|קשרים|ראסטות|פרווה מוזנחת|דחוסה)/.test(text)) return "יש קשרים או פרווה דחוסה";
  if (/(רגיש|פצע|עור|אלרגיה|גירוד)/.test(text)) return "רגישות עור / נדרש לבדוק לפני טיפול";
  return "";
}

function normalizeState(state = {}) {
  const clean = {};
  const textFields = [
    "customer_name", "customer_city", "phone", "dog_name", "breed", "coat_type_key", "coat_type",
    "coat_condition", "service_requested", "medical_notes", "behavior_notes", "preferred_date",
    "is_returning_customer", "notes", "status", "temperature", "next_action", "conversation_stage",
    "last_intent", "last_bot_question"
  ];
  for (const key of textFields) clean[key] = sanitizeText(state[key] || "", key === "notes" ? 1600 : 300);
  clean.summary_presented = Boolean(state.summary_presented);
  clean.escalate_to_ortal = Boolean(state.escalate_to_ortal);
  return clean;
}

function extractFactsFromMessage(message, inputState = {}) {
  const state = normalizeState(inputState);
  const facts = {};
  const text = normalizeHebrewText(message);
  const customerName = extractCustomerName(text);
  if (customerName && !state.customer_name) facts.customer_name = customerName;
  const city = extractCity(text);
  if (city) {
    facts.customer_city = city;
    facts.notes = appendNote(state.notes, `לקוח מ${city}.`);
  }
  const phone = extractIsraeliPhone(text);
  if (phone) facts.phone = phone;
  const preferredDate = extractPreferredDate(text);
  if (preferredDate) {
    facts.preferred_date = preferredDate;
    facts.notes = appendNote(facts.notes || state.notes, `מועד מועדף: ${preferredDate}`);
  }
  const combo = extractDogNameAndBreed(text);
  if (combo) {
    facts.dog_name = combo.dog_name;
    facts.breed = combo.breed;
    facts.coat_type_key = combo.coat_type_key;
    facts.coat_type = coatTypeLabel(combo.coat_type_key);
    facts.service_requested = serviceForCoat(combo.breed, combo.coat_type_key);
  } else {
    const breedInfo = normalizeBreed(text);
    if (breedInfo) {
      facts.breed = breedInfo.breed;
      facts.coat_type_key = breedInfo.coat_type_key;
      facts.coat_type = coatTypeLabel(breedInfo.coat_type_key);
      facts.service_requested = serviceForCoat(breedInfo.breed, breedInfo.coat_type_key);
    }
    const dogName = extractDogNameOnly(text, state);
    if (dogName) facts.dog_name = dogName;
  }
  const coatCondition = detectCoatCondition(text);
  if (coatCondition) {
    facts.coat_condition = coatCondition;
    facts.notes = appendNote(facts.notes || state.notes, coatCondition);
  }
  if (/מקלחת/.test(text) && /נשיר/.test(text)) {
    facts.notes = appendNote(facts.notes || state.notes, "מקלחת ונשירה");
  }
  return facts;
}

function classifyIntent(message, facts = {}, state = {}) {
  if (isConfirmation(message)) return { intent: "confirm_send", confidence: "high" };
  if (detectHumanHandoff(message)) return { intent: "human_handoff", confidence: "high" };
  if (detectDoubleCoatShaveWarning(message, facts.coat_type_key || state.coat_type_key)) return { intent: "double_coat_warning", confidence: "high" };
  if (detectFrustration(message)) return { intent: "frustration", confidence: "high" };
  if (detectAppointment(message)) return { intent: "appointment_question", confidence: "high" };
  if (detectPrice(message)) return { intent: "price_question", confidence: "high" };
  if (detectDurationQuestion(message)) return { intent: "duration_question", confidence: "high" };
  if (detectServiceIncludesQuestion(message)) return { intent: "service_includes_question", confidence: "high" };
  if (detectGroomingInfo(message)) return { intent: "grooming_info", confidence: "high" };
  if (facts.phone || facts.dog_name || facts.breed || facts.customer_name || facts.customer_city || facts.preferred_date || facts.coat_condition) {
    return { intent: "provide_detail", confidence: "high" };
  }
  if (detectSmallTalk(message)) return { intent: "small_talk", confidence: "medium" };
  return { intent: "unknown", confidence: isGibberish(message) ? "low" : "low" };
}

function mergeState(state = {}, facts = {}) {
  const next = { ...normalizeState(state) };
  for (const [key, value] of Object.entries(facts)) {
    if (value === undefined || value === null || String(value).trim() === "") continue;
    next[key] = key === "notes" ? appendNote(next.notes, value) : value;
  }
  return next;
}

function buildPoodlePriceReply() {
  return "בפודל המחיר תלוי בעיקר בגודל שלו, מצב הפרווה, האם יש קשרים, ומתי היה הטיפול האחרון. הטיפול אצל אורטל כולל מקלחת עם חומרים איכותיים, ייבוש מלא, סירוק, עבודה לפי מצב הפרווה, תספורת/עיצוב, אוזניים וציפורניים. כדי שאורטל תוכל לתת הערכה מדויקת, אפשר לדעת אם מדובר בטוי/ננסי/בינוני ומתי הוא הסתפר בפעם האחרונה?";
}

function buildShortCoatReply() {
  return "בגלל שמדובר בפרווה קצרה, זה לא טיפול של תספורת כמו אצל פודל או שיצו. אצל אורטל הטיפול מתמקד במקלחת עם חומרים איכותיים, ייבוש, אוזניים, ציפורניים, ניקוי וסידור לפי הצורך והברשה שמתאימה לפרווה קצרה. כדי לדייק, חשוב לדעת אם יש רגישות בעור, ריח חזק, נשירה חריגה או משהו בהתנהגות שחשוב שאורטל תדע.";
}

function buildDoubleCoatReply() {
  return "בגזעים עם פרווה כפולה צריך להיזהר מגילוח. אצל אורטל בודקים טיפול נכון יותר כמו מקלחת, ייבוש יסודי, סירוק והוצאת פרווה מתה. במקרה כזה אורטל צריכה לראות את הפרווה ולקבל החלטה מקצועית.";
}

function buildYorkshirePriceReply(state) {
  const question = nextQuestionForState(state, "price_question");
  const base = "בגלל שמדובר ביורקשייר שלא הסתפר הרבה זמן, המחיר תלוי בעיקר במצב הפרווה, האם יש קשרים, גודל הכלב וכמה עבודה נדרשת בסירוק/פתיחת קשרים לפני הטיפול.\n\nאצל אורטל הטיפול כולל מקלחת, ייבוש, סירוק ועבודה לפי מצב הפרווה, תספורת/סידור, אוזניים וציפורניים.";
  return { reply: question ? `${base}\n\nכדי שאורטל תוכל לתת הערכה מדויקת, ${question.text}` : base, nextQuestionKey: question?.key || "" };
}

function buildDoubleCoatWarningReply(state) {
  const question = state.phone ? "לאשר שאעביר את הפרטים לאורטל?" : "כדי שאורטל תחזור אליך אישית, מה מספר הטלפון לחזרה?";
  return {
    reply: `בגזעים עם פרווה כפולה כמו האסקי צריך להיזהר מאוד מגילוח, כי זה עלול לפגוע באיכות הפרווה וביכולת שלה להגן על הכלב. אצל אורטל לא מאשרים גילוח כזה אוטומטית.\n\nהכיוון הנכון הוא בדרך כלל מקלחת, ייבוש יסודי, סירוק והוצאת פרווה מתה — אבל אורטל צריכה לראות את מצב הפרווה לפני החלטה מקצועית.\n\n${question}`,
    nextQuestionKey: state.phone ? "confirm" : "phone"
  };
}

function buildCleanSummary(state) {
  return [
    "מעולה, אעביר לאורטל:", "",
    `שם לקוח: ${state.customer_name || "לא נמסר"}`,
    `טלפון: ${state.phone || "לא נמסר"}`,
    `שם הכלב: ${state.dog_name || "לא נמסר"}`,
    `גזע: ${state.breed || "לא נמסר"}`,
    `סוג טיפול: ${state.service_requested || "פנייה לשיחה אישית עם אורטל"}`,
    `מצב פרווה: ${state.coat_condition || "לא נמסר"}`,
    `הערות: ${state.notes || "אין הערות נוספות"}`, "",
    "לאשר שליחה לאורטל?"
  ].join("\n");
}

function nextQuestionForState(state, intent) {
  if (intent === "human_handoff" || state.conversation_stage === "human_handoff") {
    if (!state.phone) return { key: "phone", text: "מה מספר הטלפון לחזרה?" };
    return { key: "confirm", text: "לאשר שאעביר את הפרטים לאורטל?" };
  }
  if (intent === "appointment_question" || state.conversation_stage === "appointment") {
    if (!state.phone && !state.dog_name) return { key: "dog_name_and_phone", text: "איך קוראים לכלב ומה מספר הטלפון לחזרה?" };
    if (!state.phone) return { key: "phone", text: "מה מספר הטלפון לחזרה?" };
    if (!state.dog_name) return { key: "dog_name", text: "איך קוראים לכלב?" };
    return { key: "confirm", text: "לאשר שאעביר את הפנייה לאורטל?" };
  }
  if (!state.dog_name && !state.phone) return { key: "dog_name_and_phone", text: "איך קוראים לכלב ומה מספר הטלפון לחזרה?" };
  if (!state.dog_name) return { key: "dog_name", text: "איך קוראים לכלב?" };
  if (!state.breed) return { key: "breed", text: "מה הגזע שלו?" };
  if (!state.phone) return { key: "phone", text: "מה מספר הטלפון לחזרה?" };
  return { key: "confirm", text: "לאשר שאעביר את הפרטים לאורטל?" };
}

function avoidRepeat(question, state) {
  if (!question) return null;
  if (question.key === "dog_name_and_phone" && state.dog_name) {
    return state.phone ? null : { key: "phone", text: "מה מספר הטלפון לחזרה?" };
  }
  if (question.key === "dog_name" && state.dog_name) return null;
  if (question.key === "breed" && state.breed) return null;
  if (question.key === "phone" && state.phone) return null;
  if (state.last_bot_question !== question.key) return question;
  if (question.key === "phone") return { key: "phone", text: "המספר לא נקלט אצלי. אפשר לכתוב מספר טלפון מלא לחזרה?" };
  if (question.key === "dog_name") return { key: "clarify_dog_name", text: "רק לוודא שהבנתי נכון — איך קוראים לכלב?" };
  if (question.key === "breed") return { key: "clarify_breed", text: "רק לוודא שהבנתי נכון — מה הגזע?" };
  return null;
}

function buildContextualClarification(state) {
  if (state.last_bot_question === "phone") {
    return { reply: "לא הצלחתי לזהות מספר טלפון. אפשר לכתוב מספר נייד לחזרה?", nextQuestionKey: "phone" };
  }
  if (["dog_name", "clarify_dog_name"].includes(state.last_bot_question)) {
    return { reply: "לא הצלחתי להבין את שם הכלב. אפשר לכתוב רק את השם שלו?", nextQuestionKey: "dog_name" };
  }
  if (state.last_bot_question === "dog_name_and_phone") {
    return { reply: "לא הצלחתי לזהות שם כלב או טלפון. אפשר לכתוב את שם הכלב ומספר נייד לחזרה?", nextQuestionKey: "dog_name_and_phone" };
  }
  return null;
}

function buildReply({ message, stateBefore, stateAfter, intent, confidence }) {
  if (confidence === "low") return { reply: "לא הצלחתי להבין את ההודעה. אפשר לכתוב לי שוב בקצרה מה רצית לברר — תור, מחיר או טיפול לכלב?", nextQuestionKey: "" };
  if (intent === "confirm_send") return { reply: "תודה רבה, הפרטים נשמרים לאורטל. היא תחזור אליך אישית בהקדם 🐾", nextQuestionKey: "" };
  if (intent === "human_handoff") {
    const hasPhone = Boolean(stateAfter.phone);
    return {
      reply: hasPhone
        ? "מבין לגמרי. אעביר את הפנייה לאורטל והיא תחזור אליך אישית בהקדם.\n\nלאשר שאעביר לה את הפרטים?"
        : "מבין לגמרי. אעביר את הפנייה לאורטל כדי שתחזור אליך אישית.\n\nמה מספר הטלפון לחזרה?",
      nextQuestionKey: hasPhone ? "confirm" : "phone"
    };
  }
  if (intent === "frustration") {
    const hasPhone = Boolean(stateAfter.phone);
    return {
      reply: hasPhone
        ? "אתה צודק, סליחה. אעביר את הפנייה לאורטל כדי שתחזור אליך אישית.\n\nלאשר שליחה לאורטל?"
        : "אתה צודק, סליחה. כדי שאורטל תחזור אליך אישית, מה מספר הטלפון לחזרה?",
      nextQuestionKey: hasPhone ? "confirm" : "phone"
    };
  }
  if (intent === "small_talk") return { reply: "היי, הכול טוב תודה 🙂 איך אפשר לעזור עם הכלב?", nextQuestionKey: "" };
  if (intent === "double_coat_warning") return buildDoubleCoatWarningReply(stateAfter);
  if (intent === "appointment_question") {
    const question = avoidRepeat(nextQuestionForState(stateAfter, intent), stateAfter);
    if (stateAfter.customer_name && stateAfter.dog_name && stateAfter.breed && stateAfter.preferred_date) {
      const base = `היי ${stateAfter.customer_name}, בשמחה. אני לא מבטיח תור בלי בדיקה ביומן של אורטל, אבל רשמתי שמדובר ב${stateAfter.dog_name}, ${stateAfter.breed}, ושנוח לכם לבדוק ל${stateAfter.preferred_date}.`;
      return { reply: question ? `${base}\n\n${question.text}` : base, nextQuestionKey: question?.key || "" };
    }
    const base = "אין לי אפשרות להבטיח תור בלי בדיקה ביומן של אורטל, אבל אפשר להשאיר לה פרטים והיא תחזור אליך עם האפשרויות המתאימות.";
    return { reply: question ? `${base}\n\n${question.text}` : base, nextQuestionKey: question?.key || "" };
  }
  if (intent === "price_question") {
    if (stateAfter.breed === "יורקשייר") return buildYorkshirePriceReply(stateAfter);
    if (stateAfter.coat_type_key === "curly") return { reply: buildPoodlePriceReply(), nextQuestionKey: "" };
    if (stateAfter.coat_type_key === "short_smooth") return { reply: buildShortCoatReply(), nextQuestionKey: "" };
    if (stateAfter.coat_type_key === "double_coat") return { reply: buildDoubleCoatReply(), nextQuestionKey: "" };
    if (!stateAfter.breed) return { reply: "כדי לתת הערכה מדויקת ולא להטעות אותך, המחיר תלוי בגזע, גודל הכלב ומצב הפרווה. איזה גזע הכלב?", nextQuestionKey: "breed" };
    return { reply: "כדי לתת הערכה מדויקת ולא להטעות אותך, המחיר תלוי בגודל הכלב, מצב הפרווה וסוג הטיפול הנדרש.", nextQuestionKey: "" };
  }
  if (intent === "duration_question") {
    const question = stateAfter.breed ? null : { key: "breed", text: "איזה גזע הכלב?" };
    const base = "טיפול אצל אורטל בדרך כלל לוקח סביב שעתיים, אבל זה משתנה לפי גודל הכלב, סוג הפרווה, מצב הפרווה, קשרים והתנהגות בזמן הטיפול.\n\nבפודל/יורקשייר/שיצו עם פרווה ארוכה או קשרים זה יכול לקחת יותר. בפרווה קצרה לרוב זה פשוט יותר.";
    return { reply: question ? `${base}\n\n${question.text}` : base, nextQuestionKey: question?.key || "" };
  }
  if (intent === "service_includes_question") {
    const question = stateAfter.breed ? null : { key: "breed", text: "איזה גזע הכלב?" };
    const base = "הטיפול אצל אורטל מותאם לכלב ולסוג הפרווה. בדרך כלל הוא יכול לכלול מקלחת עם חומרים איכותיים, ייבוש מלא, סירוק/הברשה, עבודה לפי מצב הפרווה, אוזניים, ציפורניים וסידור אזורים עדינים.\n\nבכלבים שמתאימים לתספורת כמו פודל, יורקשייר, שיצו ומלטיפו — הטיפול יכול לכלול גם תספורת ועיצוב. בכלבים עם פרווה קצרה או פרווה כפולה הטיפול שונה ולא תמיד מדובר בתספורת.";
    return { reply: question ? `${base}\n\n${question.text}` : base, nextQuestionKey: question?.key || "" };
  }
  if (intent === "grooming_info" && stateAfter.breed === "יורקשייר") {
    const question = avoidRepeat(nextQuestionForState(stateAfter, intent), stateAfter);
    const intro = `היי${stateAfter.customer_name ? ` ${stateAfter.customer_name}` : ""}, הבנתי.\nיורקשייר שלא טופל כמה חודשים יכול לדרוש בדיקה של מצב הפרווה, במיוחד אם יש קשרים או אזורים דחוסים.\n\nאצל אורטל הטיפול כולל מקלחת, ייבוש, סירוק, עבודה לפי מצב הפרווה, אוזניים וציפורניים.`;
    return { reply: question ? `${intro}\n\n${question.text}` : intro, nextQuestionKey: question?.key || "" };
  }
  if (intent === "grooming_info") {
    const question = avoidRepeat(nextQuestionForState(stateAfter, intent), stateAfter);
    if (stateAfter.coat_type_key === "short_smooth" && /מקלחת/.test(message) && /נשיר/.test(message)) {
      const base = `${stateAfter.breed || "הכלב"} הוא כלב עם פרווה קצרה, אז זה לא טיפול של תספורת. אצל אורטל הטיפול מתמקד במקלחת עם חומרים איכותיים, ייבוש, הברשה שמתאימה לפרווה קצרה, עזרה עם נשירה, אוזניים וציפורניים לפי הצורך.`;
      return {
        reply: question ? `${base}\n\nכדי שאורטל תוכל לדייק את הטיפול, ${question.text}` : base,
        nextQuestionKey: question?.key || ""
      };
    }
    const base = "הטיפול אצל אורטל מותאם לגזע, מצב הפרווה והאופי של הכלב.";
    return { reply: question ? `${base}\n\n${question.text}` : base, nextQuestionKey: question?.key || "" };
  }
  if (stateAfter.conversation_stage === "human_handoff") {
    if (stateAfter.phone) return { reply: buildCleanSummary(stateAfter), nextQuestionKey: "confirm" };
    const question = avoidRepeat(nextQuestionForState(stateAfter, "human_handoff"), stateAfter);
    return { reply: question ? `מבין לגמרי. ${question.text}` : "מבין לגמרי. אעביר את הפנייה לאורטל.", nextQuestionKey: question?.key || "" };
  }
  if (intent === "provide_detail") {
    const hasEnoughForSummary = Boolean(
      stateAfter.phone && stateAfter.dog_name
      && (stateAfter.breed || stateAfter.service_requested || ["appointment", "human_handoff"].includes(stateAfter.conversation_stage))
    );
    if (hasEnoughForSummary) return { reply: buildCleanSummary(stateAfter), nextQuestionKey: "confirm" };
    if (stateBefore.last_bot_question === "dog_name_and_phone") {
      if (!stateBefore.dog_name && stateAfter.dog_name && !stateAfter.phone) {
        return {
          reply: `מעולה, ${stateAfter.dog_name}. מה מספר הטלפון שאורטל תוכל לחזור אליו?`,
          nextQuestionKey: "phone"
        };
      }
      if (!stateBefore.phone && stateAfter.phone && !stateAfter.dog_name) {
        return { reply: "מעולה, רשמתי את הטלפון. איך קוראים לכלב?", nextQuestionKey: "dog_name" };
      }
    }
    const question = avoidRepeat(nextQuestionForState(stateAfter, intent), stateAfter);
    return { reply: question ? `מעולה.\n${question.text}` : "מעולה, רשמתי.", nextQuestionKey: question?.key || "" };
  }
  return { reply: "אפשר לכתוב לי בקצרה מה רצית לברר — תור, מחיר או טיפול לכלב?", nextQuestionKey: "" };
}

function buildChatResponse({ message, state = {} }) {
  const stateBefore = normalizeState(state);
  const facts = extractFactsFromMessage(message, stateBefore);
  const classification = classifyIntent(message, facts, stateBefore);
  if (classification.confidence === "low") {
    const contextualReply = buildContextualClarification(stateBefore);
    if (contextualReply) {
      return {
        reply: contextualReply.reply,
        state_patch: {},
        intent: "unknown",
        confidence: "low",
        lead_ready: false,
        should_save_lead: false,
        escalate_to_ortal: Boolean(stateBefore.escalate_to_ortal),
        next_question: contextualReply.nextQuestionKey
      };
    }
    return { reply: "לא הצלחתי להבין את ההודעה. אפשר לכתוב לי שוב בקצרה מה רצית לברר — תור, מחיר או טיפול לכלב?", state_patch: {}, intent: "unknown", confidence: "low", lead_ready: false, should_save_lead: false, escalate_to_ortal: false, next_question: "" };
  }
  const stateAfter = mergeState(stateBefore, facts);
  if (classification.intent === "double_coat_warning") {
    stateAfter.status = "waiting_for_ortal";
    stateAfter.temperature = "hot";
    stateAfter.next_action = "בדיקה מקצועית של פרווה כפולה וחזרה ללקוח";
    stateAfter.escalate_to_ortal = true;
    stateAfter.service_requested = "טיפול פרווה כפולה / הוצאת פרווה מתה";
  }
  if (classification.intent === "appointment_question") {
    stateAfter.conversation_stage = "appointment";
    stateAfter.status = "waiting_for_ortal";
    stateAfter.temperature = "hot";
    stateAfter.next_action = "בדיקת זמינות ביומן וחזרה ללקוח";
    if (!stateAfter.service_requested) stateAfter.service_requested = "בדיקת תור / טיפול טיפוח";
  }
  if (["human_handoff", "frustration"].includes(classification.intent)) {
    stateAfter.conversation_stage = "human_handoff";
    stateAfter.status = "waiting_for_ortal";
    stateAfter.temperature = "hot";
    stateAfter.next_action = "חזרה אישית של אורטל ללקוח";
    stateAfter.escalate_to_ortal = true;
    if (!stateAfter.service_requested) stateAfter.service_requested = "פנייה לשיחה אישית עם אורטל";
  }
  if (classification.intent === "price_question" && !stateAfter.service_requested) {
    stateAfter.service_requested = stateAfter.breed ? serviceForCoat(stateAfter.breed, stateAfter.coat_type_key) : "בקשת מחיר לטיפול טיפוח";
  }
  stateAfter.last_intent = classification.intent === "provide_detail" && stateBefore.last_intent
    ? stateBefore.last_intent
    : classification.intent;
  const reply = buildReply({ message, stateBefore, stateAfter, intent: classification.intent, confidence: classification.confidence });
  stateAfter.last_bot_question = reply.nextQuestionKey || "";
  const confirmed = classification.intent === "confirm_send";
  const specialContext = ["appointment", "human_handoff"].includes(stateAfter.conversation_stage);
  const leadReady = Boolean(stateAfter.phone && stateAfter.service_requested && (stateAfter.dog_name || stateAfter.breed || specialContext));
  const shouldSaveLead = Boolean(confirmed && leadReady);
  const statePatch = {};
  for (const [key, value] of Object.entries(stateAfter)) {
    if (stateBefore[key] !== value) statePatch[key] = value;
  }
  return {
    reply: reply.reply,
    state_patch: statePatch,
    intent: classification.intent,
    confidence: classification.confidence,
    lead_ready: leadReady,
    should_save_lead: shouldSaveLead,
    escalate_to_ortal: Boolean(stateAfter.escalate_to_ortal),
    next_question: reply.nextQuestionKey || ""
  };
}

module.exports = {
  buildChatResponse,
  normalizeHebrewText,
  normalizeBreed,
  coatTypeLabel,
  serviceForCoat,
  extractFactsFromMessage,
  classifyIntent,
  isGibberish
};
