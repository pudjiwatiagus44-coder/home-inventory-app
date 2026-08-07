import type { NextRequest } from "next/server";

import {
  optionalTextField,
  runInventoryMutation,
  textField,
  type InventoryMutationDependencies,
} from "../route-helpers";
import {
  createRouteRecognitionService,
  type RecognitionDependencies,
} from "../../recognition/handlers";

export type ItemHandlersDependencies = InventoryMutationDependencies &
  RecognitionDependencies;

export function createItemHandlers(
  dependencies: ItemHandlersDependencies = {},
) {
  return {
    POST(request: NextRequest) {
      return runInventoryMutation(
        request,
        async ({ service, userId, body }) => {
          const item = await service.createItemForCurrentUser({
            userId,
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
              itemId: item.id,
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
  };
}
