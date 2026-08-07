import { promises as fs } from "node:fs";
import path from "node:path";

export type PhotoStore = {
  save: (photoKey: string, buffer: Buffer) => Promise<void>;
  read: (photoKey: string) => Promise<Buffer | null>;
  delete: (photoKey: string) => Promise<void>;
};

export class InvalidPhotoKeyError extends Error {
  constructor(photoKey: string) {
    super(`Invalid photo key: ${photoKey}`);
    this.name = "InvalidPhotoKeyError";
  }
}

const SAFE_PHOTO_KEY = /^[A-Za-z0-9._-]{1,200}$/;

export function createLocalPhotoStore(
  baseDir: string,
  fsImpl: typeof fs = fs,
): PhotoStore {
  function resolvePath(photoKey: string) {
    if (!SAFE_PHOTO_KEY.test(photoKey)) {
      throw new InvalidPhotoKeyError(photoKey);
    }

    const dir = path.join(baseDir, photoKey.slice(0, 2));
    return { dir, file: path.join(dir, photoKey) };
  }

  return {
    save: async (photoKey, buffer) => {
      const { dir, file } = resolvePath(photoKey);
      await fsImpl.mkdir(dir, { recursive: true });
      await fsImpl.writeFile(file, buffer);
    },
    read: async (photoKey) => {
      const { file } = resolvePath(photoKey);

      try {
        return await fsImpl.readFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    delete: async (photoKey) => {
      const { file } = resolvePath(photoKey);

      try {
        await fsImpl.unlink(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    },
  };
}
