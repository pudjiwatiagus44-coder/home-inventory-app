# Persistent Session and Auth Expiry UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove fixed 30-day account-session expiry, keep Web cookies renewed while the app is used, and send Web/Android users back to login with a Chinese message whenever the server rejects an invalid session.

**Architecture:** PostgreSQL keeps the existing non-null `expires_at` column for compatibility, but authentication validity depends on session existence, `revoked_at`, and active user status instead of the timestamp. New sessions receive a browser-compatible 400-day cookie horizon, and a small authenticated refresh endpoint reissues the same HttpOnly cookie while Web is active. Shared Web and Android network boundaries convert authenticated 401 responses into one session-expired signal; UI roots react by clearing only credentials and navigating to login without deleting cached inventory or drafts.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Vitest, PostgreSQL repository layer, React 19, Kotlin, Jetpack Compose, OkHttp/Retrofit, StateFlow, JUnit 4.

---

## File structure

- Modify `src/server/auth/session-security.ts` and `.test.ts`: define the durable cookie horizon and make revocation—not age—the session-validity rule.
- Modify `src/server/auth/auth-service.test.ts`: prove old but unrevoked sessions remain accepted and disabled/revoked sessions remain rejected.
- Modify `src/app/api/auth/route-helpers.ts` and `.test.ts`: centralize cookie attributes and support reissuing an existing token.
- Create `src/app/api/auth/session/route.ts` and `route.test.ts`: authenticated Web cookie refresh endpoint.
- Create `src/features/auth/auth-aware-fetch.ts` and `.test.ts`: shared Web 401 detection and one session-expired browser event.
- Modify `src/features/inventory/self-hosted-inventory-client.ts`, its tests, `src/features/family/family-client.ts`, and its tests: route protected Web traffic through the auth-aware boundary.
- Modify `src/features/inventory/AppDashboard.tsx` and `.test.ts`: refresh the cookie while mounted and redirect on the shared expiry event.
- Modify `src/app/login/page.tsx`: render the session-expired Chinese notice from a safe query parameter.
- Modify Android `SessionStore.kt`, `EncryptedSessionStore.kt`, `NetworkModule.kt`, `AppRoot.kt` and associated tests: publish observable cookie/expiry state, clear an invalid cookie on authenticated 401, and return Compose to login.
- Update `dev-docs/acceptance.md`: record local evidence only after verification.

### Task 1: Make server sessions durable without weakening revocation

**Files:**
- Modify: `src/server/auth/session-security.ts`
- Modify: `src/server/auth/session-security.test.ts`
- Modify: `src/server/auth/auth-service.test.ts`

- [ ] **Step 1: Write failing session-security tests**

Add tests that make the intended distinction explicit:

```ts
it("uses the browser-compatible persistent cookie horizon", () => {
  const now = new Date("2026-09-23T00:00:00.000Z");
  expect(createSessionExpiry(now)).toEqual(
    new Date("2027-10-28T00:00:00.000Z"),
  );
});

it("keeps an unrevoked session usable after its historical expiry", () => {
  expect(
    isSessionUsable({
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      revokedAt: null,
    }, new Date("2026-09-23T00:00:00.000Z")),
  ).toBe(true);
});

it("rejects a revoked durable session", () => {
  expect(
    isSessionUsable({
      expiresAt: new Date("2027-10-28T00:00:00.000Z"),
      revokedAt: new Date("2026-09-23T00:00:00.000Z"),
    }),
  ).toBe(false);
});
```

- [ ] **Step 2: Run the focused tests and verify the new expectations fail**

Run:

```powershell
npx vitest run src/server/auth/session-security.test.ts src/server/auth/auth-service.test.ts
```

Expected: the 400-day expiry and historical-expiry usability assertions fail; existing revoked/disabled tests remain green.

- [ ] **Step 3: Implement the minimal durable-session rule**

Change `session-security.ts` to:

```ts
import { createHmac, randomBytes } from "node:crypto";

export type SessionRecord = {
  expiresAt: Date;
  revokedAt: Date | null;
};

export const SESSION_COOKIE_DURATION_DAYS = 400;

export function createSessionToken(
  getRandomBytes: (size: number) => Buffer = randomBytes,
): string {
  return getRandomBytes(32).toString("base64url");
}

export function createSessionExpiry(now: Date = new Date()): Date {
  return new Date(
    now.getTime() + SESSION_COOKIE_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function hashSessionToken(token: string, secret: string): string {
  if (!secret) throw new Error("SESSION_SECRET is required");
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function isSessionUsable(session: SessionRecord): boolean {
  return session.revokedAt === null;
}
```

Keep `expiresAt` in the type so current rows and repository SQL remain compatible. Do not add a production database migration: this change neither drops nor rewrites the existing column.

- [ ] **Step 4: Add an auth-service regression for an old session**

In `auth-service.test.ts`, make `findSessionByHash` return an active, unrevoked session whose `expiresAt` is before the supplied `now`, then assert `getCurrentUser()` returns `{ userId, email }`. Retain the existing disabled-user and revoked-session cases unchanged.

- [ ] **Step 5: Run focused tests**

Run the Step 2 command. Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/server/auth/session-security.ts src/server/auth/session-security.test.ts src/server/auth/auth-service.test.ts
git commit -m "feat: keep unrevoked login sessions active"
```

### Task 2: Add an authenticated Web cookie-refresh endpoint

**Files:**
- Modify: `src/app/api/auth/route-helpers.ts`
- Modify: `src/app/api/auth/route-helpers.test.ts`
- Create: `src/app/api/auth/session/route.ts`
- Create: `src/app/api/auth/session/route.test.ts`

- [ ] **Step 1: Write failing cookie-helper tests**

Add coverage that `createAuthSuccessResponse` still sets `HttpOnly`, `SameSite=Lax`, `Path=/`, and the supplied expiry. Add a new expectation for:

```ts
const response = createSessionRefreshResponse({
  sessionToken: "existing-token",
  expiresAt: new Date("2027-10-28T00:00:00.000Z"),
});
expect(await response.json()).toEqual({ ok: true });
expect(response.headers.get("set-cookie")).toContain(
  "home_inventory_session=existing-token",
);
```

- [ ] **Step 2: Write failing route tests**

Create `route.test.ts` with injected handler dependencies and these cases:

```ts
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createSessionHandlers } from "./route";

describe("POST /api/auth/session", () => {
  it("returns 401 without a session cookie", async () => {
    const { POST } = createSessionHandlers({
      authService: { getCurrentUser: async () => null },
    });
    const response = await POST(new NextRequest("http://localhost/api/auth/session", {
      method: "POST",
    }));
    expect(response.status).toBe(401);
  });

  it("returns 401 when the stored token is no longer valid", async () => {
    const { POST } = createSessionHandlers({
      authService: { getCurrentUser: async () => null },
    });
    const response = await POST(new NextRequest("http://localhost/api/auth/session", {
      method: "POST",
      headers: { cookie: "home_inventory_session=revoked-token" },
    }));
    expect(response.status).toBe(401);
  });

  it("reissues the same cookie for a valid session", async () => {
    const { POST } = createSessionHandlers({
      authService: {
        getCurrentUser: async () => ({ userId: "user-1", email: "u@example.com" }),
      },
      now: () => new Date("2026-09-23T00:00:00.000Z"),
    });
    const response = await POST(new NextRequest("http://localhost/api/auth/session", {
      method: "POST",
      headers: { cookie: "home_inventory_session=existing-token" },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "home_inventory_session=existing-token",
    );
    expect(response.headers.get("set-cookie")).toContain("Expires=");
  });
});
```

The success test must assert the response cookie contains the same request token and a future `Expires`, never a new token.

- [ ] **Step 3: Run tests and verify the helper/route are missing**

```powershell
npx vitest run src/app/api/auth/route-helpers.test.ts src/app/api/auth/session/route.test.ts
```

Expected: FAIL because `createSessionRefreshResponse` and the session route do not exist.

- [ ] **Step 4: Centralize cookie creation and implement the refresh response**

In `route-helpers.ts`, extract a private `setAuthCookie(response, token, expiresAt)` used by both login/register success and refresh. Export:

```ts
export function createSessionRefreshResponse(input: {
  sessionToken: string;
  expiresAt: Date;
}) {
  const response = NextResponse.json({ ok: true });
  setAuthCookie(response, input.sessionToken, input.expiresAt);
  return response;
}
```

Do not expose the token in JSON and do not weaken `httpOnly`, `secure`, `sameSite`, or `path`.

- [ ] **Step 5: Implement the route using a testable handler factory**

Create `src/app/api/auth/session/route.ts` with:

```ts
export function createSessionHandlers(dependencies: {
  authService?: Pick<ReturnType<typeof createAuthService>, "getCurrentUser">;
  now?: () => Date;
} = {}) {
  return {
    POST: async (request: NextRequest) => {
      const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value ?? "";
      if (!token) return createAuthRequiredResponse();
      const user = await getCurrentUserFromRequest(request, dependencies.authService);
      if (!user) return createAuthRequiredResponse();
      return createSessionRefreshResponse({
        sessionToken: token,
        expiresAt: createSessionExpiry(dependencies.now?.() ?? new Date()),
      });
    },
  };
}

export const { POST } = createSessionHandlers();
```

Use a shared 401 helper returning `{ ok:false, message:"Authentication required" }`; the client translates it, while the API contract remains stable.

- [ ] **Step 6: Run focused tests and commit**

Run the Step 3 command. Expected: all pass.

```powershell
git add src/app/api/auth/route-helpers.ts src/app/api/auth/route-helpers.test.ts src/app/api/auth/session/route.ts src/app/api/auth/session/route.test.ts
git commit -m "feat: refresh persistent web session cookies"
```

### Task 3: Centralize Web 401 handling and login messaging

**Files:**
- Create: `src/features/auth/auth-aware-fetch.ts`
- Create: `src/features/auth/auth-aware-fetch.test.ts`
- Modify: `src/features/inventory/self-hosted-inventory-client.ts`
- Modify: `src/features/inventory/self-hosted-inventory-client.test.ts`
- Modify: `src/features/family/family-client.ts`
- Modify: `src/features/family/family-client.test.ts`
- Modify: `src/features/inventory/AppDashboard.tsx`
- Modify: `src/features/inventory/AppDashboard.test.ts`
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Write failing tests for the auth-aware fetch boundary**

Specify one event only when an authenticated protected request returns 401:

```ts
it("dispatches session expiry and hides the English API body on 401", async () => {
  const dispatch = vi.fn();
  const response = await authAwareFetch("/api/inventory/items", { method: "POST" }, {
    fetcher: vi.fn(async () => new Response(
      JSON.stringify({ ok: false, message: "Authentication required" }),
      { status: 401 },
    )),
    dispatchSessionExpired: dispatch,
  });
  expect(response.status).toBe(401);
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it("does not mark failed login credentials as an expired session", async () => {
  // /api/auth/login returning 401 must not dispatch the expiry event.
});
```

- [ ] **Step 2: Run the new test and verify it fails**

```powershell
npx vitest run src/features/auth/auth-aware-fetch.test.ts
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the shared boundary**

Create:

```ts
export const SESSION_EXPIRED_EVENT = "home-inventory:session-expired";

export async function authAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  dependencies: {
    fetcher?: typeof fetch;
    dispatchSessionExpired?: () => void;
  } = {},
) {
  const fetcher = dependencies.fetcher ?? globalThis.fetch.bind(globalThis);
  const response = await fetcher(input, init);
  const path = typeof input === "string" ? input : input.toString();
  const isCredentialRequest = path.includes("/api/auth/login") ||
    path.includes("/api/auth/register");
  if (response.status === 401 && !isCredentialRequest) {
    (dependencies.dispatchSessionExpired ?? (() =>
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))))();
  }
  return response;
}
```

- [ ] **Step 4: Make protected clients use the boundary**

Change the default fetch implementation in both self-hosted inventory and family clients from `globalThis.fetch.bind(globalThis)` to `authAwareFetch`. Ensure photo reads also use the same `fetchImpl`. Add one test per client proving a 401 does not surface the literal English body as a user-facing mutation error; the expiry event owns that transition.

- [ ] **Step 5: Add dashboard refresh and expiry navigation tests**

In `AppDashboard.test.ts`, fake the refresh response and browser event. Assert:

```ts
expect(fetch).toHaveBeenCalledWith("/api/auth/session", { method: "POST" });
window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
expect(mockPush).toHaveBeenCalledWith("/login?expired=1");
```

Also assert the event listener is removed on unmount.

- [ ] **Step 6: Implement dashboard behavior**

For self-hosted users, add one mount effect that calls `authAwareFetch("/api/auth/session", { method:"POST" })`, then repeats every 24 hours while mounted. Add a separate event listener that calls `router.replace("/login?expired=1")`. Clear the interval and listener on unmount. Do not run the refresh endpoint for the retained Supabase compatibility path.

- [ ] **Step 7: Render the Chinese notice on login**

Extend login search params to `{ redirect?: string; reset?: string; expired?: string }` and give `AuthForm` this precedence:

```tsx
resetNotice={
  expired === "1"
    ? "登录已失效，请重新登录"
    : reset === "1"
      ? "密码已重置，请使用新密码登录"
      : undefined
}
```

- [ ] **Step 8: Run Web tests and commit**

```powershell
npx vitest run src/features/auth/auth-aware-fetch.test.ts src/features/inventory/self-hosted-inventory-client.test.ts src/features/family/family-client.test.ts src/features/inventory/AppDashboard.test.ts
```

Expected: all pass and no assertion displays `Authentication required`.

```powershell
git add src/features/auth/auth-aware-fetch.ts src/features/auth/auth-aware-fetch.test.ts src/features/inventory/self-hosted-inventory-client.ts src/features/inventory/self-hosted-inventory-client.test.ts src/features/family/family-client.ts src/features/family/family-client.test.ts src/features/inventory/AppDashboard.tsx src/features/inventory/AppDashboard.test.ts src/app/login/page.tsx
git commit -m "feat: redirect web users when sessions are invalid"
```

### Task 4: Make Android authenticated 401 responses return to login

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/core/session/SessionStore.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/core/session/EncryptedSessionStore.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/core/network/NetworkModule.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`
- Modify: `android/app/src/test/java/com/homeinventory/app/core/session/SessionStoreTest.kt`
- Create: `android/app/src/test/java/com/homeinventory/app/core/network/NetworkModuleTest.kt`

- [ ] **Step 1: Write failing SessionStore invalidation tests**

Require separate manual clearing and server-rejection state:

```kotlin
@Test fun invalidationClearsCookieAndMarksExpiry() {
    val store = InMemorySessionStore()
    store.saveSessionCookie("home_inventory_session=abc; Path=/")
    store.invalidateSession()
    assertNull(store.sessionCookie())
    assertTrue(store.sessionExpiredFlow.value)
}

@Test fun manualClearDoesNotMarkExpiry() {
    val store = InMemorySessionStore()
    store.saveSessionCookie("home_inventory_session=abc; Path=/")
    store.clear()
    assertNull(store.sessionCookie())
    assertFalse(store.sessionExpiredFlow.value)
}
```

- [ ] **Step 2: Write a failing OkHttp interceptor test**

Extract an internal `SessionCookieInterceptor` so it can be tested without Retrofit. With a fake chain, prove:

- a saved Cookie header is attached;
- a 401 response to a request that carried that Cookie calls `invalidateSession()`;
- a 401 login response with no saved Cookie does not publish expiry;
- a 403 does not clear the session.

- [ ] **Step 3: Run Android tests and verify failure**

```powershell
Set-Location android
.\gradlew.bat :app:testDebugUnitTest --tests "com.homeinventory.app.core.session.SessionStoreTest" --tests "com.homeinventory.app.core.network.NetworkModuleTest" --no-daemon
```

Expected: FAIL because observable expiry state, invalidation, and the extracted interceptor do not exist.

- [ ] **Step 4: Implement observable session state**

Define:

```kotlin
interface SessionStore {
    val sessionCookieFlow: StateFlow<String?>
    val sessionExpiredFlow: StateFlow<Boolean>
    fun saveSessionCookie(setCookieHeader: String)
    fun sessionCookie(): String?
    fun clear()
    fun invalidateSession()
}
```

Use two `MutableStateFlow` values in both implementations. `saveSessionCookie()` stores the cookie and sets expiry state to false; `clear()` clears the cookie and sets expiry state to false; `invalidateSession()` clears the cookie and sets expiry state to true. Persist the encrypted cookie exactly as today and never store the password.

- [ ] **Step 5: Implement the 401 interceptor**

The interceptor must capture whether a Cookie existed before the request, attach it, execute once, and call `invalidateSession()` only when `hadSession && response.code == 401`. It must not retry the request.

- [ ] **Step 6: Make AppRoot derive UI from the store**

Replace the independent remembered Boolean with:

```kotlin
val sessionCookie by sessionStore.sessionCookieFlow.collectAsState()
val sessionExpired by sessionStore.sessionExpiredFlow.collectAsState()
val isLoggedIn = sessionCookie != null

LaunchedEffect(sessionExpired) {
    if (sessionExpired) {
        errorMessage = "登录已失效，请重新登录"
    }
}
```

On successful login/register, saving the cookie updates the flow automatically. Manual logout continues calling `clear()` and must not show the expired message. Do not clear Room tables, `DraftRepository`, photos, or pending operations.

- [ ] **Step 7: Run Android tests and commit**

Run the Step 3 command. Expected: all focused tests pass.

```powershell
git add android/app/src/main/java/com/homeinventory/app/core/session/SessionStore.kt android/app/src/main/java/com/homeinventory/app/core/session/EncryptedSessionStore.kt android/app/src/main/java/com/homeinventory/app/core/network/NetworkModule.kt android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt android/app/src/test/java/com/homeinventory/app/core/session/SessionStoreTest.kt android/app/src/test/java/com/homeinventory/app/core/network/NetworkModuleTest.kt
git commit -m "feat: return android users to login on session expiry"
```

### Task 5: Full verification and truth-source evidence

**Files:**
- Modify: `dev-docs/acceptance.md`

- [ ] **Step 1: Run all Web/server tests**

```powershell
npm test
```

Expected: all non-environment-skipped Vitest tests pass.

- [ ] **Step 2: Run lint and production build**

```powershell
npx eslint src
npm run build
```

Expected: both commands exit 0; build output includes `/api/auth/session`.

- [ ] **Step 3: Run Android unit tests and build the debug APK**

```powershell
Set-Location android
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon
```

Expected: `BUILD SUCCESSFUL` and `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 4: Run local browser/API acceptance**

Using disposable local PostgreSQL only:

1. Log in and confirm `POST /api/auth/session` returns 200 plus a renewed HttpOnly cookie.
2. Set the test session row's `expires_at` into the past; confirm dashboard read and item creation still return 200.
3. Set `revoked_at`; confirm the next protected request returns 401 and Web navigates to `/login?expired=1` with “登录已失效，请重新登录”.
4. Confirm password reset still revokes every existing session.
5. Confirm cached Android inventory/drafts are not deleted by invalidation using unit assertions; no real user data is used.

- [ ] **Step 5: Record evidence without claiming deployment**

Append a dated evidence section to `dev-docs/acceptance.md` containing exact test counts, lint/build results, browser/API observations, and the explicit status “本地实现完成，生产未部署”. Do not record secrets, cookies, passwords, or full user emails.

- [ ] **Step 6: Commit verification evidence**

```powershell
git add dev-docs/acceptance.md
git commit -m "docs: record persistent session verification"
```

## Production gate

Stop after local verification. Before touching `homestorag.xyz`, the production PostgreSQL database, systemd service, or APK distribution, request explicit user authorization. The deployment run must first create and verify a database backup and preserve the current application directory for rollback; no schema migration is expected for this design, but the backup gate still applies because authentication semantics change.
