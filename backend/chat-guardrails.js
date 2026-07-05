const { validateChatResponse } = require("./chat-contract");

const SAFE_APPOINTMENT_REPLY = "אני אבדוק ביומן ואורטל תחזור אליך עם האפשרויות המתאימות.";
const SAFE_PRICE_REPLY = "המחיר תלוי בגודל הכלב, מצב הפרווה, קשרים וסוג הטיפול. אורטל תוכל לתת הערכה מדויקת יותר אחרי בדיקת הפרטים.";
const DOUBLE_COAT_BREEDS = /(האסקי|סמויד|פומרניאן|פומרניין|גולדן|רועה גרמני|אקיטה|קורגי)/;
const SHAVING_WORDS = /(גילוח|לגלח|מגולח|קצר ממש|לספר קצר מאוד)/;
const CONFIRMATION = /^(כן|מאשר|מאשרת|שלח|אפשר לשלוח)[.!?]?$/;
const HUMAN_HANDOFF = /(אין לי כוח לבוט|לא רוצה בוט|תביאו? לי את אורטל|אפשר לדבר עם בן אדם|נציג|אדם אמיתי)/;

function cleanText(value, limit = 1800) {
  return String(value || "").trim().replace(/\u0000/g, "").slice(0, limit);
}

function hasAppointmentPromise(reply) {
  return /(קבעתי לך|התור נקבע|יש תור היום|אפשר להגיע עכשיו|התור מאושר)/.test(reply);
}

function hasFinalPrice(reply) {
  return /(\d[\d,.]*\s*(?:₪|ש"ח|שח|שקל|שקלים)|המחיר(?:\s+הסופי)?\s+(?:הוא|יהיה)\s+\d)/.test(reply);
}

function applyChatGuardrails({ result, message, state = {} }) {
  const validation = validateChatResponse(result);
  if (!validation.valid) return null;
  const safe = {
    ...validation.value,
    reply: cleanText(validation.value.reply),
    next_question: cleanText(validation.value.next_question, 120),
    notes: cleanText(validation.value.notes, 800),
    state_patch: { ...validation.value.state_patch }
  };
  const text = cleanText(message, 2000);
  const stateAfter = { ...(state || {}), ...safe.state_patch };

  if (hasAppointmentPromise(safe.reply)) {
    safe.reply = SAFE_APPOINTMENT_REPLY;
    safe.intent = "appointment_question";
  }
  if (hasFinalPrice(safe.reply)) {
    safe.reply = SAFE_PRICE_REPLY;
    safe.intent = "price_question";
  }

  const breedContext = `${stateAfter.breed || ""} ${text}`;
  if (DOUBLE_COAT_BREEDS.test(breedContext) && SHAVING_WORDS.test(text)) {
    safe.intent = "double_coat_warning";
    safe.escalate_to_ortal = true;
    safe.reply = "בגזעים עם פרווה כפולה לא מאשרים גילוח אוטומטית, כי הוא עלול לפגוע באיכות הפרווה ובהגנה שלה. אורטל צריכה לראות את מצב הפרווה ולהחליט על הטיפול המקצועי המתאים.";
    safe.next_question = stateAfter.phone ? "" : "phone";
    safe.state_patch.status = "waiting_for_ortal";
    safe.state_patch.temperature = "hot";
    safe.state_patch.next_action = "בדיקה מקצועית של פרווה כפולה וחזרה ללקוח";
    safe.state_patch.escalate_to_ortal = true;
  }

  if (safe.intent === "human_handoff" || HUMAN_HANDOFF.test(text)) {
    safe.intent = "human_handoff";
    safe.escalate_to_ortal = true;
    safe.state_patch.status = "waiting_for_ortal";
    safe.state_patch.temperature = "hot";
    safe.state_patch.next_action = "חזרה אישית של אורטל ללקוח";
    safe.state_patch.conversation_stage = "human_handoff";
    safe.state_patch.escalate_to_ortal = true;
    if (!stateAfter.service_requested) safe.state_patch.service_requested = "פנייה לשיחה אישית עם אורטל";
    safe.reply = stateAfter.phone
      ? "הבנתי. אעביר את הפנייה לאורטל כדי שתחזור אליך אישית."
      : "הבנתי. כדי שאורטל תחזור אליך אישית, מה מספר הטלפון לחזרה?";
    safe.next_question = stateAfter.phone ? "" : "phone";
  }

  const finalState = { ...stateAfter, ...safe.state_patch };
  const specialContext = ["appointment", "human_handoff"].includes(finalState.conversation_stage);
  safe.lead_ready = Boolean(
    finalState.phone
    && finalState.service_requested
    && (finalState.dog_name || finalState.breed || specialContext)
  );
  safe.should_save_lead = Boolean(
    safe.should_save_lead
    && CONFIRMATION.test(text)
    && finalState.phone
    && finalState.service_requested
  );
  return safe;
}

module.exports = {
  SAFE_APPOINTMENT_REPLY,
  SAFE_PRICE_REPLY,
  applyChatGuardrails
};
