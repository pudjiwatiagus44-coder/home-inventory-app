import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../../route-helpers";
import { createRouteAreaLocationPhotoService } from "../../photo-route-helpers";

type AreaRouteContext = {
  params: Promise<{ areaId: string }>;
};

export function createAreaItemHandlers(
  dependencies: InventoryMutationDependencies & {
    photoService?: ReturnType<typeof createRouteAreaLocationPhotoService>;
  } = {},
) {
  return {
    async PATCH(request: NextRequest, context: AreaRouteContext) {
      const { areaId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId, body }) =>
          service.updateAreaForCurrentUser({
            userId,
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
        async ({ service, userId }) => {
          const photoService =
            dependencies.photoService ?? createRouteAreaLocationPhotoService();
          const keys = await photoService.listAreaPhotoKeys({
            userId,
            areaId,
          });
          await service.deleteAreaForCurrentUser({ userId, areaId });
          await photoService.deletePhotoFiles(keys);
          return null;
        },
        dependencies,
      );
    },
  };
}
