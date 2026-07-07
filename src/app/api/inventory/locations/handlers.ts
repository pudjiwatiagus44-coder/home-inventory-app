import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../route-helpers";

export function createLocationHandlers(
  dependencies: InventoryMutationDependencies = {},
) {
  return {
    POST(request: NextRequest) {
      return runInventoryMutation(
        request,
        async ({ service, userId, body }) =>
          service.createLocationForCurrentUser({
            userId,
            name: textField(body, "name"),
            areaId: optionalTextField(body, "areaId"),
          }),
        dependencies,
      );
    },
  };
}
