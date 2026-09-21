import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../auth/route-helpers";
import type { createAuthService } from "../../../../server/auth/auth-service";
import { createPostgresQueryClientFromEnv } from "../../../../server/db/postgres";
import {
  createBookkeepingVisionRerecognitionService,
  type RerecognitionInput,
} from "../../../../features/bookkeeping/bookkeeping-vision-rerecognition-service";
import { createPostgresBookkeepingDoubaoCredentialRepository } from "../../../../features/bookkeeping/bookkeeping-doubao-credential-repository";
import { createBookkeepingDoubaoCredentialService } from "../../../../features/bookkeeping/bookkeeping-doubao-credential-service";
import { createDeepSeekCredentialService } from "../../../../features/bookkeeping/deepseek-credential-service";
import { createPostgresDeepSeekCredentialRepository } from "../../../../features/bookkeeping/deepseek-credential-repository";

type CurrentUserAuthService = Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
type Service = ReturnType<typeof createBookkeepingVisionRerecognitionService>;
export type RerecognizeDependencies = {
  authService?: CurrentUserAuthService;
  service?: Service;
  serviceFactory?: typeof createBookkeepingVisionRerecognitionService;
  credentialService?: Pick<ReturnType<typeof createBookkeepingDoubaoCredentialService>, "resolveForUser" | "recordProviderFailure" | "recordProviderSuccess">;
  deepseekCredentialService?: Pick<ReturnType<typeof createDeepSeekCredentialService>, "decryptForProvider">;
  env?: Record<string, string | undefined>;
};
const MAX_BODY_BYTES = 2 * 1024 * 1024 + 64 * 1024;

export function createBookkeepingRerecognizeHandlers(deps: RerecognizeDependencies = {}) {
  return {
    async POST(request: NextRequest) {
      const token = process.env.BOOKKEEPING_API_TOKEN?.trim();
      if (process.env.NODE_ENV === "production" && !token) {
        return NextResponse.json({ ok: false, message: "Bookkeeping API is not enabled" }, { status: 503 });
      }
      if (token && request.headers.get("X-Bookkeeping-Token") !== token) {
        return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
      }
      const user = await getCurrentUserFromRequest(request, deps.authService).catch(() => null);
      if (!user) return NextResponse.json({ ok: false, message: "Authentication required" }, { status: 401 });
      let parsed: { input: RerecognitionInput; image: Buffer };
      try {
        parsed = await parseMultipart(request);
      } catch (error) {
        const status = error instanceof BodyTooLargeError ? 413 : 400;
        return NextResponse.json({ ok: false, message: status === 413 ? "Image is too large" : "Invalid rerecognition request" }, { status });
      }
      let credentialSource: "PERSONAL" | "PLATFORM" = "PLATFORM";
      let credentialRevision: string | null = null;
      let credentialService = deps.credentialService;
      if (!credentialService && user && parsed.input.provider === "DOUBAO") {
        const client = createPostgresQueryClientFromEnv(deps.env ?? process.env);
        credentialService = createBookkeepingDoubaoCredentialService({
          repository: createPostgresBookkeepingDoubaoCredentialRepository(client),
          env: process.env,
        });
      }
      let resolvedKey: string | undefined;
      let deepseekApiKey: string | undefined;
      let resolvedModel: "doubao-seed-2-0-mini-260428" | "doubao-seed-2-0-lite-260428" | undefined;
      if (credentialService && user && parsed.input.provider === "DOUBAO") {
        let resolved;
        try {
          resolved = await credentialService.resolveForUser(user.userId);
        } catch {
          return NextResponse.json({
            ok: false,
            message: "Personal Doubao credential must be revalidated",
            errorCode: "PERSONAL_MODEL_REVALIDATION_REQUIRED",
          }, { status: 409 });
        }
        credentialSource = resolved.source;
        credentialRevision = resolved.revision;
        resolvedKey = resolved.source === "PERSONAL" ? resolved.apiKey : undefined;
        const model = "model" in resolved ? resolved.model : null;
        resolvedModel = resolved.source === "PERSONAL" &&
          (model === "doubao-seed-2-0-mini-260428" || model === "doubao-seed-2-0-lite-260428")
          ? model
          : undefined;
      }
      if (parsed.input.provider === "DEEPSEEK") {
        let deepseekCredentialService = deps.deepseekCredentialService;
        if (!deepseekCredentialService) {
          try {
            deepseekCredentialService = createDeepSeekCredentialService({
              database: createPostgresDeepSeekCredentialRepository(createPostgresQueryClientFromEnv(deps.env ?? process.env)),
              env: process.env,
            });
          } catch {
            return deepseekFailure("configuration_missing");
          }
        }
        try {
          deepseekApiKey = await deepseekCredentialService.decryptForProvider(user.userId) ?? undefined;
        } catch {
          return deepseekFailure("configuration_missing");
        }
        if (!deepseekApiKey) return deepseekFailure("api_key_missing");
      }
      const service = deps.service ?? (deps.serviceFactory ?? createBookkeepingVisionRerecognitionService)({
        doubaoApiKey: resolvedKey,
        doubaoModel: resolvedModel,
        deepseekApiKey,
      });
      const result = await service.rerecognize({ ...parsed.input, signal: request.signal }, parsed.image);
      if (!result.ok) {
        console.warn("bookkeeping rerecognition failed", {
          provider: parsed.input.provider,
          reason: result.reason,
        });
        if (user && credentialSource === "PERSONAL" && credentialRevision && credentialService && (result.reason === "auth_invalid" || result.reason === "quota_exhausted")) {
          await credentialService.recordProviderFailure(user.userId, credentialRevision, result.reason).catch(() => undefined);
          return NextResponse.json({ ok: false, message: result.reason, errorCode: result.reason === "auth_invalid" ? "PERSONAL_AUTH_INVALID" : "PERSONAL_QUOTA_EXHAUSTED", credentialSource }, { status: result.reason === "auth_invalid" ? 401 : 403 });
        }
        if (parsed.input.provider === "DEEPSEEK") return deepseekFailure(result.reason);
        const status = result.reason === "quota_exhausted" ? 403 : result.reason === "rate_limit" ? 429 : 502;
        return NextResponse.json({ ok: false, message: result.reason, ...(credentialSource === "PERSONAL" ? { credentialSource } : {}) }, { status });
      }
      if (user && credentialSource === "PERSONAL" && credentialRevision && credentialService) {
        await credentialService.recordProviderSuccess(user.userId, credentialRevision).catch(() => undefined);
      }
      return NextResponse.json({ ok: true, drafts: result.drafts, provider: result.provider, model: result.model, ...(credentialSource === "PERSONAL" ? { credentialSource } : {}) });
    },
  };
}

class BodyTooLargeError extends Error {}

// 100 个内置子分类 + 用户自定义子分类的层级合同上限；understand 端点未设数量上限，这里保持同等宽松度。
const MAX_CATEGORIES = 200;
const LEGACY_CATEGORY_KEYS = "keywords,name,type";
const HIERARCHICAL_CATEGORY_KEYS = "childName,description,keywords,parentName,stableKey,type";
const HIERARCHICAL_CATEGORY_KEYS_WITH_NAME = "childName,description,keywords,name,parentName,stableKey,type";

async function parseMultipart(request: NextRequest) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) throw new Error("invalid content type");
  const length = request.headers.get("content-length");
  if (length && (/^\d+$/.test(length) ? Number(length) > MAX_BODY_BYTES : true)) throw new BodyTooLargeError();
  const bytes = await readBounded(request);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: bytes.buffer as ArrayBuffer,
  }).formData();
  const entries = [...form.entries()];
  if (entries.length !== 2 || !form.has("request") || !form.has("image")) throw new Error("invalid fields");
  const metadata = form.get("request");
  const image = form.get("image");
  if (typeof metadata !== "string" || !image || typeof image === "string") throw new Error("invalid multipart");
  const input = parseMetadata(JSON.parse(metadata));
  const imageBuffer = Buffer.from(await image.arrayBuffer());
  if (imageBuffer.length > 2 * 1024 * 1024 || imageBuffer.length < 4 ||
      imageBuffer[0] !== 0xff || imageBuffer[1] !== 0xd8 ||
      imageBuffer.at(-2) !== 0xff || imageBuffer.at(-1) !== 0xd9) throw new Error("invalid jpeg");
  return { input, image: imageBuffer };
}

async function readBounded(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function parseMetadata(value: unknown): RerecognitionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid request");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["requestId", "ocrText", "capturedAt", "categories", "provider"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new Error("unexpected field");
  if (typeof record.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.requestId)) throw new Error("invalid requestId");
      if (typeof record.ocrText !== "string" || record.ocrText.length > 12_000) throw new Error("invalid ocrText");
      if (typeof record.capturedAt !== "string" || Number.isNaN(Date.parse(record.capturedAt))) throw new Error("invalid capturedAt");
      if (record.provider !== "DOUBAO" && record.provider !== "QWEN" && record.provider !== "DEEPSEEK") throw new Error("invalid provider");
      if (!Array.isArray(record.categories) || record.categories.length > MAX_CATEGORIES) throw new Error("invalid categories");
      const categories = record.categories.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid category");
        const category = item as Record<string, unknown>;
        const keys = Object.keys(category).sort().join(",");
        if (keys === LEGACY_CATEGORY_KEYS) {
          if (typeof category.name !== "string" || typeof category.type !== "string" || typeof category.keywords !== "string" ||
              category.name.length > 100 || category.type.length > 30 || category.keywords.length > 500) throw new Error("invalid category");
          return { name: category.name, type: category.type, keywords: category.keywords };
        }
        if (keys === HIERARCHICAL_CATEGORY_KEYS || keys === HIERARCHICAL_CATEGORY_KEYS_WITH_NAME) {
          const { childName, description, keywords, name, parentName, stableKey, type } = category;
          if (typeof childName !== "string" || typeof description !== "string" || typeof keywords !== "string" ||
              typeof parentName !== "string" || typeof stableKey !== "string" || typeof type !== "string") {
            throw new Error("invalid category");
          }
          if (childName.length > 100 || description.length > 500 || keywords.length > 500 ||
              parentName.length > 100 || stableKey.length > 120 ||
              type.length > 30) throw new Error("invalid category");
          if (name !== undefined && (typeof name !== "string" || name.length > 100)) throw new Error("invalid category");
          const trimmedChildName = childName.trim();
          if (!trimmedChildName) throw new Error("invalid category");
          // 层级合同与 understand 端点口径一致：模型候选使用子分类名，父分类仅供去歧义上下文。
          return { name: trimmedChildName, type, keywords };
        }
        throw new Error("invalid category");
      });
      return { requestId: record.requestId, ocrText: record.ocrText, capturedAt: record.capturedAt, categories, provider: record.provider };
}

function deepseekFailure(reason: string) {
  const errorCode = reason === "api_key_missing" ? "DEEPSEEK_CREDENTIAL_NOT_CONFIGURED" :
    reason === "auth_invalid" ? "DEEPSEEK_AUTH_INVALID" :
    reason === "timeout" ? "DEEPSEEK_TIMEOUT" :
    reason === "invalid_response" ? "DEEPSEEK_INVALID_JSON" : "DEEPSEEK_REQUEST_FAILED";
  const status = errorCode === "DEEPSEEK_CREDENTIAL_NOT_CONFIGURED" ? 409 :
    errorCode === "DEEPSEEK_AUTH_INVALID" ? 401 :
      errorCode === "DEEPSEEK_TIMEOUT" ? 504 : 502;
  return NextResponse.json({ ok: false, message: errorCode.toLowerCase(), errorCode }, { status });
}
