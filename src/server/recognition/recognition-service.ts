import { randomUUID } from "node:crypto";

import { createThumbnail } from "../photos/thumbnail";
import type { PhotoRepository } from "../photos/photo-repository";
import type { PhotoStore } from "../photos/photo-store";
import {
  DoubaoApiKeyMissingError,
  type DoubaoVisionClient,
} from "./doubao-vision";

export type RecognitionOutcome = {
  mode: "name" | "expiry";
  recognized: boolean;
  name?: string | null;
  expireDate?: string | null;
  thumbnailId?: string | null;
};

export type RecognitionServiceDependencies = {
  loadHouseholdIdForUser: (userId: string) => Promise<string | null>;
  photoRepository: PhotoRepository;
  photoStore: PhotoStore;
  doubaoVision: DoubaoVisionClient;
};

export function createRecognitionService(
  deps: RecognitionServiceDependencies,
) {
  async function loadHouseholdId(userId: string) {
    const householdId = await deps.loadHouseholdIdForUser(userId);

    if (!householdId) {
      throw new Error("No household found for current user");
    }

    return householdId;
  }

  return {
    async recognizeForCurrentUser(input: {
      userId: string;
      mode: "name" | "expiry";
      jpegBuffer: Buffer;
    }): Promise<RecognitionOutcome> {
      const householdId = await loadHouseholdId(input.userId);

      if (input.mode === "expiry") {
        const result = await deps.doubaoVision.recognizeExpireDate(
          input.jpegBuffer,
        );

        if (!result.ok) {
          if (result.reason === "api_key_missing") {
            throw new DoubaoApiKeyMissingError();
          }

          return { mode: "expiry", recognized: false, expireDate: null };
        }

        return {
          mode: "expiry",
          recognized: true,
          expireDate: result.value,
        };
      }

      const photoKey = `photo_${randomUUID()}.jpg`;
      const thumbnail = createThumbnail(input.jpegBuffer);
      await deps.photoStore.save(photoKey, thumbnail);
      await deps.photoRepository.createPendingPhoto({
        householdId,
        createdBy: input.userId,
        photoKey,
      });

      const result = await deps.doubaoVision.recognizeName(input.jpegBuffer);

      if (!result.ok) {
        if (result.reason === "api_key_missing") {
          throw new DoubaoApiKeyMissingError();
        }

        return {
          mode: "name",
          recognized: false,
          name: null,
          thumbnailId: photoKey,
        };
      }

      return {
        mode: "name",
        recognized: true,
        name: result.value,
        thumbnailId: photoKey,
      };
    },

    async attachPhotoToItem(input: {
      userId: string;
      itemId: string;
      photoKey: string;
    }) {
      const householdId = await loadHouseholdId(input.userId);
      return deps.photoRepository.attachPhotoToItem({
        itemId: input.itemId,
        householdId,
        photoKey: input.photoKey,
        userId: input.userId,
      });
    },

    async getItemPhoto(input: { userId: string; itemId: string }) {
      const householdId = await loadHouseholdId(input.userId);
      const photoKey = await deps.photoRepository.getItemPhotoKey({
        itemId: input.itemId,
        householdId,
      });

      if (!photoKey) {
        return null;
      }

      const buffer = await deps.photoStore.read(photoKey);
      return buffer ? { photoKey, buffer } : null;
    },

    async deleteItemPhoto(input: { userId: string; itemId: string }) {
      const householdId = await loadHouseholdId(input.userId);
      const photoKey = await deps.photoRepository.getItemPhotoKey({
        itemId: input.itemId,
        householdId,
      });

      if (photoKey) {
        await deps.photoStore.delete(photoKey);
      }
    },

    async cleanupExpiredPendingPhotos() {
      const olderThan = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const keys = await deps.photoRepository.listExpiredPendingPhotos(
        olderThan,
      );

      for (const key of keys) {
        await deps.photoStore.delete(key);
      }
      await deps.photoRepository.deletePendingPhotos(keys);
      return keys.length;
    },
  };
}
