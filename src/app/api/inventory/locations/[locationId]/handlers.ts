import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../../route-helpers";
import { createRouteAreaLocationPhotoService } from "../../photo-route-helpers";

type LocationRouteContext = {
  params: Promise<{ locationId: string }>;
};

export function createLocationItemHandlers(
  dependencies: InventoryMutationDependencies & {
    photoService?: ReturnType<typeof createRouteAreaLocationPhotoService>;
  } = {},
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
          const photoService =
            dependencies.photoService ?? createRouteAreaLocationPhotoService();
          const keys = await photoService.listLocationPhotoKeys({
            userId,
            locationId,
            householdId,
          });
          await service.deleteLocationForCurrentUser({
            userId,
            householdId,
            locationId,
          });
          await photoService.deletePhotoFiles(keys);
          return null;
        },
        dependencies,
      );
    },
  };
}
