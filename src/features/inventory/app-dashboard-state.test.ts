import { describe, expect, it } from "vitest";

import { createInitialDashboardState } from "./app-dashboard-state";

describe("createInitialDashboardState", () => {
  it("keeps the existing Supabase loading path when no self-hosted user is present", () => {
    expect(createInitialDashboardState(null)).toEqual({ status: "loading" });
  });

  it("loads the self-hosted dashboard when a self-hosted user is present", () => {
    expect(
      createInitialDashboardState({
        userId: "user-1",
        email: "user@example.com",
      }),
    ).toEqual({ status: "loading" });
  });
});
