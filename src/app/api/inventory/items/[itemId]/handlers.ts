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
        async ({ service, userId, body }) => {
          const item = await service.updateItemForCurrentUser({
            userId,
            itemId,
            name: textField(body, "name"),
            note: textField(body, "note"),
            expireDate: optionalTextField(body, "expireDate"),
            locationId: optionalTextField(body, "locationId"),
          });
          const photoKey = optionalTextField(body, "photoKey");

          if (photoKey) {
            const photoService =
              dependencies.recognitionService ??
              createRouteRecognitionService();
            const attached = await photoService.attachPhotoToItem({
              userId,
              itemId,
              photoKey,
            });

            if (attached) {
              return { ...item, photo_key: photoKey };
            }
          }

          return item;
        },
        dependencies,
      );
    },

    async DELETE(request: NextRequest, context: ItemRouteContext) {
      const { itemId } = await context.params;

      return runInventoryMutation(
        request,
        async ({ service, userId }) => {
          await service.deleteItemForCurrentUser({ userId, itemId });
          const photoService =
            dependencies.recognitionService ??
            createRouteRecognitionService();
          await photoService.deleteItemPhoto({ userId, itemId });
          return null;
        },
        dependencies,
      );
    },
  };
}
