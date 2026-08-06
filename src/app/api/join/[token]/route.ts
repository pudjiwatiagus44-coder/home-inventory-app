import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../../family/handlers";

const handlers = createFamilyHandlers();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return handlers.getJoinInfo(request, context);
}
