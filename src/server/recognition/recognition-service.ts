import { randomUUID } from "node:crypto";

import { createThumbnail } from "../photos/thumbnail";
import type { PhotoRepository } from "../photos/photo-repository";
import type { PhotoStore } from "../photos/photo-store";
import {
  DoubaoApiKeyMissingError,
  type DoubaoVisionClient,
} from "./doubao-vision";

export type RecognitionOutcome = {
  mode: "name" | "expiry" | "photo";
  recognized: boolean;
  name?: string | null;
  note?: string | null;
  expireDate?: string | null;
  thumbnailId?: string | null;
};

export type RecognitionServiceDependencies = {
  loadHouseholdIdForUser: (
    userId: string,
    householdId?: string,
  ) => Promise<string | null>;
  photoRepository: PhotoRepository;
  photoStore: PhotoStore;
  doubaoVision: DoubaoVisionClient;
};

export function createRecognitionService(
  deps: RecognitionServiceDependencies,
) {
  async function loadHouseholdId(userId: string, householdId?: string) {
    const resolvedHouseholdId = await deps.loadHouseholdIdForUser(
      userId,
      householdId,
    );

    if (!resolvedHouseholdId) {
      throw new Error("No household found for current user");
    }

    return resolvedHouseholdId;
  }

  return {
    async recognizeForCurrentUser(input: {
      userId: string;
      mode: "name" | "expiry" | "photo";
      jpegBuffer: Buffer;
      householdId?: string;
    }): Promise<RecognitionOutcome> {
      const householdId = await loadHouseholdId(
        input.userId,
        input.householdId,
      );

      if (input.mode === "photo") {
        const photoKey = `photo_${randomUUID()}.jpg`;
        const thumbnail = createThumbnail(input.jpegBuffer);
        await deps.photoStore.save(photoKey, thumbnail);
        await deps.photoRepository.createPendingPhoto({
          householdId,
          createdBy: input.userId,
          photoKey,
        });

        return {
          mode: "photo",
          recognized: true,
          thumbnailId: photoKey,
        };
      }

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

      const result = await deps.doubaoVision.recognizeItemDetails(input.jpegBuffer);

      if (!result.ok) {
        if (result.reason === "api_key_missing") {
          throw new DoubaoApiKeyMissingError();
        }

        return {
          mode: "name",
          recognized: false,
          name: null,
          note: null,
          thumbnailId: photoKey,
        };
      }

      return {
        mode: "name",
        recognized: true,
        name: result.value.name,
        note: result.value.note,
        thumbnailId: photoKey,
      };
    },

    async attachPhotoToItem(input: {
      userId: string;
      itemId: string;
      photoKey: string;
      householdId?: string;
    }) {
      const householdId = await loadHouseholdId(
        input.userId,
        input.householdId,
      );
      return deps.photoRepository.attachPhotoToItem({
        itemId: input.itemId,
        householdId,
        photoKey: input.photoKey,
        userId: input.userId,
      });
    },

    async getItemPhoto(input: {
      userId: string;
      itemId: string;
      householdId?: string;
    }) {
      const householdId = await loadHouseholdId(
        input.userId,
        input.householdId,
      );
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

    async deleteItemPhoto(input: {
      userId: string;
      itemId: string;
      householdId?: string;
    }) {
      const householdId = await loadHouseholdId(
        input.userId,
        input.householdId,
      );
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
