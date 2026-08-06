import type { NextRequest } from "next/server";

import { createFamilyHandlers } from "../handlers";

const handlers = createFamilyHandlers();

export async function GET(request: NextRequest) {
  return handlers.listInvitations(request);
}

export async function POST(request: NextRequest) {
  return handlers.createInvitation(request);
}
