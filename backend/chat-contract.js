const ALLOWED_INTENTS = Object.freeze([
  "small_talk",
  "appointment_question",
  "price_question",
  "grooming_info",
  "duration_question",
  "service_includes_question",
  "human_handoff",
  "frustration",
  "provide_detail",
  "double_coat_warning",
  "unknown"
]);

const ALLOWED_CONFIDENCE = Object.freeze(["high", "medium", "low"]);

const STATE_PATCH_FIELDS = Object.freeze({
  customer_name: "string",
  customer_city: "string",
  phone: "string",
  dog_name: "string",
  breed: "string",
  coat_type: "string",
  coat_type_key: "string",
  coat_condition: "string",
  service_requested: "string",
  medical_notes: "string",
  behavior_notes: "string",
  preferred_date: "string",
  is_returning_customer: "string",
  notes: "string",
  status: "string",
  temperature: "string",
  next_action: "string",
  conversation_stage: "string",
  last_intent: "string",
  last_bot_question: "string",
  summary_presented: "boolean",
  escalate_to_ortal: "boolean"
});

const statePatchProperties = Object.fromEntries(
  Object.entries(STATE_PATCH_FIELDS).map(([key, type]) => [key, { type }])
);

const CHAT_RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "intent",
    "confidence",
    "state_patch",
    "next_question",
    "lead_ready",
    "should_save_lead",
    "escalate_to_ortal",
    "notes"
  ],
  properties: {
    reply: { type: "string" },
    intent: { type: "string", enum: ALLOWED_INTENTS },
    confidence: { type: "string", enum: ALLOWED_CONFIDENCE },
    state_patch: {
      type: "object",
      additionalProperties: false,
      properties: statePatchProperties
    },
    next_question: { type: "string" },
    lead_ready: { type: "boolean" },
    should_save_lead: { type: "boolean" },
    escalate_to_ortal: { type: "boolean" },
    notes: { type: "string" }
  }
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateChatResponse(value) {
  if (!isPlainObject(value)) return { valid: false, error: "response-not-object" };
  const allowedTopLevel = new Set(CHAT_RESPONSE_SCHEMA.required);
  if (Object.keys(value).some((key) => !allowedTopLevel.has(key))) {
    return { valid: false, error: "response-has-unknown-fields" };
  }
  for (const field of CHAT_RESPONSE_SCHEMA.required) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      return { valid: false, error: `response-missing-${field}` };
    }
  }
  if (typeof value.reply !== "string" || !value.reply.trim()) return { valid: false, error: "invalid-reply" };
  if (!ALLOWED_INTENTS.includes(value.intent)) return { valid: false, error: "invalid-intent" };
  if (!ALLOWED_CONFIDENCE.includes(value.confidence)) return { valid: false, error: "invalid-confidence" };
  if (!isPlainObject(value.state_patch)) return { valid: false, error: "invalid-state-patch" };
  for (const [key, fieldValue] of Object.entries(value.state_patch)) {
    const expectedType = STATE_PATCH_FIELDS[key];
    if (!expectedType || typeof fieldValue !== expectedType) {
      return { valid: false, error: `invalid-state-patch-${key}` };
    }
  }
  if (typeof value.next_question !== "string") return { valid: false, error: "invalid-next-question" };
  if (typeof value.lead_ready !== "boolean") return { valid: false, error: "invalid-lead-ready" };
  if (typeof value.should_save_lead !== "boolean") return { valid: false, error: "invalid-should-save" };
  if (typeof value.escalate_to_ortal !== "boolean") return { valid: false, error: "invalid-escalation" };
  if (typeof value.notes !== "string") return { valid: false, error: "invalid-notes" };
  return { valid: true, value };
}

module.exports = {
  ALLOWED_INTENTS,
  ALLOWED_CONFIDENCE,
  STATE_PATCH_FIELDS,
  CHAT_RESPONSE_SCHEMA,
  validateChatResponse
};
