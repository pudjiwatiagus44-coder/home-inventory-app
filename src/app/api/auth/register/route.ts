import type { NextRequest } from "next/server";
import {
  createAuthErrorResponse,
  createAuthSuccessResponse,
  createRouteAuthService,
  readAuthCredentials,
} from "../route-helpers";

export async function POST(request: NextRequest) {
  try {
    const credentials = await readAuthCredentials(request);
    const result = await createRouteAuthService().register(credentials);
    return createAuthSuccessResponse(result);
  } catch (error) {
    return createAuthErrorResponse(error);
  }
}
