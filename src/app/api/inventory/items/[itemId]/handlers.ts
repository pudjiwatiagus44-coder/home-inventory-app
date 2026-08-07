import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../../route-helpers";
import {
  createRouteRecognitionService,
  type RecognitionDependencies,
} from "../../../recognition/handlers";

type ItemRouteContext = {
  params: Promise<{ itemId: string }>;
};

type ItemItemHandlersDependencies = InventoryMutationDependencies &
  RecognitionDependencies;

export function createItemItemHandlers(
  dependencies: ItemItemHandlersDependencies = {},
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
          const photoService =
            dependencies.recognitionService ??
            createRouteRecognitionService();
          await photoService.deleteItemPhoto({ userId, itemId });
          await service.deleteItemForCurrentUser({ userId, itemId });
          return null;
        },
        dependencies,
      );
    },
  };
}
