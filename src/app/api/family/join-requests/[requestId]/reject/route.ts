import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../../../handlers";

const handlers = createFamilyHandlers();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  return handlers.rejectJoinRequest(request, context);
}
