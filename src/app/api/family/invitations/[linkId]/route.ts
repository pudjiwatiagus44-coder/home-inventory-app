import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../../handlers";

const handlers = createFamilyHandlers();

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ linkId: string }> },
) {
  return handlers.deleteInvitation(request, context);
}
