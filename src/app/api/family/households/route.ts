import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../handlers";

const handlers = createFamilyHandlers();

export async function GET(request: NextRequest) {
  return handlers.listHouseholds(request);
}
