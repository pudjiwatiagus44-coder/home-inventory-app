import { describe, expect, it } from "vitest";
import { initializeDefaultHousehold } from "./default-household";

describe("initializeDefaultHousehold", () => {
  it("calls the default household rpc and returns the household id", async () => {
    const calls: Array<[string, { display_name: string }]> = [];
    const supabase = {
      rpc: async (name: string, params: { display_name: string }) => {
        calls.push([name, params]);
        return { data: "household-id", error: null };
      },
    };

    const result = await initializeDefaultHousehold(supabase, "user@example.com");

    expect(result).toBe("household-id");
    expect(calls).toEqual([
      ["create_default_household", { display_name: "user@example.com" }],
    ]);
  });

  it("throws the rpc error message when initialization fails", async () => {
    const supabase = {
      rpc: async () => ({
        data: null,
        error: { message: "permission denied" },
      }),
    };

    await expect(
      initializeDefaultHousehold(supabase, "user@example.com"),
    ).rejects.toThrow("permission denied");
  });
});
