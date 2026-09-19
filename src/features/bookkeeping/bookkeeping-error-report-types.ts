export const BOOKKEEPING_ERROR_REPORT_SNAPSHOT_FIELDS = [
  "amount",
  "direction",
  "category",
  "merchant",
  "note",
  "transactionTime",
  "deletedAt",
  "source",
] as const;

export const BOOKKEEPING_ERROR_REPORT_REASONS = [
  "mistaken_delete",
  "wrong_amount",
  "wrong_category",
  "other",
  "rerecognition_replaced",
] as const;

export type BookkeepingErrorReportReason = (typeof BOOKKEEPING_ERROR_REPORT_REASONS)[number];
export type BookkeepingErrorReportSnapshot = Record<
  (typeof BOOKKEEPING_ERROR_REPORT_SNAPSHOT_FIELDS)[number],
  string
>;

export type BookkeepingErrorReportRequest = {
  reportId: string;
  localTransactionId: number;
  serverTransactionId: string | null;
  snapshot: BookkeepingErrorReportSnapshot;
  reason: BookkeepingErrorReportReason;
  note: string | null;
  authorizedAt: string;
  ocrText?: string;
  provider?: "DOUBAO" | "QWEN" | "UNKNOWN";
  model?: string;
  rerecognitionRequestId?: string;
};

const REQUEST_FIELDS = [
  "reportId",
  "localTransactionId",
  "serverTransactionId",
  "snapshot",
  "reason",
  "note",
  "authorizedAt",
] as const;
const RERECOGNITION_REQUEST_FIELDS = [
  ...REQUEST_FIELDS,
  "ocrText",
  "provider",
  "model",
  "rerecognitionRequestId",
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const BOOKKEEPING_ERROR_REPORT_MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function parseBookkeepingErrorReportRequest(input: unknown): BookkeepingErrorReportRequest {
  const record = requireRecord(input, "report");
  const isRerecognition = record.reason === "rerecognition_replaced";
  rejectUnexpectedFields(record, RERECOGNITION_REQUEST_FIELDS);
  if (!isRerecognition && [record.ocrText, record.provider, record.model, record.rerecognitionRequestId]
    .some((value) => value !== undefined && value !== "")) {
    throw new Error("unexpected field: rerecognition evidence");
  }

  const reportId = requireString(record, "reportId");
  if (!UUID_PATTERN.test(reportId)) throw new Error("reportId must be a UUID");

  const localTransactionId = record.localTransactionId;
  if (typeof localTransactionId !== "number" || !Number.isSafeInteger(localTransactionId) || localTransactionId <= 0) {
    throw new Error("localTransactionId must be a positive integer");
  }

  const serverTransactionId = record.serverTransactionId;
  if (serverTransactionId !== null && (typeof serverTransactionId !== "string" || !UUID_PATTERN.test(serverTransactionId))) {
    throw new Error("serverTransactionId must be a UUID or null");
  }

  const reason = requireString(record, "reason");
  if (!BOOKKEEPING_ERROR_REPORT_REASONS.includes(reason as BookkeepingErrorReportReason)) {
    throw new Error("reason is not supported");
  }

  const note = record.note;
  if (note !== null && (typeof note !== "string" || note.length > 1_000)) {
    throw new Error("note must be null or at most 1000 characters");
  }

  const authorizedAt = requireIsoTimestamp(record, "authorizedAt");
  const result: BookkeepingErrorReportRequest = {
    reportId,
    localTransactionId,
    serverTransactionId,
    snapshot: parseSnapshot(record.snapshot),
    reason: reason as BookkeepingErrorReportReason,
    note,
    authorizedAt,
  };
  if (!isRerecognition) return result;
  const ocrText = typeof record.ocrText === "string" && record.ocrText.length <= 12_000
    ? record.ocrText
    : invalid("ocrText must be at most 12000 characters");
  const provider = record.provider;
  if (provider !== "DOUBAO" && provider !== "QWEN" && provider !== "UNKNOWN") throw new Error("provider is not supported");
  const model = requireString(record, "model");
  if (model.length > 100) throw new Error("model must be at most 100 characters");
  const rerecognitionRequestId = requireString(record, "rerecognitionRequestId");
  if (!UUID_PATTERN.test(rerecognitionRequestId)) throw new Error("rerecognitionRequestId must be a UUID");
  return { ...result, ocrText, provider, model, rerecognitionRequestId };
}

function invalid(message: string): never {
  throw new Error(message);
}

export function validateBookkeepingErrorReportJpeg(image: Buffer) {
  if (image.length > BOOKKEEPING_ERROR_REPORT_MAX_IMAGE_BYTES) {
    throw new Error("JPEG must be at most 2MiB");
  }
  if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 ||
      image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) {
    throw new Error("image must be a complete JPEG");
  }
}

function parseSnapshot(input: unknown): BookkeepingErrorReportSnapshot {
  const snapshot = requireRecord(input, "snapshot");
  rejectUnexpectedFields(snapshot, BOOKKEEPING_ERROR_REPORT_SNAPSHOT_FIELDS);
  const parsed = Object.fromEntries(BOOKKEEPING_ERROR_REPORT_SNAPSHOT_FIELDS.map((field) => [
    field,
    requireSnapshotString(snapshot, field),
  ])) as BookkeepingErrorReportSnapshot;
  requireIsoTimestamp(parsed, "transactionTime");
  requireIsoTimestamp(parsed, "deletedAt");
  return parsed;
}

function requireRecord(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object`);
  return input as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} must be a non-empty string`);
  return value.trim();
}

function requireSnapshotString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`snapshot.${key} must be a string`);
  return value;
}

function requireIsoTimestamp(record: Record<string, unknown>, key: string): string {
  const value = requireString(record, key);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${key} must be an ISO timestamp`);
  return value;
}

function rejectUnexpectedFields(record: Record<string, unknown>, allowedFields: readonly string[]) {
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(record).find((key) => !allowed.has(key));
  if (unexpected) throw new Error(`unexpected field: ${unexpected}`);
}
