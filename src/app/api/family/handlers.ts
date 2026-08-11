import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../auth/route-helpers";
import { createPostgresFamilyRepository } from "../../../features/family/family-repository";
import {
  createFamilyService,
  FamilyInvitationInvalidError,
  FamilyJoinRequestNotFoundError,
  type FamilyService,
} from "../../../features/family/family-service";
import {
  createPostgresQueryClientFromEnv,
  PostgresDatabaseNotConfiguredError,
  type PostgresEnv,
  type PostgresQueryClientFactoryOptions,
} from "../../../server/db/postgres";
import { AuthorizationError } from "../../../server/auth/authorization";
import type { createAuthService } from "../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthService>,
  "getCurrentUser"
>;

type FamilyDependencies = {
  authService?: CurrentUserAuthService;
  familyService?: FamilyService;
};

type FamilyServiceOverrides = PostgresQueryClientFactoryOptions;

type JsonObject = Record<string, unknown>;

export function createRouteFamilyService(
  env: PostgresEnv = process.env,
  overrides: FamilyServiceOverrides = {},
) {
  const queryClient = createPostgresQueryClientFromEnv(env, {
    createPool: overrides.createPool,
  });

  return createFamilyService({
    repository: createPostgresFamilyRepository(queryClient),
  });
}

export function createFamilyHandlers(
  dependencies: FamilyDependencies = {},
) {
  async function requireUser(request: NextRequest) {
    const currentUser = await getCurrentUserFromRequest(
      request,
      dependencies.authService,
    );

    if (!currentUser) {
      return null;
    }

    return currentUser;
  }

  function service() {
    return dependencies.familyService ?? createRouteFamilyService();
  }

  return {
    async listHouseholds(request: NextRequest) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const data = await service().listHouseholdsForCurrentUser(user.userId);
        return successResponse(data);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async createHousehold(request: NextRequest) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const body = await readJsonObject(request);
        const name = textField(body, "name");
        const data = await service().createHouseholdForCurrentUser({
          userId: user.userId,
          name,
        });

        return successResponse(data);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async renameHousehold(request: NextRequest) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const body = await readJsonObject(request);
        const householdId = textField(body, "householdId");
        const name = textField(body, "name");
        const missingHousehold = requireHouseholdId(householdId);

        if (missingHousehold) {
          return missingHousehold;
        }

        const data = await service().renameHouseholdForCurrentUser({
          userId: user.userId,
          householdId,
          name,
        });
        return successResponse(data);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async setHouseholdDisplayName(request: NextRequest) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const body = await readJsonObject(request);
        const householdId = textField(body, "householdId");
        const displayName = textField(body, "displayName");
        const missingHousehold = requireHouseholdId(householdId);

        if (missingHousehold) {
          return missingHousehold;
        }

        await service().setHouseholdDisplayNameForCurrentUser({
          userId: user.userId,
          householdId,
          displayName,
        });
        return successResponse(null);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async createInvitation(request: NextRequest) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const body = await readJsonObject(request);
        const householdId = textField(body, "householdId");
        const link = await service().createInvitationLinkForCurrentUser({
          userId: user.userId,
          householdId,
        });

        return successResponse({
          id: link.id,
          token: link.token,
          expiresAt: link.expires_at,
          url: `${publicOrigin(request)}/join/${encodeURIComponent(link.token)}`,
        });
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async listInvitations(request: NextRequest) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

          const householdId = request.nextUrl.searchParams.get("householdId") ?? "";
          const missingHousehold = requireHouseholdId(householdId);
          if (missingHousehold) {
            return missingHousehold;
          }

          const data = await service().listInvitationLinksForCurrentUser({
            userId: user.userId,
            householdId,
          });

        return successResponse(data);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async deleteInvitation(
      request: NextRequest,
      context: { params: Promise<{ linkId: string }> },
    ) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const { linkId } = await context.params;
        await service().revokeInvitationLinkForCurrentUser({
          userId: user.userId,
          linkId,
        });

        return successResponse(null);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async listJoinRequests(request: NextRequest) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

          const householdId = request.nextUrl.searchParams.get("householdId") ?? "";
          const missingHousehold = requireHouseholdId(householdId);
          if (missingHousehold) {
            return missingHousehold;
          }

          const data = await service().listJoinRequestsForCurrentUser({
            userId: user.userId,
            householdId,
          });

        return successResponse(data);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async listMembers(request: NextRequest) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

          const householdId = request.nextUrl.searchParams.get("householdId") ?? "";
          const missingHousehold = requireHouseholdId(householdId);
          if (missingHousehold) {
            return missingHousehold;
          }

          const data = await service().listMembersForCurrentUser({
            userId: user.userId,
            householdId,
          });

        return successResponse(data);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async approveJoinRequest(
      request: NextRequest,
      context: { params: Promise<{ requestId: string }> },
    ) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const { requestId } = await context.params;
        await service().approveJoinRequestForCurrentUser({
          userId: user.userId,
          requestId,
        });

        return successResponse(null);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async rejectJoinRequest(
      request: NextRequest,
      context: { params: Promise<{ requestId: string }> },
    ) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const { requestId } = await context.params;
        await service().rejectJoinRequestForCurrentUser({
          userId: user.userId,
          requestId,
        });

        return successResponse(null);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async removeMember(
      request: NextRequest,
      context: { params: Promise<{ userId: string }> },
    ) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

          const { userId: targetUserId } = await context.params;
          const body = await readJsonObject(request);
          const householdId = textField(body, "householdId");
          const missingHousehold = requireHouseholdId(householdId);
          if (missingHousehold) {
            return missingHousehold;
          }

          await service().removeMemberForCurrentUser({
            userId: user.userId,
            householdId,
            targetUserId,
          });

        return successResponse(null);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async updateMemberRole(
      request: NextRequest,
      context: { params: Promise<{ userId: string }> },
    ) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

          const { userId: targetUserId } = await context.params;
          const body = await readJsonObject(request);
          const householdId = textField(body, "householdId");
          const missingHousehold = requireHouseholdId(householdId);
          if (missingHousehold) {
            return missingHousehold;
          }

          const role = textField(body, "role");

        if (
          role !== "member" &&
          role !== "contributor" &&
          role !== "readonly"
        ) {
          return NextResponse.json(
            { ok: false, message: "不支持的角色" },
            { status: 400 },
          );
        }

        await service().setMemberRoleForCurrentUser({
          userId: user.userId,
          householdId,
          targetUserId,
          role,
        });

        return successResponse(null);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async getJoinInfo(
      request: NextRequest,
      context: { params: Promise<{ token: string }> },
    ) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const { token } = await context.params;
        const data = await service().getHouseholdForInvitationForCurrentUser({
          userId: user.userId,
          token,
        });

        if (!data) {
          return NextResponse.json(
            { ok: false, message: "邀请链接无效或已过期" },
            { status: 404 },
          );
        }

        return successResponse(data);
      } catch (error) {
        return familyErrorResponse(error);
      }
    },

    async submitJoinApplication(
      request: NextRequest,
      context: { params: Promise<{ token: string }> },
    ) {
      try {
        const user = await requireUser(request);

        if (!user) {
          return unauthorizedResponse();
        }

        const { token } = await context.params;
        const requestId = await service().submitJoinRequestForCurrentUser({
          userId: user.userId,
          token,
        });

        return successResponse({ requestId });
      } catch (error) {
        return familyErrorResponse(error);
      }
    },
  };
}

function successResponse(data: unknown) {
  return NextResponse.json({ ok: true, data });
}

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, message: "Authentication required" },
    { status: 401 },
  );
}

async function readJsonObject(request: NextRequest): Promise<JsonObject> {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  const body = JSON.parse(text) as unknown;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  return body as JsonObject;
}

function textField(body: JsonObject, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function requireHouseholdId(householdId: string) {
  if (!householdId) {
    return NextResponse.json(
      { ok: false, message: "缺少家庭 ID" },
      { status: 400 },
    );
  }

  return null;
}

function publicOrigin(request: NextRequest) {
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const forwardedHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;

  return `${forwardedProto}://${forwardedHost}`;
}

function familyErrorResponse(error: unknown) {
  if (error instanceof PostgresDatabaseNotConfiguredError) {
    return NextResponse.json(
      {
        ok: false,
        message: "DATABASE_URL is required for PostgreSQL family features",
      },
      { status: 501 },
    );
  }

  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 403 },
    );
  }

  if (error instanceof FamilyInvitationInvalidError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  if (error instanceof FamilyJoinRequestNotFoundError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 404 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, message: "Unknown family error" },
    { status: 500 },
  );
}
