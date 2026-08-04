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
});
