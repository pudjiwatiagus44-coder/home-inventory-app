import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../../route-helpers";

type LocationRouteContext = {
  params: Promise<{ locationId: string }>;
};

export function createLocationItemHandlers(
  dependencies: InventoryMutationDependencies = {},
) {
  return {
    async PATCH(request: NextRequest, context: LocationRouteContext) {
      const { locationId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId, householdId, body }) =>
          service.updateLocationForCurrentUser({
            userId,
            householdId,
            locationId,
            name: textField(body, "name"),
            areaId: optionalTextField(body, "areaId"),
          }),
        dependencies,
      );
    },

    async DELETE(request: NextRequest, context: LocationRouteContext) {
      const { locationId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId, householdId }) => {
          await service.deleteLocationForCurrentUser({
            userId,
            householdId,
            locationId,
          });
          return null;
        },
        dependencies,
      );
    },
  };
}
