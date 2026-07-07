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
          await service.deleteAreaForCurrentUser({ userId, areaId });
          return null;
        },
        dependencies,
      );
    },
  };
}
