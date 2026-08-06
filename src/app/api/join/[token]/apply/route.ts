import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../../../family/handlers";

const handlers = createFamilyHandlers();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  return handlers.submitJoinApplication(request, context);
}
