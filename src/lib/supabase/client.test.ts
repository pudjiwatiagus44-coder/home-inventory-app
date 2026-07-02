import { describe, expect, it } from "vitest";
import { createSupabaseBrowserClient } from "./client";

describe("createSupabaseBrowserClient", () => {
  it("creates the browser client from validated public config", () => {
    const calls: Array<[string, string]> = [];
    const client = { auth: {} };

    const result = createSupabaseBrowserClient(
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      },
      (url, publishableKey) => {
        calls.push([url, publishableKey]);
        return client;
      },
    );

    expect(result).toBe(client);
    expect(calls).toEqual([["https://example.supabase.co", "publishable-key"]]);
  });
});
