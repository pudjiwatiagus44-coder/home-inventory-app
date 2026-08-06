import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../../handlers";

const handlers = createFamilyHandlers();

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  return handlers.removeMember(request, context);
}
