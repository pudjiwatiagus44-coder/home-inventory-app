import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../handlers";

const handlers = createFamilyHandlers();

export async function GET(request: NextRequest) {
  return handlers.listHouseholds(request);
}

export async function POST(request: NextRequest) {
  return handlers.createHousehold(request);
}

export async function PATCH(request: NextRequest) {
  return handlers.renameHousehold(request);
}
