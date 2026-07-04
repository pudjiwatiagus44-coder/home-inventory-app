import { describe, expect, it } from "vitest";
import { getOrCreateDefaultHouseholdId } from "./household-bootstrap";

describe("getOrCreateDefaultHouseholdId", () => {
  it("returns the existing membership household id", async () => {
    const rpcCalls: string[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { household_id: "existing-household" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "existing-household" },
                error: null,
              }),
            }),
          }),
        };
      },
      rpc: async (name: string) => {
        rpcCalls.push(name);
        return { data: "new-household", error: null };
      },
    };

    await expect(
      getOrCreateDefaultHouseholdId(supabase, {
        id: "user-1",
        email: "user@example.com",
      }),
    ).resolves.toBe("existing-household");
    expect(rpcCalls).toEqual([]);
  });

  it("repairs a stale membership when the household is not readable", async () => {
    const rpcCalls: Array<[string, { display_name: string }]> = [];
    const supabase = {
      from: (table: string) => {
        if (table === "household_members") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { household_id: "stale-household" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: null,
              }),
            }),
          }),
        };
      },
      rpc: async (name: string, params: { display_name: string }) => {
        rpcCalls.push([name, params]);
        return { data: "repaired-household", error: null };
      },
    };

    await expect(
      getOrCreateDefaultHouseholdId(supabase, {
        id: "user-1",
        email: "user@example.com",
      }),
    ).resolves.toBe("repaired-household");
    expect(rpcCalls).toEqual([
      ["create_default_household", { display_name: "user@example.com" }],
    ]);
  });

  it("creates the default household when membership is missing", async () => {
    const rpcCalls: Array<[string, { display_name: string }]> = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
      rpc: async (name: string, params: { display_name: string }) => {
        rpcCalls.push([name, params]);
        return { data: "created-household", error: null };
      },
    };

    await expect(
      getOrCreateDefaultHouseholdId(supabase, {
        id: "user-1",
        email: "user@example.com",
      }),
    ).resolves.toBe("created-household");
    expect(rpcCalls).toEqual([
      ["create_default_household", { display_name: "user@example.com" }],
    ]);
  });

  it("throws membership query errors", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { message: "permission denied" },
              }),
            }),
          }),
        }),
      }),
      rpc: async () => ({ data: null, error: null }),
    };

    await expect(
      getOrCreateDefaultHouseholdId(supabase, {
        id: "user-1",
        email: "user@example.com",
      }),
    ).rejects.toThrow("permission denied");
  });
});
