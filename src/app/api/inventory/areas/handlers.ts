import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../route-helpers";

export function createAreaHandlers(
  dependencies: InventoryMutationDependencies = {},
) {
  return {
    POST(request: NextRequest) {
      return runInventoryMutation(
        request,
        async ({ service, userId, householdId, body }) =>
          service.createAreaForCurrentUser({
            userId,
            householdId,
            name: textField(body, "name"),
            color: optionalTextField(body, "color") ?? undefined,
          }),
        dependencies,
      );
    },
  };
}
