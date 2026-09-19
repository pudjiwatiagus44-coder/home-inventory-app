export type DoubaoCredentialSource = "PERSONAL" | "PLATFORM";

export type DoubaoCredentialStatus =
  | "ACTIVE"
  | "QUOTA_EXHAUSTED"
  | "AUTH_INVALID";

export type ResolvedDoubaoCredential = {
  source: DoubaoCredentialSource;
  apiKey: string;
  revision: string | null;
};

export type DoubaoCredentialRequest = {
  apiKey: string;
};

export type DoubaoCredentialStatusResponse = {
  configured: boolean;
  enabled: boolean;
  status: DoubaoCredentialStatus | null;
  lastFour: string | null;
  lastVerifiedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
};

export type DoubaoCredentialValidationErrorCode =
  | "TEXT_VALIDATION_FAILED"
  | "VISION_VALIDATION_FAILED";

export function parseDoubaoCredentialRequest(
  value: unknown,
): DoubaoCredentialRequest {
  if (!isRecord(value) || Object.keys(value).length !== 1) {
    throw new Error("request must contain only apiKey");
  }

  const apiKey = value.apiKey;
  if (typeof apiKey !== "string") {
    throw new Error("apiKey must be a string");
  }

  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new Error("apiKey must contain 1 to 512 characters");
  }

  return { apiKey: trimmed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
