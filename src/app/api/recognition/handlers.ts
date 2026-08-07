import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../auth/route-helpers";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
  type PostgresQueryClientFactoryOptions,
} from "../../../server/db/postgres";
import { createPostgresPhotoRepository } from "../../../server/photos/photo-repository";
import { createLocalPhotoStore } from "../../../server/photos/photo-store";
import { isJpeg } from "../../../server/photos/thumbnail";
import {
  createDoubaoVisionClient,
  DoubaoApiKeyMissingError,
} from "../../../server/recognition/doubao-vision";
import { createRecognitionRateLimiter } from "../../../server/recognition/rate-limiter";
import { createRecognitionService } from "../../../server/recognition/recognition-service";
import { createPostgresInventoryRepository } from "../../../features/inventory/inventory-repository";
import type { createAuthService } from "../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type RecognitionRouteService = ReturnType<typeof createRecognitionService>;

export type RecognitionDependencies = {
  authService?: CurrentUserAuthService;
  recognitionService?: RecognitionRouteService;
  rateLimiter?: ReturnType<typeof createRecognitionRateLimiter>;
};

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_PER_MINUTE = 10;

export function createRouteRecognitionService(
  env: PostgresEnv = process.env,
  overrides: PostgresQueryClientFactoryOptions = {},
) {
  const queryClient = createPostgresQueryClientFromEnv(env, {
    createPool: overrides.createPool,
  });
  const inventoryRepository = createPostgresInventoryRepository(queryClient);
  const photoRepository = createPostgresPhotoRepository(queryClient);
  const photoStore = createLocalPhotoStore(
    env.PHOTO_STORAGE_DIR?.trim() ||
      path.join(process.cwd(), "data", "photos"),
  );
  const doubaoVision = createDoubaoVisionClient({
    apiKey: env.DOUBAO_API_KEY,
    model: env.DOUBAO_VISION_MODEL,
  });

  return createRecognitionService({
    loadHouseholdIdForUser: async (userId) => {
      const dashboard = await inventoryRepository.getDashboardForUser(userId);
      return dashboard?.household.id ?? null;
    },
    photoRepository,
    photoStore,
    doubaoVision,
  });
}

export function createRecognitionHandlers(
  dependencies: RecognitionDependencies = {},
) {
  return {
    async POST(request: NextRequest) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );

        if (!currentUser) {
          return NextResponse.json(
            { ok: false, message: "Authentication required" },
            { status: 401 },
          );
        }

        const limiter =
          dependencies.rateLimiter ??
          createRecognitionRateLimiter({
            limit: RATE_LIMIT_PER_MINUTE,
            windowMs: 60_000,
          });

        if (!limiter.tryConsume(currentUser.userId)) {
          return NextResponse.json(
            { ok: false, message: "识别太频繁，请稍后再试" },
            { status: 429 },
          );
        }

        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof Blob)) {
          return NextResponse.json(
            { ok: false, message: "请上传图片" },
            { status: 400 },
          );
        }

        if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { ok: false, message: "图片大小需在 4MB 以内" },
            { status: 400 },
          );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        if (!isJpeg(buffer)) {
          return NextResponse.json(
            { ok: false, message: "仅支持 JPEG 图片" },
            { status: 400 },
          );
        }

        const mode =
          request.nextUrl.searchParams.get("mode") === "expiry"
            ? "expiry"
            : "name";
        const service =
          dependencies.recognitionService ?? createRouteRecognitionService();
        const data = await service.recognizeForCurrentUser({
          userId: currentUser.userId,
          mode,
          jpegBuffer: buffer,
        });

        await service.cleanupExpiredPendingPhotos().catch(() => undefined);

        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return createRecognitionErrorResponse(error);
      }
    },
  };
}

function createRecognitionErrorResponse(error: unknown) {
  if (error instanceof DoubaoApiKeyMissingError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 501 },
    );
  }

  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json(
      { ok: false, message: "DATABASE_URL is required for photo recognition" },
      { status: 501 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, message: "Unknown recognition error" },
    { status: 500 },
  );
}
