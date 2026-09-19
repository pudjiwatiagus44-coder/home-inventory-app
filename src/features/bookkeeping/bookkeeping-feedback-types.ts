export const BOOKKEEPING_FEEDBACK_DRAFT_FIELDS = [
  "dateTime",
  "type",
  "category",
  "amount",
  "currency",
  "payerPayee",
  "account",
  "participant",
  "tag",
  "merchant",
  "property",
  "note",
] as const;

export type RecognitionDraftSnapshot = Record<
  (typeof BOOKKEEPING_FEEDBACK_DRAFT_FIELDS)[number],
  string
>;

export const RECOGNITION_FEEDBACK_DIFFERENCES = [
  "amount",
  "category",
  "note",
  "dateTime",
  "type",
  "merchant",
  "other",
] as const;

export type RecognitionFeedbackDifference =
  (typeof RECOGNITION_FEEDBACK_DIFFERENCES)[number];

export type RecognitionFeedbackRequest = {
  feedbackId: string;
  sourceText: string;
  original: RecognitionDraftSnapshot;
  corrected: RecognitionDraftSnapshot;
  differences: RecognitionFeedbackDifference[];
  model: string;
  authorizedAt: string;
};

export type RecognitionFeedbackStoredRow = {
  id: string;
  source_text: string;
  original_result: RecognitionDraftSnapshot;
  corrected_result: RecognitionDraftSnapshot;
  differences: RecognitionFeedbackDifference[];
  model: string;
  authorized_at: string | Date;
  created_at: string | Date;
};

const REQUEST_FIELDS = [
  "feedbackId",
  "sourceText",
  "original",
  "corrected",
  "differences",
  "model",
  "authorizedAt",
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRecognitionFeedbackRequest(input: unknown): RecognitionFeedbackRequest {
  const record = requireRecord(input, "request");
  rejectUnexpectedFields(record, REQUEST_FIELDS);

  const feedbackId = requireString(record, "feedbackId");
  if (!UUID_PATTERN.test(feedbackId)) throw new Error("feedbackId must be a UUID");

  const sourceText = requireString(record, "sourceText");
  if (sourceText.length > 4_000) throw new Error("sourceText must be at most 4000 characters");

  const model = requireString(record, "model");
  if (model.length > 200) throw new Error("model must be at most 200 characters");

  const authorizedAt = requireString(record, "authorizedAt");
  if (Number.isNaN(Date.parse(authorizedAt))) throw new Error("authorizedAt must be an ISO timestamp");

  if (!Array.isArray(record.differences) || record.differences.length === 0) {
    throw new Error("differences must be a non-empty array");
  }
  const allowedDifferences = new Set<string>(RECOGNITION_FEEDBACK_DIFFERENCES);
  const differences = [...new Set(record.differences.map((value) => {
    if (typeof value !== "string" || !allowedDifferences.has(value)) {
      throw new Error("differences contains an unsupported value");
    }
    return value as RecognitionFeedbackDifference;
  }))];

  return {
    feedbackId,
    sourceText,
    original: parseDraft(record.original, "original"),
    corrected: parseDraft(record.corrected, "corrected"),
    differences,
    model,
    authorizedAt,
  };
}

function parseDraft(input: unknown, label: string): RecognitionDraftSnapshot {
  const record = requireRecord(input, label);
  rejectUnexpectedFields(record, BOOKKEEPING_FEEDBACK_DRAFT_FIELDS);
  return Object.fromEntries(
    BOOKKEEPING_FEEDBACK_DRAFT_FIELDS.map((field) => {
      if (typeof record[field] !== "string") throw new Error(`${label}.${field} must be a string`);
      return [field, record[field]];
    }),
  ) as RecognitionDraftSnapshot;
}

function requireRecord(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object`);
  }
  return input as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function rejectUnexpectedFields(
  record: Record<string, unknown>,
  allowedFields: readonly string[],
) {
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(record).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`unexpected field: ${unexpected}`);
}
