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
        async ({ service, userId, body }) =>
          service.updateLocationForCurrentUser({
            userId,
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
        async ({ service, userId }) => {
          await service.deleteLocationForCurrentUser({ userId, locationId });
          return null;
        },
        dependencies,
      );
    },
  };
}
