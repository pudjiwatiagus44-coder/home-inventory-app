import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../route-helpers";

export function createItemHandlers(
  dependencies: InventoryMutationDependencies = {},
) {
  return {
    POST(request: NextRequest) {
      return runInventoryMutation(
        request,
        async ({ service, userId, body }) =>
          service.createItemForCurrentUser({
            userId,
            name: textField(body, "name"),
            note: textField(body, "note"),
            expireDate: optionalTextField(body, "expireDate"),
            locationId: optionalTextField(body, "locationId"),
          }),
        dependencies,
      );
    },
  };
}
