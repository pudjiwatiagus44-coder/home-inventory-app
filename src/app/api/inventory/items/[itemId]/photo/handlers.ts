import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../../../../auth/route-helpers";
import {
  createRouteRecognitionService,
  type RecognitionDependencies,
} from "../../../../recognition/handlers";

type PhotoRouteContext = {
  params: Promise<{ itemId: string }>;
};

export function createItemPhotoHandlers(
  dependencies: RecognitionDependencies = {},
) {
  return {
    async GET(request: NextRequest, context: PhotoRouteContext) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          dependencies.authService,
        );

        if (!currentUser) {
          return NextResponse.json(
            { ok: false, message: "Authentication required" },
            { status: 401 },
          );
        }

        const { itemId } = await context.params;
        const service =
          dependencies.recognitionService ??
          createRouteRecognitionService();
        const photo = await service.getItemPhoto({
          userId: currentUser.userId,
          itemId,
        });

        if (!photo) {
          return NextResponse.json(
            { ok: false, message: "Item photo not found" },
            { status: 404 },
          );
        }

        return new NextResponse(new Uint8Array(photo.buffer), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, max-age=3600",
          },
        });
      } catch (error) {
        if (error instanceof Error) {
          return NextResponse.json(
            { ok: false, message: error.message },
            { status: 400 },
          );
        }

        return NextResponse.json(
          { ok: false, message: "Unknown photo error" },
          { status: 500 },
        );
      }
    },
  };
}
