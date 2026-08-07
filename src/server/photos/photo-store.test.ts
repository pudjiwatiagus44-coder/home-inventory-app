import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createLocalPhotoStore,
  InvalidPhotoKeyError,
} from "./photo-store";

describe("local photo store", () => {
  it("saves, reads and deletes a photo by key", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "photos-"));
    const store = createLocalPhotoStore(dir);
    const buffer = Buffer.from("fake-jpeg");

    await store.save("photo_abc.jpg", buffer);
    await expect(store.read("photo_abc.jpg")).resolves.toEqual(buffer);

    await store.delete("photo_abc.jpg");
    await expect(store.read("photo_abc.jpg")).resolves.toBeNull();
  });

  it("returns null for a missing photo", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "photos-"));
    const store = createLocalPhotoStore(dir);

    await expect(store.read("missing.jpg")).resolves.toBeNull();
  });

  it("rejects unsafe photo keys", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "photos-"));
    const store = createLocalPhotoStore(dir);

    await expect(store.save("../evil.jpg", Buffer.from("x"))).rejects.toBeInstanceOf(
      InvalidPhotoKeyError,
    );
  });
});
