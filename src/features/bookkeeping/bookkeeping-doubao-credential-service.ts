import {
  createCredentialKeyring,
  type CredentialKeyring,
} from "./bookkeeping-doubao-credential-crypto";
import type {
  BookkeepingDoubaoCredentialRepository,
  StoredDoubaoCredential,
} from "./bookkeeping-doubao-credential-repository";
import type {
  DoubaoCredentialStatusResponse,
  DoubaoCredentialValidationErrorCode,
  ResolvedDoubaoCredential,
} from "./bookkeeping-doubao-credential-types";

type CredentialServiceEnv = NodeJS.ProcessEnv & {
  DOUBAO_API_KEY?: string;
  DOUBAO_TEXT_MODEL?: string;
  DOUBAO_TEXT_BASE_URL?: string;
  DOUBAO_VISION_MODEL?: string;
  DOUBAO_VISION_BASE_URL?: string;
};

type BookkeepingDoubaoCredentialServiceDependencies = {
  repository: BookkeepingDoubaoCredentialRepository;
  keyring?: CredentialKeyring;
  env?: CredentialServiceEnv;
  fetchImpl?: typeof fetch;
  validationTimeoutMs?: number;
  validationLogger?: (event: DoubaoValidationFailureEvent) => void;
};

type DoubaoValidationFailureEvent = {
  capability: "TEXT" | "VISION";
  endpointHost: string;
  model: string;
  providerCode: string | null;
  status: number | null;
  transportError: "timeout_or_network" | null;
};

export type ValidateAndSaveDoubaoCredentialResult =
  | { ok: true; status: DoubaoCredentialStatusResponse }
  | { ok: false; errorCode: DoubaoCredentialValidationErrorCode };

const TEXT_VALIDATION_PROMPT =
  "这是连接验证。请只回复 OK，不要处理或返回任何用户数据。";
const VISION_VALIDATION_PROMPT =
  "这是连接验证。请确认测试图片可读取并只回复 OK，不要返回其他内容。";

// 固定的 1x1 JPEG，仅用于验证视觉模型端点可用，不包含用户数据。
const VALIDATION_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSgBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIAAEAAQMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APqmgD//2Q==";

export function createBookkeepingDoubaoCredentialService({
  repository,
  keyring: injectedKeyring,
  env = process.env,
  fetchImpl = globalThis.fetch,
  validationTimeoutMs = 10_000,
  validationLogger = (event) => {
    console.warn("[bookkeeping] Doubao credential validation failed", event);
  },
}: BookkeepingDoubaoCredentialServiceDependencies) {
  const platformApiKey = env.DOUBAO_API_KEY?.trim() ?? "";
  const textModel =
    env.DOUBAO_TEXT_MODEL?.trim() ?? "doubao-seed-2-0-mini-260428";
  const textBaseUrl =
    env.DOUBAO_TEXT_BASE_URL?.trim() ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  const visionModel =
    env.DOUBAO_VISION_MODEL?.trim() ?? "doubao-1.5-vision-lite-250315";
  const visionBaseUrl =
    env.DOUBAO_VISION_BASE_URL?.trim() ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  let defaultKeyring: CredentialKeyring | undefined;

  function keyring(): CredentialKeyring {
    if (injectedKeyring) return injectedKeyring;
    defaultKeyring ??= createCredentialKeyring(env);
    return defaultKeyring;
  }

  async function getStatus(
    userId: string,
  ): Promise<DoubaoCredentialStatusResponse> {
    return toPublicStatus(await repository.findForUser(userId));
  }

  async function validateEndpoint(
    url: string,
    apiKey: string,
    body: object,
    capability: "TEXT" | "VISION",
    model: string,
  ): Promise<boolean> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error("Doubao credential validation timed out"));
          }, validationTimeoutMs);
        }),
      ]);
      if (response.ok) return true;

      let providerCode: string | null = null;
      try {
        const payload = (await response.json()) as {
          error?: { code?: unknown };
        };
        if (typeof payload.error?.code === "string") {
          providerCode = payload.error.code;
        }
      } catch {
        // Provider error bodies are optional and are never logged verbatim.
      }
      validationLogger({
        capability,
        endpointHost: new URL(url).host,
        model,
        providerCode,
        status: response.status,
        transportError: null,
      });
      return false;
    } catch {
      validationLogger({
        capability,
        endpointHost: new URL(url).host,
        model,
        providerCode: null,
        status: null,
        transportError: "timeout_or_network",
      });
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  return {
    getStatus,

    async validateAndSave(
      userId: string,
      apiKey: string,
    ): Promise<ValidateAndSaveDoubaoCredentialResult> {
      const trimmedApiKey = apiKey.trim();
      const textValid = await validateEndpoint(textBaseUrl, trimmedApiKey, {
        model: textModel,
        temperature: 0,
        messages: [{ role: "user", content: TEXT_VALIDATION_PROMPT }],
      }, "TEXT", textModel);
      if (!textValid) {
        return { ok: false, errorCode: "TEXT_VALIDATION_FAILED" };
      }

      const visionValid = await validateEndpoint(visionBaseUrl, trimmedApiKey, {
        model: visionModel,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_VALIDATION_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${VALIDATION_JPEG_BASE64}`,
                },
              },
            ],
          },
        ],
      }, "VISION", visionModel);
      if (!visionValid) {
        return { ok: false, errorCode: "VISION_VALIDATION_FAILED" };
      }

      const encrypted = keyring().encrypt(trimmedApiKey);
      const saved = await repository.saveValidatedForUser(userId, {
        encrypted,
        lastFour: trimmedApiKey.slice(-4),
      });
      return { ok: true, status: toPublicStatus(saved) };
    },

    async usePlatform(userId: string): Promise<DoubaoCredentialStatusResponse> {
      return toPublicStatus(await repository.setEnabledForUser(userId, false));
    },

    async deleteCredential(userId: string): Promise<boolean> {
      return repository.deleteForUser(userId);
    },

    async resolveForUser(userId: string): Promise<ResolvedDoubaoCredential> {
      const stored = await repository.findForUser(userId);
      if (!stored?.enabled) {
        return { source: "PLATFORM", apiKey: platformApiKey, revision: null };
      }

      return {
        source: "PERSONAL",
        apiKey: keyring().decrypt({
          ciphertext: stored.encryptedApiKey,
          nonce: stored.encryptionNonce,
          tag: stored.encryptionTag,
          keyVersion: stored.keyVersion,
        }),
        revision: stored.lastVerifiedAt,
      };
    },

    async recordProviderFailure(
      userId: string,
      revision: string,
      reason: string,
    ): Promise<void> {
      const status = statusForProviderFailure(reason);
      if (!status) return;

      const stored = await repository.findForUser(userId);
      if (!stored?.enabled || stored.lastVerifiedAt !== revision) return;

      await repository.recordFailureForUser(userId, revision, status, reason);
    },

    async recordProviderSuccess(userId: string, revision: string): Promise<void> {
      const stored = await repository.findForUser(userId);
      if (!stored?.enabled || stored.lastVerifiedAt !== revision) return;

      await repository.recordSuccessForUser(userId, revision);
    },
  };
}

function toPublicStatus(
  stored: StoredDoubaoCredential | null,
): DoubaoCredentialStatusResponse {
  if (!stored) {
    return {
      configured: false,
      enabled: false,
      status: null,
      lastFour: null,
      lastVerifiedAt: null,
      lastSuccessAt: null,
      lastErrorCode: null,
    };
  }

  return {
    configured: true,
    enabled: stored.enabled,
    status: stored.status,
    lastFour: stored.lastFour,
    lastVerifiedAt: stored.lastVerifiedAt,
    lastSuccessAt: stored.lastSuccessAt,
    lastErrorCode: stored.lastErrorCode,
  };
}

function statusForProviderFailure(
  reason: string,
): "QUOTA_EXHAUSTED" | "AUTH_INVALID" | null {
  if (
    reason === "rate_limit" ||
    reason === "quota_exhausted" ||
    reason === "insufficient_quota"
  ) {
    return "QUOTA_EXHAUSTED";
  }
  if (
    reason === "auth_invalid" ||
    reason === "invalid_api_key" ||
    reason === "authentication_error" ||
    reason === "unauthorized"
  ) {
    return "AUTH_INVALID";
  }
  return null;
}
