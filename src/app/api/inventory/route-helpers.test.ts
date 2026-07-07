import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { PostgresDatabaseNotConfiguredError } from "../../../server/db/postgres";
import { AreaOutsideCurrentHouseholdError } from "../../../features/inventory/inventory-service";
import { runInventoryMutation } from "./route-helpers";

describe("inventory route helpers", () => {
  it("returns 401 when the request has no self-hosted auth session", async () => {
    const response = await runInventoryMutation(
      new NextRequest("http://localhost/api/inventory/areas", {
        method: "POST",
        body: JSON.stringify({ name: "Kitchen" }),
      }),
      async () => ({ id: "area-1" }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Authentication required",
    });
    expect(response.status).toBe(401);
  });

  it("passes the current user and parsed JSON body to the mutation", async () => {
    const seen: unknown[] = [];
    const response = await runInventoryMutation(
      new NextRequest("http://localhost/api/inventory/areas", {
        method: "POST",
        headers: {
          cookie: "home_inventory_session=session-token",
        },
        body: JSON.stringify({ name: " Kitchen ", color: "#256f6b" }),
      }),
      async ({ userId, body }) => {
        seen.push({ userId, body });
        return { id: "area-1", name: "Kitchen", color: "#256f6b" };
      },
      {
        authService: {
          getCurrentUser: async () => ({
            userId: "user-1",
            email: "user@example.com",
          }),
        },
      },
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { id: "area-1", name: "Kitchen", color: "#256f6b" },
    });
    expect(response.status).toBe(200);
    expect(seen).toEqual([
      {
        userId: "user-1",
        body: { name: " Kitchen ", color: "#256f6b" },
      },
    ]);
  });

  it("passes an empty object to DELETE mutations without a request body", async () => {
    const seen: unknown[] = [];
    const response = await runInventoryMutation(
      new NextRequest("http://localhost/api/inventory/locations/location-1", {
        method: "DELETE",
        headers: {
          cookie: "home_inventory_session=session-token",
        },
      }),
      async ({ userId, body }) => {
        seen.push({ userId, body });
        return null;
      },
      {
        authService: {
          getCurrentUser: async () => ({
            userId: "user-1",
            email: "user@example.com",
          }),
        },
      },
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(response.status).toBe(200);
    expect(seen).toEqual([{ userId: "user-1", body: {} }]);
  });

  it("returns 501 when PostgreSQL inventory storage is not configured", async () => {
    const response = await runInventoryMutation(
      new NextRequest("http://localhost/api/inventory/areas", {
        method: "POST",
        headers: {
          cookie: "home_inventory_session=session-token",
        },
        body: JSON.stringify({ name: "Kitchen" }),
      }),
      async () => {
        throw new PostgresDatabaseNotConfiguredError();
      },
      {
        authService: {
          getCurrentUser: async () => ({
            userId: "user-1",
            email: "user@example.com",
          }),
        },
      },
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "DATABASE_URL is required for PostgreSQL inventory",
    });
    expect(response.status).toBe(501);
  });

  it("returns 403 for service-level ownership rejections", async () => {
    const response = await runInventoryMutation(
      new NextRequest("http://localhost/api/inventory/areas", {
        method: "PATCH",
        headers: {
          cookie: "home_inventory_session=session-token",
        },
        body: JSON.stringify({ name: "Kitchen" }),
      }),
      async () => {
        throw new AreaOutsideCurrentHouseholdError();
      },
      {
        authService: {
          getCurrentUser: async () => ({
            userId: "user-1",
            email: "user@example.com",
          }),
        },
      },
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Selected area does not belong to current user",
    });
    expect(response.status).toBe(403);
  });
});
