"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validateAuthCredentials } from "@/features/auth/auth-validation";
import {
  getHouseholdForInvitation,
  submitHouseholdJoinRequest,
} from "@/features/family/family-actions";
import { normalizeInvitationToken } from "@/features/family/family-data";

type PageStatus =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "signed-out" }
  | { status: "ready"; householdName: string }
  | { status: "applying" }
  | { status: "submitted" }
  | { status: "error"; message: string };

const apkDownloadUrl =
  process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL ?? "";

export default function JoinInvitationPage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => {
    try {
      return normalizeInvitationToken(params.token ?? "");
    } catch {
      return null;
    }
  }, [params.token]);
  const [page, setPage] = useState<PageStatus>(() =>
    token ? { status: "loading" } : { status: "invalid" },
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authMessage, setAuthMessage] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;

    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const userResult = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (userResult.error || !userResult.data.user) {
        setPage({ status: "signed-out" });
        return;
      }

      try {
        const household = await getHouseholdForInvitation(
          supabase,
          token,
        );

        if (!isMounted) {
          return;
        }

        if (!household) {
          setPage({ status: "invalid" });
          return;
        }

        setPage({ status: "ready", householdName: household.householdName });
      } catch (error) {
        if (isMounted) {
          setPage({
            status: "error",
            message:
              error instanceof Error ? error.message : "加载邀请信息失败",
          });
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");

    const validation = validateAuthCredentials({ email, password });
    if (!validation.ok) {
      setAuthMessage(validation.message);
      return;
    }

    setIsSubmittingAuth(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const result =
        authMode === "sign-in"
          ? await supabase.auth.signInWithPassword({
              email: email.trim().toLowerCase(),
              password,
            })
          : await supabase.auth.signUp({
              email: email.trim().toLowerCase(),
              password,
            });

      if (result.error) {
        setAuthMessage(result.error.message);
        return;
      }

      if (authMode === "sign-up" && !result.data.session) {
        setAuthMessage("注册成功，请先完成邮箱验证后再申请加入");
        return;
      }

      const household = await getHouseholdForInvitation(
        supabase,
        token ?? "",
      );

      if (!household) {
        setPage({ status: "invalid" });
        return;
      }

      setPage({ status: "ready", householdName: household.householdName });
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "认证失败");
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleApply() {
    if (!token) {
      return;
    }

    setPage({ status: "applying" });

    try {
      const supabase = createSupabaseBrowserClient();
      await submitHouseholdJoinRequest(supabase, token);
      setPage({ status: "submitted" });
    } catch (error) {
      setPage({
        status: "error",
        message: error instanceof Error ? error.message : "提交申请失败",
      });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4 text-[var(--foreground)]">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        {page.status === "loading" ? (
          <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            加载中…
          </p>
        ) : null}

        {page.status === "invalid" ? (
          <div className="py-6 text-center">
            <h1 className="text-lg font-semibold">邀请链接无效</h1>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              链接可能已过期、已作废或地址不正确，请联系房主重新发送。
            </p>
          </div>
        ) : null}

        {page.status === "signed-out" ? (
          <div>
            <h1 className="text-lg font-semibold">加入家人的清单</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              先登录或注册账号，登录后即可申请加入这个家庭。
            </p>

            {apkDownloadUrl ? (
              <a
                className="mt-4 block rounded-md border border-[var(--border)] px-3 py-2 text-center text-sm text-[var(--primary)]"
                href={apkDownloadUrl}
                rel="noreferrer"
                target="_blank"
              >
                下载 Android App（内测版）
              </a>
            ) : null}

            <form className="mt-4 space-y-3" onSubmit={handleAuthSubmit}>
              <label className="block">
                <span className="mb-1 block text-sm">邮箱</span>
                <input
                  autoComplete="email"
                  className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--primary)]"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">密码</span>
                <input
                  autoComplete={
                    authMode === "sign-in" ? "current-password" : "new-password"
                  }
                  className="h-10 w-full rounded-md border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--primary)]"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 8 位"
                  type="password"
                  value={password}
                />
              </label>

              {authMessage ? (
                <p className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-sm">
                  {authMessage}
                </p>
              ) : null}

              <button
                className="h-10 w-full rounded-md bg-[var(--primary)] text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
                disabled={isSubmittingAuth}
                type="submit"
              >
                {isSubmittingAuth
                  ? "处理中"
                  : authMode === "sign-in"
                    ? "登录"
                    : "注册"}
              </button>
            </form>

            <button
              className="mt-3 w-full text-sm text-[var(--primary)]"
              onClick={() => {
                setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
                setAuthMessage("");
              }}
              type="button"
            >
              {authMode === "sign-in" ? "没有账号？注册" : "已有账号？登录"}
            </button>
          </div>
        ) : null}

        {page.status === "ready" ? (
          <div className="py-4 text-center">
            <h1 className="text-lg font-semibold">申请加入 {page.householdName}</h1>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              提交申请后，等待房主批准即可共同查看和编辑家庭物品清单。
            </p>
            <button
              className="mt-5 h-10 w-full rounded-md bg-[var(--primary)] text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
              onClick={() => void handleApply()}
              type="button"
            >
              申请加入
            </button>

            {apkDownloadUrl ? (
              <a
                className="mt-3 block rounded-md border border-[var(--border)] px-3 py-2 text-center text-sm text-[var(--primary)]"
                href={apkDownloadUrl}
                rel="noreferrer"
                target="_blank"
              >
                下载 Android App（内测版）
              </a>
            ) : null}
          </div>
        ) : null}

        {page.status === "applying" ? (
          <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            提交中…
          </p>
        ) : null}

        {page.status === "submitted" ? (
          <div className="py-6 text-center">
            <h1 className="text-lg font-semibold">申请已提交</h1>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              已通知房主审批，批准后你就能和家人一起维护清单了。
            </p>
          </div>
        ) : null}

        {page.status === "error" ? (
          <div className="py-6 text-center">
            <h1 className="text-lg font-semibold">操作失败</h1>
            <p className="mt-2 text-sm text-red-600">{page.message}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
