import { describe, expect, it } from "vitest";
import { readSupabaseBrowserEnv } from "./env";

describe("readSupabaseBrowserEnv", () => {
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
