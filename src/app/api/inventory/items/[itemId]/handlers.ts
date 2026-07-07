import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../../route-helpers";

type ItemRouteContext = {
  params: Promise<{ itemId: string }>;
};

export function createItemItemHandlers(
  dependencies: InventoryMutationDependencies = {},
) {
  return {
    async PATCH(request: NextRequest, context: ItemRouteContext) {
      const { itemId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId, body }) =>
          service.updateItemForCurrentUser({
            userId,
            itemId,
            name: textField(body, "name"),
            note: textField(body, "note"),
            expireDate: optionalTextField(body, "expireDate"),
            locationId: optionalTextField(body, "locationId"),
          }),
        dependencies,
      );
    },

    async DELETE(request: NextRequest, context: ItemRouteContext) {
      const { itemId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId }) => {
          await service.deleteItemForCurrentUser({ userId, itemId });
          return null;
        },
        dependencies,
      );
    },
  };
}
