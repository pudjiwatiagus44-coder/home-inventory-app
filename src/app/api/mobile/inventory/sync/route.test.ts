import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { createMobileSyncHandlers } from "./handlers";

describe("POST /api/mobile/inventory/sync", () => {
  it("returns 401 when unauthenticated", async () => {
    const { POST } = createMobileSyncHandlers({
      authService: { getCurrentUser: async () => null },
      inventoryService: {
        syncQueuedOperationsForCurrentUser: async () => {
          throw new Error("should not sync when unauthenticated");
        },
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/mobile/inventory/sync", {
        method: "POST",
        body: JSON.stringify({ operations: [] }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Authentication required",
    });
    expect(response.status).toBe(401);
  });

  it("parses and delegates offline item create operations for the current user", async () => {
    const calls: unknown[] = [];
    const operation = {
      clientOperationId: "op-local-1",
      entity: "item",
      action: "create",
      localId: "local-item-1",
      payload: {
        name: "Offline item",
        note: "queued on Android",
        expireDate: null,
        locationId: null,
      },
    };
    const { POST } = createMobileSyncHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user-1@example.com",
        }),
      },
      inventoryService: {
        syncQueuedOperationsForCurrentUser: async (input) => {
          calls.push(input);
          return {
            results: [
              {
                clientOperationId: "op-local-1",
                status: "applied",
                entity: "item",
                localId: "local-item-1",
                serverId: "item-1",
                serverUpdatedAt: "2026-08-04T00:00:00.000Z",
              },
            ],
          };
        },
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/mobile/inventory/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "home_inventory_session=session-token",
        },
        body: JSON.stringify({
          householdId: "household-shared",
          operations: [operation],
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        results: [
          {
            clientOperationId: "op-local-1",
            status: "applied",
            entity: "item",
            localId: "local-item-1",
            serverId: "item-1",
            serverUpdatedAt: "2026-08-04T00:00:00.000Z",
          },
        ],
      },
    });
    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        userId: "user-1",
        householdId: "household-shared",
        operations: [operation],
      },
    ]);
  });

  it("returns 501 when the default sync service cannot be configured", async () => {
    const { POST } = createMobileSyncHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user-1@example.com",
        }),
      },
      env: {},
    });

    const response = await POST(
      new NextRequest("http://localhost/api/mobile/inventory/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "home_inventory_session=session-token",
        },
        body: JSON.stringify({ operations: [] }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "DATABASE_URL is required for PostgreSQL inventory",
    });
    expect(response.status).toBe(501);
  });

  it("uses the default route service when PostgreSQL can be configured", async () => {
    const { POST } = createMobileSyncHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user-1@example.com",
        }),
      },
      env: { DATABASE_URL: "postgres://inventory.test/db" },
      createPool: () => ({
        query: async () => {
          throw new Error("empty sync should not query the database");
        },
      }),
    });

    const response = await POST(
      new NextRequest("http://localhost/api/mobile/inventory/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "home_inventory_session=session-token",
        },
        body: JSON.stringify({ operations: [] }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { results: [] },
    });
    expect(response.status).toBe(200);
  });
});
