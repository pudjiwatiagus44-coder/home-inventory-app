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
  createAreaLocationPhotoService,
  AreaLocationPhotoPermissionError,
  AreaLocationPhotoNotFoundError,
} from "../../../server/photos/area-location-photo-service";
import {
  createPostgresInventoryRepository,
} from "../../../features/inventory/inventory-repository";
import { createRecognitionRateLimiter } from "../../../server/recognition/rate-limiter";
import type { createAuthService } from "../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type PhotoRouteService = ReturnType<typeof createAreaLocationPhotoService>;
type PhotoRateLimiter = ReturnType<typeof createRecognitionRateLimiter>;

export type EntityPhotoDependencies = {
  authService?: CurrentUserAuthService;
  photoService?: PhotoRouteService;
  rateLimiter?: PhotoRateLimiter;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PHOTO_LIMIT_PER_HOUR = 20;

export function createRouteAreaLocationPhotoService(
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

  return createAreaLocationPhotoService({
    loadDashboardForUser: async (userId, householdId) => {
      const dashboard = await inventoryRepository.getDashboardForUser(
        userId,
        householdId,
      );
      if (!dashboard) return null;
      return {
        householdId: dashboard.household.id,
        role: dashboard.household.role ?? "owner",
        areaIds: dashboard.areas.map((area) => area.id),
        locationIds: dashboard.locations.map((location) => location.id),
      };
    },
    photoRepository,
    photoStore,
  });
}

export function createEntityPhotoHandlers(
  entity: "area" | "location",
  dependencies: EntityPhotoDependencies = {},
) {
  const idKey = entity === "area" ? "areaId" : "locationId";
  const entityLabel = entity === "area" ? "区域" : "位置";

  return {
    async GET(
      request: NextRequest,
      context: { params: Promise<Record<string, string>> },
    ) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );
        if (!currentUser) {
          return unauthorized();
        }
        const params = await context.params;
        const entityId = params[idKey];
        const householdId =
          request.nextUrl.searchParams.get("householdId") ?? undefined;
        const service =
          dependencies.photoService ?? createRouteAreaLocationPhotoService();
        const photo =
          entity === "area"
            ? await service.getAreaPhoto({
                userId: currentUser.userId,
                areaId: entityId,
                householdId,
              })
            : await service.getLocationPhoto({
                userId: currentUser.userId,
                locationId: entityId,
                householdId,
              });
        if (!photo) {
          return NextResponse.json(
            { ok: false, message: `${entityLabel}照片不存在` },
            { status: 404 },
          );
        }
        return new NextResponse(new Uint8Array(photo.buffer), {
          headers: {
            "content-type": "image/jpeg",
            "cache-control": "private, max-age=86400",
          },
        });
      } catch (error) {
        return photoErrorResponse(error);
      }
    },

    async PUT(
      request: NextRequest,
      context: { params: Promise<Record<string, string>> },
    ) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );
        if (!currentUser) {
          return unauthorized();
        }
        const limiter =
          dependencies.rateLimiter ??
          createRecognitionRateLimiter({
            limit: PHOTO_LIMIT_PER_HOUR,
            windowMs: 60 * 60 * 1000,
          });
        if (!limiter.tryConsume(currentUser.userId)) {
          return NextResponse.json(
            { ok: false, message: "照片操作太频繁，请稍后再试" },
            { status: 429 },
          );
        }
        const params = await context.params;
        const entityId = params[idKey];
        const householdId =
          request.nextUrl.searchParams.get("householdId") ?? undefined;
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
            { ok: false, message: "图片大小需在 10MB 以内" },
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
        const service =
          dependencies.photoService ?? createRouteAreaLocationPhotoService();
        const data =
          entity === "area"
            ? await service.uploadAreaPhoto({
                userId: currentUser.userId,
                areaId: entityId,
                jpegBuffer: buffer,
                householdId,
              })
            : await service.uploadLocationPhoto({
                userId: currentUser.userId,
                locationId: entityId,
                jpegBuffer: buffer,
                householdId,
              });
        return NextResponse.json({ ok: true, data });
      } catch (error) {
        return photoErrorResponse(error);
      }
    },

    async DELETE(
      request: NextRequest,
      context: { params: Promise<Record<string, string>> },
    ) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );
        if (!currentUser) {
          return unauthorized();
        }
        const params = await context.params;
        const entityId = params[idKey];
        const householdId =
          request.nextUrl.searchParams.get("householdId") ?? undefined;
        const service =
          dependencies.photoService ?? createRouteAreaLocationPhotoService();
        if (entity === "area") {
          await service.deleteAreaPhoto({
            userId: currentUser.userId,
            areaId: entityId,
            householdId,
          });
        } else {
          await service.deleteLocationPhoto({
            userId: currentUser.userId,
            locationId: entityId,
            householdId,
          });
        }
        return NextResponse.json({ ok: true, data: null });
      } catch (error) {
        return photoErrorResponse(error);
      }
    },
  };
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, message: "Authentication required" },
    { status: 401 },
  );
}

function photoErrorResponse(error: unknown) {
  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json(
      { ok: false, message: "DATABASE_URL is required for photos" },
      { status: 501 },
    );
  }
  if (error instanceof AreaLocationPhotoPermissionError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 403 },
    );
  }
  if (error instanceof AreaLocationPhotoNotFoundError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 404 },
    );
  }
  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { ok: false, message: "Unknown photo error" },
    { status: 500 },
  );
}
