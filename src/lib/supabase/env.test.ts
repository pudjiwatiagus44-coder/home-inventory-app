import { describe, expect, it } from "vitest";
import { readSupabaseBrowserEnv } from "./env";

describe("readSupabaseBrowserEnv", () => {
  it("returns the default public Supabase env from process env", () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://default.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "default-key";

    expect(readSupabaseBrowserEnv()).toEqual({
      url: "https://default.supabase.co",
      publishableKey: "default-key",
    });

    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }

    if (previousKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
    }
  });

  it("returns the public Supabase URL and publishable key", () => {
    const env = readSupabaseBrowserEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    });

    expect(env).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });
  });

  it("throws a helpful error when public Supabase config is missing", () => {
    expect(() => readSupabaseBrowserEnv({})).toThrow(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });
});
