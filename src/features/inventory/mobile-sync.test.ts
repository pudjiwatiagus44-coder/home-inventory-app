import { describe, expect, it } from "vitest";

import {
  parseMobileSyncRequest,
  type MobileSyncRequest,
} from "./mobile-sync";

describe("parseMobileSyncRequest", () => {
  it("accepts an offline item create operation with a client operation id", () => {
    const request: MobileSyncRequest = {
      operations: [
        {
          clientOperationId: "op-local-1",
          entity: "item",
          action: "create",
          localId: "local-item-1",
          payload: {
            name: "Offline item",
            note: "Sync when network returns",
            expireDate: "2026-12-01",
            locationId: null,
          },
        },
      ],
    };

    expect(parseMobileSyncRequest(request)).toEqual(request);
  });

  it("rejects update operations without a base server updatedAt", () => {
    expect(() =>
      parseMobileSyncRequest({
        operations: [
          {
            clientOperationId: "op-local-2",
            entity: "item",
            action: "update",
            serverId: "item-server-1",
            payload: {
              name: "Updated item",
              note: "",
              expireDate: null,
              locationId: null,
            },
          },
        ],
      }),
    ).toThrow("baseServerUpdatedAt is required for update and delete");
  });

  it("rejects item create payloads with a non-string name", () => {
    expect(() =>
      parseMobileSyncRequest({
        operations: [
          {
            clientOperationId: "op-local-3",
            entity: "item",
            action: "create",
            localId: "local-item-3",
            payload: {
              name: 123,
              note: "",
              expireDate: null,
              locationId: null,
            },
          },
        ],
      }),
    ).toThrow("item payload name");
  });

  it("rejects item create payloads missing note", () => {
    expect(() =>
      parseMobileSyncRequest({
        operations: [
          {
            clientOperationId: "op-local-4",
            entity: "item",
            action: "create",
            localId: "local-item-4",
            payload: {
              name: "Offline item",
              expireDate: null,
              locationId: null,
            },
          },
        ],
      }),
    ).toThrow("item payload note must be a string");
  });

  it("rejects location create payloads with a numeric areaId", () => {
    expect(() =>
      parseMobileSyncRequest({
        operations: [
          {
            clientOperationId: "op-local-5",
            entity: "location",
            action: "create",
            localId: "local-location-5",
            payload: {
              name: "Fridge",
              areaId: 123,
            },
          },
        ],
      }),
    ).toThrow("location payload areaId must be a string or null");
  });

  it("rejects area create payloads missing color", () => {
    expect(() =>
      parseMobileSyncRequest({
        operations: [
          {
            clientOperationId: "op-local-6",
            entity: "area",
            action: "create",
            localId: "local-area-6",
            payload: {
              name: "Kitchen",
            },
          },
        ],
      }),
    ).toThrow("area payload color");
  });
});
