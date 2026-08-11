import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../../route-helpers";

type AreaRouteContext = {
  params: Promise<{ areaId: string }>;
};

export function createAreaItemHandlers(
  dependencies: InventoryMutationDependencies = {},
) {
  return {
    async PATCH(request: NextRequest, context: AreaRouteContext) {
      const { areaId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId, householdId, body }) =>
          service.updateAreaForCurrentUser({
            userId,
            householdId,
            areaId,
            name: textField(body, "name"),
            color: optionalTextField(body, "color") ?? undefined,
          }),
        dependencies,
      );
    },

    async DELETE(request: NextRequest, context: AreaRouteContext) {
      const { areaId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId, householdId }) => {
          await service.deleteAreaForCurrentUser({ userId, householdId, areaId });
          return null;
        },
        dependencies,
      );
    },
  };
}
