import { describe, expect, it } from "vitest";

import {
  clearSavedEmail,
  getSavedEmail,
  saveEmail,
} from "./remembered-email";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  } satisfies StorageLike;
}

describe("remembered email helpers", () => {
  it("saves and loads the email", () => {
    const storage = createMemoryStorage();

    saveEmail("user@example.com", storage);

    expect(getSavedEmail(storage)).toBe("user@example.com");
  });

  it("returns null when no email is saved", () => {
    const storage = createMemoryStorage();

    expect(getSavedEmail(storage)).toBeNull();
  });

  it("clears the saved email", () => {
    const storage = createMemoryStorage();
    saveEmail("user@example.com", storage);

    clearSavedEmail(storage);

    expect(getSavedEmail(storage)).toBeNull();
  });
});
