"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { validateAuthCredentials } from "./auth-validation";
import { authenticateWithSelfHostedApi } from "./self-hosted-auth-client";
import {
  clearSavedEmail,
  getSavedEmail,
  saveEmail,
} from "./remembered-email";

type AuthMode = "sign-in" | "sign-up";

export function AuthForm({
  redirect,
  resetNotice,
}: {
  redirect?: string;
  resetNotice?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState(resetNotice);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedEmail = getSavedEmail();

    if (savedEmail) {
      // localStorage is only readable on the client after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail(savedEmail);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setNotice(undefined);

    const validation = validateAuthCredentials({ email, password });
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    setIsSubmitting(true);
    try {
      await authenticateWithSelfHostedApi({
        mode,
        email,
        password,
      });

      if (rememberEmail) {
        saveEmail(email.trim().toLowerCase());
      } else {
        clearSavedEmail();
      }

      router.push(
        redirect && redirect.startsWith("/") ? redirect : "/app",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "认证请求失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-6"
      onSubmit={handleSubmit}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">
          {mode === "sign-in" ? "登录" : "注册"}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          使用邮箱和密码进入你的家庭物品清单。
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">邮箱</span>
        <input
          className="h-11 w-full rounded-md border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--primary)]"
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
      </label>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">密码</span>
        <input
          className="h-11 w-full rounded-md border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--primary)]"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="至少 8 位"
          type="password"
          value={password}
        />
      </label>

      {mode === "sign-in" ? (
        <div className="mb-4 flex justify-end">
          <Link
            className="text-sm text-[var(--primary)]"
            href="/forgot-password"
          >
            忘记密码？
          </Link>
        </div>
      ) : null}

      {notice ? (
        <p className="mb-4 rounded-md bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)]">
          {notice}
        </p>
      ) : null}

      {message ? (
        <p className="mb-4 rounded-md bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)]">
          {message}
        </p>
      ) : null}

      <button
        className="h-11 w-full rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "处理中" : mode === "sign-in" ? "登录" : "注册"}
      </button>

      <label className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
        <input
          checked={rememberEmail}
          onChange={(event) => setRememberEmail(event.target.checked)}
          type="checkbox"
        />
        记住邮箱
      </label>

      <button
        className="mt-4 w-full text-sm text-[var(--primary)]"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setMessage("");
        }}
        type="button"
      >
        {mode === "sign-in" ? "没有账号？注册" : "已有账号？登录"}
      </button>
    </form>
  );
}
