# Feedback and Android Top Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a logged-in feedback API that emails `736259416@qq.com`, add feedback forms to Web and Android help dialogs, and reorganize the Android top bar with household arrows plus a settings menu.

**Architecture:** Web and Android both call a new `POST /api/feedback` route. The route authenticates the session, rate-limits per user, validates the message, and sends via the existing QQ SMTP mailer. Android keeps feedback/help in the help dialog; backup/import/invite/logout move into a settings menu, while household switching uses left/right arrows that cycle all joined households.

**Tech Stack:** Next.js route handlers, nodemailer, TypeScript, Vitest, Kotlin/Compose, Retrofit, Room, JUnit.

---

### Task 1: Extend SMTP mailer with feedback email support

**Files:**
- Modify: `src/server/mail/smtp-mailer.ts`
- Test: `src/server/mail/smtp-mailer.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/server/mail/smtp-mailer.test.ts`:

```ts
  it("sends a feedback email to the configured target", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
    const mailer = createSmtpMailer({
      user: "sender@qq.com",
      pass: "auth-code",
      transporter: { sendMail },
    });

    await mailer.sendFeedbackEmail({
      to: "736259416@qq.com",
      subject: "家庭物品 App 反馈 - user@example.com",
      text: "反馈内容",
      html: "<p>反馈内容</p>",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0] as SendMailInput;
    expect(mail.to).toBe("736259416@qq.com");
    expect(mail.subject).toContain("user@example.com");
    expect(mail.text).toContain("反馈内容");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/mail/smtp-mailer.test.ts`
Expected: FAIL, `sendFeedbackEmail` is not a function.

- [ ] **Step 3: Implement `sendFeedbackEmail`**

In `src/server/mail/smtp-mailer.ts`, add:

```ts
export type FeedbackMailer = {
  sendFeedbackEmail: (input: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<void>;
};

export type AppMailer = PasswordResetMailer & FeedbackMailer;
```

Change `createSmtpMailer` return type to `AppMailer` and add a method:

```ts
    async sendFeedbackEmail({ to, subject, text, html }) {
      if (!user || !pass) {
        throw new SmtpNotConfiguredError();
      }

      const transporter: SmtpMailerTransporter =
        deps.transporter ??
        (nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        }) as unknown as SmtpMailerTransporter);

      try {
        await transporter.sendMail({
          from,
          to,
          subject,
          text,
          html,
        });
      } catch (error) {
        throw new SmtpSendFailedError(error);
      }
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/mail/smtp-mailer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/mail/smtp-mailer.ts src/server/mail/smtp-mailer.test.ts
git commit -m "feat: add feedback email to smtp mailer"
```

### Task 2: Add feedback rate limiter

**Files:**
- Create: `src/server/feedback/feedback-rate-limiter.ts`
- Test: `src/server/feedback/feedback-rate-limiter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/feedback/feedback-rate-limiter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createFeedbackRateLimiter,
  FeedbackRateLimitExceededError,
} from "./feedback-rate-limiter";

describe("feedback rate limiter", () => {
  it("allows three requests and blocks the fourth", () => {
    const now = vi.fn(() => 1000);
    const limiter = createFeedbackRateLimiter({ maxRequests: 3, now });

    limiter.check("user-1");
    limiter.check("user-1");
    limiter.check("user-1");

    expect(() => limiter.check("user-1")).toThrow(
      FeedbackRateLimitExceededError,
    );
  });

  it("allows a request again after the window passes", () => {
    let current = 1000;
    const now = vi.fn(() => current);
    const limiter = createFeedbackRateLimiter({ maxRequests: 1, now });

    limiter.check("user-1");
    current += 60 * 60 * 1000 + 1;

    expect(() => limiter.check("user-1")).not.toThrow();
  });
});
```

Add `import { vi } from "vitest";` at the top.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/feedback/feedback-rate-limiter.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the limiter**

Create `src/server/feedback/feedback-rate-limiter.ts`:

```ts
export class FeedbackRateLimitExceededError extends Error {
  constructor() {
    super("反馈发送过于频繁，请稍后再试");
    this.name = "FeedbackRateLimitExceededError";
  }
}

type FeedbackRateLimiterDependencies = {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
};

export type FeedbackRateLimiter = {
  check: (key: string) => void;
};

export function createFeedbackRateLimiter(
  deps: FeedbackRateLimiterDependencies = {},
): FeedbackRateLimiter {
  const maxRequests = deps.maxRequests ?? 3;
  const windowMs = deps.windowMs ?? 60 * 60 * 1000;
  const now = deps.now ?? Date.now;
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      const currentTime = now();
      const recent = (hits.get(key) ?? []).filter(
        (timestamp) => timestamp > currentTime - windowMs,
      );

      if (recent.length >= maxRequests) {
        hits.set(key, recent);
        throw new FeedbackRateLimitExceededError();
      }

      recent.push(currentTime);
      hits.set(key, recent);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/feedback/feedback-rate-limiter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/feedback/feedback-rate-limiter.ts src/server/feedback/feedback-rate-limiter.test.ts
git commit -m "feat: add feedback rate limiter"
```

### Task 3: Add feedback service

**Files:**
- Create: `src/server/feedback/feedback-service.ts`
- Test: `src/server/feedback/feedback-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/feedback/feedback-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createFeedbackService } from "./feedback-service";

describe("feedback service", () => {
  it("sends feedback to the target with account metadata", async () => {
    const sendFeedbackEmail = vi.fn().mockResolvedValue(undefined);
    const service = createFeedbackService({
      mailer: { sendFeedbackEmail },
      to: "736259416@qq.com",
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    await service.sendFeedback({
      email: "user@example.com",
      message: "希望能支持分类筛选",
      source: "android",
      appVersion: "0.5.24",
    });

    expect(sendFeedbackEmail).toHaveBeenCalledWith({
      to: "736259416@qq.com",
      subject: "家庭物品 App 反馈 - user@example.com",
      text: expect.stringContaining("希望能支持分类筛选"),
      html: expect.stringContaining("希望能支持分类筛选"),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/feedback/feedback-service.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the service**

Create `src/server/feedback/feedback-service.ts`:

```ts
import type { FeedbackMailer } from "../mail/smtp-mailer";

type FeedbackServiceDependencies = {
  mailer: FeedbackMailer;
  to: string;
  now?: () => Date;
};

export type FeedbackService = {
  sendFeedback: (input: {
    email: string;
    message: string;
    source: "web" | "android";
    appVersion?: string;
  }) => Promise<void>;
};

export function createFeedbackService(
  deps: FeedbackServiceDependencies,
): FeedbackService {
  const now = deps.now ?? (() => new Date());

  return {
    async sendFeedback({ email, message, source, appVersion }) {
      const subject = `家庭物品 App 反馈 - ${email}`;
      const text = [
        `反馈内容：${message}`,
        `登录邮箱：${email}`,
        `来源：${source === "android" ? "Android" : "Web"}`,
        `App 版本：${appVersion ?? "未知"}`,
        `反馈时间：${now().toISOString()}`,
      ].join("\n");
      const html = [
        `<p>反馈内容：${escapeHtml(message)}</p>`,
        `<p>登录邮箱：${escapeHtml(email)}</p>`,
        `<p>来源：${source === "android" ? "Android" : "Web"}</p>`,
        `<p>App 版本：${escapeHtml(appVersion ?? "未知")}</p>`,
        `<p>反馈时间：${escapeHtml(now().toISOString())}</p>`,
      ].join("\n");

      await deps.mailer.sendFeedbackEmail({
        to: deps.to,
        subject,
        text,
        html,
      });
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/feedback/feedback-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/feedback/feedback-service.ts src/server/feedback/feedback-service.test.ts
git commit -m "feat: add feedback service"
```

### Task 4: Add feedback API route

**Files:**
- Create: `src/app/api/feedback/route.ts`
- Create: `src/app/api/feedback/handlers.ts`
- Test: `src/app/api/feedback/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/feedback/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createFeedbackHandlers } from "./handlers";
import { FeedbackRateLimitExceededError } from "../../../server/feedback/feedback-rate-limiter";
import {
  SmtpNotConfiguredError,
  SmtpSendFailedError,
} from "../../../server/mail/smtp-mailer";

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "home_inventory_session=session-token",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  it("sends feedback with the current user", async () => {
    const sendFeedback = vi.fn().mockResolvedValue(undefined);
    const { POST } = createFeedbackHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
      service: { sendFeedback },
      rateLimiter: { check: () => undefined },
    });

    const response = await POST(
      jsonRequest({ message: " 希望支持分类筛选 ", source: "android" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sendFeedback).toHaveBeenCalledWith({
      email: "user@example.com",
      message: "希望支持分类筛选",
      source: "android",
      appVersion: undefined,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = createFeedbackHandlers({
      authService: { getCurrentUser: async () => null },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/feedback", {
        method: "POST",
        body: JSON.stringify({ message: "x" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for an empty message", async () => {
    const { POST } = createFeedbackHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
    });

    const response = await POST(jsonRequest({ message: "   " }));

    expect(response.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    const { POST } = createFeedbackHandlers({
      authService: {
        getCurrentUser: async () => ({
          userId: "user-1",
          email: "user@example.com",
        }),
      },
      service: { sendFeedback: async () => undefined },
      rateLimiter: {
        check: () => {
          throw new FeedbackRateLimitExceededError();
        },
      },
    });

    const response = await POST(jsonRequest({ message: "feedback" }));

    expect(response.status).toBe(429);
  });

  it("maps SMTP configuration errors to 501 and send failures to 500", async () => {
    for (const [error, status] of [
      [new SmtpNotConfiguredError(), 501],
      [new SmtpSendFailedError(new Error("boom")), 500],
    ] as const) {
      const { POST } = createFeedbackHandlers({
        authService: {
          getCurrentUser: async () => ({
            userId: "user-1",
            email: "user@example.com",
          }),
        },
        service: {
          sendFeedback: async () => {
            throw error;
          },
        },
        rateLimiter: { check: () => undefined },
      });

      const response = await POST(jsonRequest({ message: "feedback" }));
      expect(response.status).toBe(status);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/feedback/route.test.ts`
Expected: FAIL, `./handlers` does not exist.

- [ ] **Step 3: Implement handlers and route**

Create `src/app/api/feedback/handlers.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserFromRequest } from "../auth/route-helpers";
import {
  createFeedbackRateLimiter,
  FeedbackRateLimitExceededError,
} from "../../../server/feedback/feedback-rate-limiter";
import {
  createFeedbackService,
  type FeedbackService,
} from "../../../server/feedback/feedback-service";
import {
  createSmtpMailer,
  SmtpNotConfiguredError,
  SmtpSendFailedError,
} from "../../../server/mail/smtp-mailer";
import type { createAuthService as createAuthServiceType } from "../../../server/auth/auth-service";

type CurrentUserAuthService = Pick<
  ReturnType<typeof createAuthServiceType>,
  "getCurrentUser"
>;

type FeedbackHandlerDependencies = {
  authService?: CurrentUserAuthService;
  service?: FeedbackService;
  rateLimiter?: ReturnType<typeof createFeedbackRateLimiter>;
  to?: string;
};

const defaultRateLimiter = createFeedbackRateLimiter();

export function createFeedbackHandlers(
  deps: FeedbackHandlerDependencies = {},
) {
  return {
    async POST(request: NextRequest) {
      try {
        const currentUser = await getCurrentUserFromRequest(
          request,
          deps.authService,
        );

        if (!currentUser) {
          return NextResponse.json(
            { ok: false, message: "Authentication required" },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          message?: unknown;
          source?: unknown;
          appVersion?: unknown;
        };
        const message =
          typeof body.message === "string" ? body.message.trim() : "";
        const source =
          body.source === "android" ? "android" : ("web" as const);
        const appVersion =
          typeof body.appVersion === "string" ? body.appVersion : undefined;

        if (!message || message.length > 2000) {
          return NextResponse.json(
            { ok: false, message: "反馈内容需为 1-2000 个字符" },
            { status: 400 },
          );
        }

        const rateLimiter = deps.rateLimiter ?? defaultRateLimiter;
        rateLimiter.check(currentUser.userId);

        const service =
          deps.service ??
          createFeedbackService({
            mailer: createSmtpMailer(),
            to: deps.to ?? process.env.FEEDBACK_TO_EMAIL ?? "736259416@qq.com",
          });

        await service.sendFeedback({
          email: currentUser.email,
          message,
          source,
          appVersion,
        });

        return NextResponse.json({ ok: true });
      } catch (error) {
        return createFeedbackErrorResponse(error);
      }
    },
  };
}

function createFeedbackErrorResponse(error: unknown) {
  if (error instanceof FeedbackRateLimitExceededError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 429 },
    );
  }

  if (error instanceof SmtpNotConfiguredError) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 501 },
    );
  }

  if (error instanceof SmtpSendFailedError) {
    return NextResponse.json(
      { ok: false, message: "反馈邮件发送失败" },
      { status: 500 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { ok: false, message: "Unknown feedback error" },
    { status: 500 },
  );
}
```

- [ ] **Step 4: Create route**

Create `src/app/api/feedback/route.ts`:

```ts
import { createFeedbackHandlers } from "./handlers";

export const { POST } = createFeedbackHandlers();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/app/api/feedback/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/feedback
git commit -m "feat: add feedback api route"
```

### Task 5: Android feedback API, DTO, and repository

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/repository/FeedbackRepository.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/repository/FeedbackRepositoryTest.kt`
- Modify: `android/app/src/test/java/com/homeinventory/app/data/repository/TestApiStub.kt`

- [ ] **Step 1: Write the failing test**

Create `android/app/src/test/java/com/homeinventory/app/data/repository/FeedbackRepositoryTest.kt`:

```kotlin
package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.FeedbackRequest
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.MediaType.Companion.toMediaType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

class FeedbackRepositoryTest {
    @Test
    fun submitFeedbackSendsMessageWithAndroidSource() = runTest {
        val api = RecordingFeedbackApi()
        val repository = FeedbackRepository(api = api, appVersion = "0.5.24")

        val result = repository.submitFeedback("希望支持分类筛选")

        assertTrue(result.isSuccess)
        assertEquals("希望支持分类筛选", api.lastRequest?.message)
        assertEquals("android", api.lastRequest?.source)
        assertEquals("0.5.24", api.lastRequest?.appVersion)
    }

    @Test
    fun submitFeedbackReturnsServerMessageOnFailure() = runTest {
        val api = object : TestApiStub() {
            override suspend fun submitFeedback(
                request: FeedbackRequest,
            ): Response<ApiEnvelope<Unit>> =
                Response.error(
                    400,
                    """{"ok":false,"message":"反馈内容需为 1-2000 个字符"}"""
                        .toResponseBody("application/json".toMediaType()),
                )
        }
        val repository = FeedbackRepository(api = api, appVersion = "0.5.24")

        val result = repository.submitFeedback("")

        assertTrue(result.isFailure)
        assertEquals("反馈内容需为 1-2000 个字符", result.exceptionOrNull()?.message)
    }
}

private class RecordingFeedbackApi : TestApiStub() {
    var lastRequest: FeedbackRequest? = null

    override suspend fun submitFeedback(
        request: FeedbackRequest,
    ): Response<ApiEnvelope<Unit>> {
        lastRequest = request
        return Response.success(ApiEnvelope(ok = true))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `android`: `.\gradlew.bat testDebugUnitTest --tests "com.homeinventory.app.data.repository.FeedbackRepositoryTest" --console=plain`
Expected: FAIL, unresolved `FeedbackRepository` / `submitFeedback`.

- [ ] **Step 3: Implement DTO, API, repository**

In `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`, add:

```kotlin
data class FeedbackRequest(
    val message: String,
    val source: String,
    val appVersion: String? = null,
)
```

In `HomeInventoryApi.kt`, add:

```kotlin
    @POST("api/feedback")
    suspend fun submitFeedback(
        @Body request: FeedbackRequest,
    ): Response<ApiEnvelope<Unit>>
```

Create `android/app/src/main/java/com/homeinventory/app/data/repository/FeedbackRepository.kt`:

```kotlin
package com.homeinventory.app.data.repository

import com.google.gson.JsonParser
import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.FeedbackRequest
import okhttp3.ResponseBody
import retrofit2.Response

class FeedbackRepository(
    private val api: HomeInventoryApi,
    private val appVersion: String,
) {
    suspend fun submitFeedback(message: String): Result<Unit> {
        val response = try {
            api.submitFeedback(
                FeedbackRequest(
                    message = message,
                    source = "android",
                    appVersion = appVersion,
                ),
            )
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }

        if (!response.isSuccessful || response.body()?.ok != true) {
            return Result.failure(
                IllegalStateException(
                    parseErrorMessage(response.errorBody())
                        ?: response.body()?.message
                        ?: "反馈发送失败",
                ),
            )
        }

        return Result.success(Unit)
    }

    private fun parseErrorMessage(errorBody: ResponseBody?): String? {
        if (errorBody == null) return null
        return try {
            JsonParser.parseString(errorBody.string())
                .asJsonObject["message"]
                ?.asString
        } catch (_: Exception) {
            null
        }
    }
}
```

In `TestApiStub.kt`, add a default implementation:

```kotlin
    override suspend fun submitFeedback(
        request: FeedbackRequest,
    ): Response<ApiEnvelope<Unit>> = Response.success(ApiEnvelope(ok = true))
```

Add the import for `FeedbackRequest`.

- [ ] **Step 4: Run test to verify it passes**

Run from `android`: `.\gradlew.bat testDebugUnitTest --tests "com.homeinventory.app.data.repository.FeedbackRepositoryTest" --console=plain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt android/app/src/main/java/com/homeinventory/app/data/repository/FeedbackRepository.kt android/app/src/test/java/com/homeinventory/app/data/repository/FeedbackRepositoryTest.kt android/app/src/test/java/com/homeinventory/app/data/repository/TestApiStub.kt
git commit -m "feat: add android feedback submission"
```

### Task 6: Android HelpDialog feedback form

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/HelpDialog.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardHost.kt`

- [ ] **Step 1: Write the failing test**

Add a source-level test to `android/app/src/test/java/com/homeinventory/app/ui/dashboard/DashboardViewModelTest.kt` or create `android/app/src/test/java/com/homeinventory/app/ui/dashboard/dialogs/HelpDialogTest.kt`:

```kotlin
package com.homeinventory.app.ui.dashboard.dialogs

import java.nio.file.Files
import java.nio.file.Path
import org.junit.Assert.assertTrue
import org.junit.Test

class HelpDialogTest {
    @Test
    fun helpDialogContainsFeedbackForm() {
        val source = Files.readString(
            Path.of("src/main/java/com/homeinventory/app/ui/dashboard/dialogs/HelpDialog.kt"),
        )
        assertTrue(source.contains("意见反馈"))
        assertTrue(source.contains("提交反馈"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `android`: `.\gradlew.bat testDebugUnitTest --tests "com.homeinventory.app.ui.dashboard.dialogs.HelpDialogTest" --console=plain`
Expected: FAIL, no "意见反馈" text.

- [ ] **Step 3: Implement feedback UI**

Change `HelpDialog` signature:

```kotlin
@Composable
fun HelpDialog(
    onSubmitFeedback: suspend (String) -> Result<Unit>,
    onDismiss: () -> Unit,
)
```

Add local state and coroutine scope:

```kotlin
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch

var feedback by remember { mutableStateOf("") }
var feedbackStatus by remember { mutableStateOf<String?>(null) }
val scope = rememberCoroutineScope()
```

Before the closing button, add:

```kotlin
            HelpSection(title = "意见反馈", lines = emptyList())
            OutlinedTextField(
                value = feedback,
                onValueChange = { feedback = it },
                label = { Text("反馈内容") },
                placeholder = { Text("说说你的建议或遇到的问题") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            feedbackStatus?.let {
                Text(
                    text = it,
                    fontSize = 13.sp,
                    color = if (it == "反馈已发送") {
                        androidx.compose.ui.graphics.Color(0xFF2F7D32)
                    } else {
                        Danger
                    },
                )
            }
            Button(
                onClick = {
                    scope.launch {
                        feedbackStatus = null
                        onSubmitFeedback(feedback.trim())
                            .onSuccess {
                                feedback = ""
                                feedbackStatus = "反馈已发送"
                            }
                            .onFailure { error ->
                                feedbackStatus = error.message ?: "反馈发送失败"
                            }
                    }
                },
                enabled = feedback.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("提交反馈")
            }
```

Update the family help text from “点顶部当前家庭名称可切换” to “右上角左右箭头可切换家庭”。

- [ ] **Step 4: Wire repository**

In `AppRoot.kt`, create the repository and pass it:

```kotlin
    val feedbackRepository = remember {
        FeedbackRepository(api = api, appVersion = BuildConfig.VERSION_NAME)
    }
```

Pass to `DashboardHost`:

```kotlin
            DashboardHost(
                viewModel = viewModel,
                repository = repository,
                authRepository = authRepository,
                database = app.database,
                importExportRepository = importExportRepository,
                feedbackRepository = feedbackRepository,
                onSignedOut = { isLoggedIn = false },
            )
```

In `DashboardHost`, add parameter `feedbackRepository: FeedbackRepository` and pass:

```kotlin
        HelpDialog(
            onSubmitFeedback = feedbackRepository::submitFeedback,
            onDismiss = { showHelpDialog = false },
        )
```

- [ ] **Step 5: Run test to verify it passes**

Run from `android`: `.\gradlew.bat testDebugUnitTest --console=plain`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/HelpDialog.kt android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardHost.kt android/app/src/test/java/com/homeinventory/app/ui/dashboard/dialogs/HelpDialogTest.kt
git commit -m "feat: add feedback form to android help dialog"
```

### Task 7: Android top bar household dropdown and settings menu

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardViewModel.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardHost.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardScreen.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/TopBar.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/ui/dashboard/DashboardViewModelTest.kt`

- [ ] **Step 1: Update TopBar**

Replace `TopBar.kt` with the new layout:

```kotlin
@Composable
fun TopBar(
    householdName: String?,
    onSwitchHousehold: () -> Unit,
    onDraftsClick: () -> Unit,
    draftCount: Int,
    onBackup: () -> Unit,
    onImport: () -> Unit,
    onInvite: () -> Unit,
    onHelp: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var settingsExpanded by remember { mutableStateOf(false) }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f),
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Primary),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "家",
                    color = Surface,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = householdName ?: "家中清单",
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        TextButton(onClick = onSwitchHousehold) { Text("⌄") }
        TextButton(onClick = onDraftsClick) {
            Text("草稿")
            if (draftCount > 0) {
                Spacer(modifier = Modifier.width(3.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Primary)
                        .padding(horizontal = 5.dp, vertical = 1.dp),
                ) {
                    Text(
                        text = "$draftCount",
                        color = Surface,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        TextButton(onClick = onHelp) { Text("帮助") }
        Box {
            TextButton(onClick = { settingsExpanded = true }) { Text("设置") }
            DropdownMenu(
                expanded = settingsExpanded,
                onDismissRequest = { settingsExpanded = false },
            ) {
                DropdownMenuItem(
                    text = { Text("备份") },
                    onClick = { settingsExpanded = false; onBackup() },
                )
                DropdownMenuItem(
                    text = { Text("导入") },
                    onClick = { settingsExpanded = false; onImport() },
                )
                DropdownMenuItem(
                    text = { Text("邀请") },
                    onClick = { settingsExpanded = false; onInvite() },
                )
                DropdownMenuItem(
                    text = { Text("退出") },
                    onClick = { settingsExpanded = false; onSignOut() },
                )
            }
        }
    }
}
```

Add imports:

```kotlin
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
```

- [ ] **Step 2: Update DashboardScreen and DashboardHost**

In `DashboardScreen.kt`, add params:

```kotlin
    onSwitchHousehold: () -> Unit,
```

Pass to `TopBar`.

In `DashboardHost.kt`, compute:

```kotlin
        onSwitchHousehold = {
            showHouseholdSwitcher = true
            viewModel.refreshHouseholds()
        },
```

- [ ] **Step 3: Run tests**

Run from `android`: `.\gradlew.bat testDebugUnitTest --console=plain`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/dashboard
git commit -m "feat: add household switch button and settings menu to android top bar"
```

### Task 8: Server household rename

**Files:**
- Modify: `src/features/family/family-repository.ts`
- Modify: `src/features/family/family-service.ts`
- Modify: `src/features/family/family-client.ts`
- Modify: `src/app/api/family/households/route.ts`
- Modify: `src/app/api/family/handlers.ts`
- Test: `src/features/family/family-service.test.ts`
- Test: `src/app/api/family/family-handlers.test.ts`

- [ ] **Step 1: Write failing service test**

Add to `src/features/family/family-service.test.ts`:

```ts
  it("renames a household when the caller is owner", async () => {
    const repository = createFamilyRepositoryStub();
    repository.getHouseholdOwner = async () => "user-1";
    repository.renameHousehold = async (householdId, name) => ({
      id: householdId,
      name,
    });
    const service = createFamilyService({ repository });

    await expect(
      service.renameHouseholdForCurrentUser({
        userId: "user-1",
        householdId: "household-1",
        name: "新家名",
      }),
    ).resolves.toEqual({ id: "household-1", name: "新家名" });
  });

  it("rejects renaming when the caller is not owner", async () => {
    const repository = createFamilyRepositoryStub();
    repository.getHouseholdOwner = async () => "user-owner";
    const service = createFamilyService({ repository });

    await expect(
      service.renameHouseholdForCurrentUser({
        userId: "user-1",
        householdId: "household-1",
        name: "新家名",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
```

- [ ] **Step 2: Run failing test**

Run: `npm test -- src/features/family/family-service.test.ts`
Expected: FAIL, unresolved `renameHouseholdForCurrentUser`.

- [ ] **Step 3: Implement repository and service**

Add to `FamilyRepository`:

```ts
  renameHousehold: (
    householdId: string,
    name: string,
  ) => Promise<{ id: string; name: string }>;
```

Add SQL implementation:

```ts
    async renameHousehold(householdId, name) {
      const result = await client.query<{ id: string; name: string }>(
        `update households set name = $2 where id = $1 returning id, name`,
        [householdId, name],
      );
      return result.rows[0];
    },
```

Add service method:

```ts
    async renameHouseholdForCurrentUser(input: {
      userId: string;
      householdId: string;
      name: string;
    }) {
      const normalizedName = input.name.trim();
      if (!normalizedName || normalizedName.length > 50) {
        throw new Error("家庭名称需为 1-50 个字符");
      }
      await assertOwner(input.userId, input.householdId);
      return repository.renameHousehold(input.householdId, normalizedName);
    },
```

- [ ] **Step 4: Add API handler and route**

In `createFamilyHandlers`, add:

```ts
    async renameHousehold(request: NextRequest) {
      try {
        const user = await requireUser(request);
        if (!user) return unauthorizedResponse();
        const body = await readJsonObject(request);
        const householdId = textField(body, "householdId");
        const name = textField(body, "name");
        if (!householdId) return requireHouseholdId("");
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
```

In `src/app/api/family/households/route.ts`, add:

```ts
export async function PATCH(request: NextRequest) {
  return handlers.renameHousehold(request);
}
```

Add `renameHousehold` to `family-client.ts`:

```ts
    renameHousehold(householdId: string, name: string) {
      return request<{ id: string; name: string }>(
        "/api/family/households",
        jsonInit("PATCH", { householdId, name }),
      );
    },
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/features/family/family-service.test.ts src/app/api/family/family-handlers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/family src/app/api/family
git commit -m "feat: allow owner to rename household"
```

### Task 9: Android household rename UI

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/TopBar.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/HouseholdSwitcherDialog.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt`

- [ ] **Step 1: Add API and repository rename support with tests**

Add DTO:

```kotlin
data class RenameHouseholdRequest(
    val householdId: String,
    val name: String,
)
```

Add API:

```kotlin
    @PATCH("api/family/households")
    suspend fun renameHousehold(
        @Body request: RenameHouseholdRequest,
    ): Response<ApiEnvelope<RemoteHouseholdDto>>
```

Add repository method:

```kotlin
    suspend fun renameCurrentHousehold(name: String): Result<Unit> {
        val householdId = currentHouseholdId ?: return Result.failure(
            IllegalStateException("家庭信息未加载，请先刷新清单"),
        )
        val response = try {
            api.renameHousehold(RenameHouseholdRequest(householdId, name))
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        if (!response.isSuccessful || response.body()?.ok != true) {
            return Result.failure(
                IllegalStateException(
                    parseErrorMessage(response.errorBody())
                        ?: response.body()?.message
                        ?: "重命名失败",
                ),
            )
        }
        return Result.success(Unit)
    }
```

Add tests in `InventoryRepositoryTest.kt` for success and non-owner failure.

- [ ] **Step 2: Add long-press rename to TopBar**

Add `onRenameHousehold: () -> Unit` to `TopBar`, and use `combinedClickable` on the household name `Row` so long press triggers rename.

Add a rename dialog in `HouseholdSwitcherDialog.kt` or a new `RenameHouseholdDialog.kt` that calls `repository.renameCurrentHousehold`.

- [ ] **Step 3: Run Android tests**

Run from `android`: `.\gradlew.bat testDebugUnitTest --console=plain`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/homeinventory/app
git commit -m "feat: support android household rename"
```

### Task 10: Web feedback client and help dialog

**Files:**
- Create: `src/features/feedback/feedback-client.ts`
- Create: `src/features/feedback/feedback-client.test.ts`
- Create: `src/features/feedback/FeedbackDialog.tsx`
- Modify: `src/features/inventory/AppDashboard.tsx`
- Modify: `src/features/inventory/AppDashboard.test.ts`

- [ ] **Step 1: Write the failing client test**

Create `src/features/feedback/feedback-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createFeedbackClient } from "./feedback-client";

describe("feedback client", () => {
  it("posts feedback with web source", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const client = createFeedbackClient({ fetch });

    await client.submitFeedback("希望能支持分类筛选");

    expect(fetch).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "希望能支持分类筛选",
          source: "web",
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/feedback/feedback-client.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement client**

Create `src/features/feedback/feedback-client.ts`:

```ts
type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ClientOptions = { fetch?: FetchLike };

type ApiResponse = { ok: boolean; message?: string };

export function createFeedbackClient({
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
}: ClientOptions = {}) {
  return {
    async submitFeedback(message: string) {
      const response = await fetchImpl("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, source: "web" }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!payload.ok) {
        throw new Error(payload.message ?? "反馈发送失败");
      }
    },
  };
}
```

- [ ] **Step 4: Add FeedbackDialog**

Create `src/features/feedback/FeedbackDialog.tsx`:

```tsx
"use client";

import { useState } from "react";

export function FeedbackDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (message: string) => Promise<void>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim() || status === "sending") return;

    setStatus("sending");
    setErrorMessage("");
    try {
      await onSubmit(message.trim());
      setMessage("");
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "反馈发送失败");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
      <form
        className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-semibold">意见反馈</h2>
        <textarea
          className="mt-3 min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-sm outline-none focus:border-[var(--primary)]"
          maxLength={2000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="说说你的建议或遇到的问题"
          value={message}
        />
        {status === "success" ? (
          <p className="mt-2 text-sm text-[#2f7d32]">反馈已发送</p>
        ) : null}
        {status === "error" ? (
          <p className="mt-2 text-sm text-[#c2410c]">{errorMessage}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
          <button
            className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
            disabled={!message.trim() || status === "sending"}
            type="submit"
          >
            {status === "sending" ? "发送中…" : "提交反馈"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Wire into AppDashboard**

In `AppDashboard.tsx`:

- Add `showHelpDialog` state.
- Add a “帮助” button in the header right side.
- Render `HelpDialog` when open, passing `createFeedbackClient().submitFeedback`.

Add imports:

```tsx
import { createFeedbackClient } from "../feedback/feedback-client";
import { FeedbackDialog } from "../feedback/FeedbackDialog";
```

Add state:

```tsx
const [showHelpDialog, setShowHelpDialog] = useState(false);
```

Render:

```tsx
      {showHelpDialog ? (
        <FeedbackDialog
          onSubmit={(message) => createFeedbackClient().submitFeedback(message)}
          onClose={() => setShowHelpDialog(false)}
        />
      ) : null}
```

Add a source-level assertion to `AppDashboard.test.ts`:

```ts
  it("adds a help entry with feedback", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("showHelpDialog");
    expect(source).toContain("帮助");
  });
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/features/feedback/feedback-client.test.ts src/features/inventory/AppDashboard.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/feedback src/features/inventory/AppDashboard.tsx src/features/inventory/AppDashboard.test.ts
git commit -m "feat: add web feedback help dialog"
```

### Task 11: Docs, version bump, and upload

**Files:**
- Modify: `android/app/build.gradle.kts`
- Modify: `dev-docs/acceptance.md`
- Modify: `dev-docs/user-manual.md`
- Modify: `dev-docs/project-brief.md`

- [ ] **Step 1: Bump version**

Change `android/app/build.gradle.kts`:

```kotlin
versionCode = 30
versionName = "0.5.24"
```

- [ ] **Step 2: Update docs**

Add a 2026-08-11 acceptance section describing:

- feedback API sends to `736259416@qq.com`
- Web and Android help feedback
- Android top bar arrows and settings menu
- tests run and APK upload

Update `dev-docs/user-manual.md` help/family sections to describe arrows and settings menu.

- [ ] **Step 3: Run final verification**

Run:

```bash
npx vitest run --exclude src/server/auth/postgres-auth-repository.integration.test.ts --exclude src/features/inventory/postgres-inventory.integration.test.ts
npx eslint src
cd android && .\gradlew.bat testDebugUnitTest && .\gradlew.bat assembleDebug
```

Expected: all PASS and BUILD SUCCESSFUL.

- [ ] **Step 4: Upload APK**

Run: `.\scripts\upload-apk.ps1`
Then restart the server:

```bash
ssh -o BatchMode=yes -i "$env:USERPROFILE\Downloads\serverkey.pem" root@120.24.93.226 "systemctl restart home-inventory-app && systemctl is-active home-inventory-app"
```

Verify:

```bash
curl.exe --noproxy '*' -sS https://homestorag.xyz/apk/version.json
```

Expected: version 0.5.24 / code 30.

- [ ] **Step 5: Commit**

```bash
git add android/app/build.gradle.kts dev-docs/acceptance.md dev-docs/user-manual.md dev-docs/project-brief.md
git commit -m "feat: release feedback and top bar 0.5.24"
```
