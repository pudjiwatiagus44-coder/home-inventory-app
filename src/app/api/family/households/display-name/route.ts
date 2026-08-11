import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../../handlers";

const handlers = createFamilyHandlers();

export async function PATCH(request: NextRequest) {
  return handlers.setHouseholdDisplayName(request);
}
