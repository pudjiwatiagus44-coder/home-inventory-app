import { randomUUID } from "node:crypto";

import type { PhotoRepository } from "./photo-repository";
import type { PhotoStore } from "./photo-store";
import { createMediumPhoto } from "./thumbnail";

export type AreaLocationPhotoContext = {
  householdId: string;
  role: string;
  areaIds: string[];
  locationIds: string[];
};

export type AreaLocationPhotoServiceDependencies = {
  loadDashboardForUser: (
    userId: string,
    householdId?: string,
  ) => Promise<AreaLocationPhotoContext | null>;
  photoRepository: Partial<PhotoRepository>;
  photoStore: Partial<PhotoStore>;
};

export class AreaLocationPhotoPermissionError extends Error {
  constructor() {
    super("只读成员不能修改照片");
    this.name = "AreaLocationPhotoPermissionError";
  }
}

export class AreaLocationPhotoNotFoundError extends Error {
  constructor() {
    super("区域或位置不存在");
    this.name = "AreaLocationPhotoNotFoundError";
  }
}

export function createAreaLocationPhotoService(
  deps: AreaLocationPhotoServiceDependencies,
) {
  async function loadContext(userId: string, householdId?: string) {
    const context = await deps.loadDashboardForUser(userId, householdId);
    if (!context) {
      throw new AreaLocationPhotoNotFoundError();
    }
    if (context.role === "readonly") {
      throw new AreaLocationPhotoPermissionError();
    }
    return context;
  }

  function assertArea(context: AreaLocationPhotoContext, areaId: string) {
    if (!context.areaIds.includes(areaId)) {
      throw new AreaLocationPhotoNotFoundError();
    }
  }

  function assertLocation(
    context: AreaLocationPhotoContext,
    locationId: string,
  ) {
    if (!context.locationIds.includes(locationId)) {
      throw new AreaLocationPhotoNotFoundError();
    }
  }

  return {
    async uploadAreaPhoto(input: {
      userId: string;
      areaId: string;
      jpegBuffer: Buffer;
      householdId?: string;
    }) {
      const context = await loadContext(input.userId, input.householdId);
      assertArea(context, input.areaId);
      const photoKey = `area_${randomUUID()}.jpg`;
      const buffer = createMediumPhoto(input.jpegBuffer);
      await deps.photoStore.save?.(photoKey, buffer);
      const result = await deps.photoRepository.updateAreaPhotoKey?.({
        areaId: input.areaId,
        householdId: context.householdId,
        photoKey,
      });
      if (!result) {
        await deps.photoStore.delete?.(photoKey);
        throw new AreaLocationPhotoNotFoundError();
      }
      if (result.previousPhotoKey) {
        await deps.photoStore.delete?.(result.previousPhotoKey);
      }
      return { photoKey };
    },

    async getAreaPhoto(input: {
      userId: string;
      areaId: string;
      householdId?: string;
    }) {
      const context = await loadContext(input.userId, input.householdId);
      assertArea(context, input.areaId);
      const photoKey = await deps.photoRepository.getAreaPhotoKey?.({
        areaId: input.areaId,
        householdId: context.householdId,
      });
      if (!photoKey) return null;
      const buffer = await deps.photoStore.read?.(photoKey);
      return buffer ? { photoKey, buffer } : null;
    },

    async deleteAreaPhoto(input: {
      userId: string;
      areaId: string;
      householdId?: string;
    }) {
      const context = await loadContext(input.userId, input.householdId);
      assertArea(context, input.areaId);
      const photoKey = await deps.photoRepository.clearAreaPhotoKey?.({
        areaId: input.areaId,
        householdId: context.householdId,
      });
      if (photoKey) {
        await deps.photoStore.delete?.(photoKey);
      }
    },

    async uploadLocationPhoto(input: {
      userId: string;
      locationId: string;
      jpegBuffer: Buffer;
      householdId?: string;
    }) {
      const context = await loadContext(input.userId, input.householdId);
      assertLocation(context, input.locationId);
      const photoKey = `location_${randomUUID()}.jpg`;
      const buffer = createMediumPhoto(input.jpegBuffer);
      await deps.photoStore.save?.(photoKey, buffer);
      const result = await deps.photoRepository.updateLocationPhotoKey?.({
        locationId: input.locationId,
        householdId: context.householdId,
        photoKey,
      });
      if (!result) {
        await deps.photoStore.delete?.(photoKey);
        throw new AreaLocationPhotoNotFoundError();
      }
      if (result.previousPhotoKey) {
        await deps.photoStore.delete?.(result.previousPhotoKey);
      }
      return { photoKey };
    },

    async getLocationPhoto(input: {
      userId: string;
      locationId: string;
      householdId?: string;
    }) {
      const context = await loadContext(input.userId, input.householdId);
      assertLocation(context, input.locationId);
      const photoKey = await deps.photoRepository.getLocationPhotoKey?.({
        locationId: input.locationId,
        householdId: context.householdId,
      });
      if (!photoKey) return null;
      const buffer = await deps.photoStore.read?.(photoKey);
      return buffer ? { photoKey, buffer } : null;
    },

    async deleteLocationPhoto(input: {
      userId: string;
      locationId: string;
      householdId?: string;
    }) {
      const context = await loadContext(input.userId, input.householdId);
      assertLocation(context, input.locationId);
      const photoKey = await deps.photoRepository.clearLocationPhotoKey?.({
        locationId: input.locationId,
        householdId: context.householdId,
      });
      if (photoKey) {
        await deps.photoStore.delete?.(photoKey);
      }
    },

    async listAreaPhotoKeys(input: {
      userId: string;
      areaId: string;
      householdId?: string;
    }) {
      const context = await loadContext(input.userId, input.householdId);
      assertArea(context, input.areaId);
      const areaKey = await deps.photoRepository.getAreaPhotoKey?.({
        areaId: input.areaId,
        householdId: context.householdId,
      });
      const locationKeys = await deps.photoRepository.listLocationPhotoKeysForArea?.({
        areaId: input.areaId,
        householdId: context.householdId,
      });
      return [...(areaKey ? [areaKey] : []), ...(locationKeys ?? [])];
    },

    async listLocationPhotoKeys(input: {
      userId: string;
      locationId: string;
      householdId?: string;
    }) {
      const context = await loadContext(input.userId, input.householdId);
      assertLocation(context, input.locationId);
      const key = await deps.photoRepository.getLocationPhotoKey?.({
        locationId: input.locationId,
        householdId: context.householdId,
      });
      return key ? [key] : [];
    },

    async deletePhotoFiles(keys: string[]) {
      for (const key of keys) {
        await deps.photoStore.delete?.(key);
      }
    },
  };
}
