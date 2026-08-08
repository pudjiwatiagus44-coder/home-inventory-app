"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { requestPasswordReset } from "./forgot-password-client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!EMAIL_PATTERN.test(email.trim())) {
      setMessage("请输入有效邮箱");
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset({ email });
      setMessage("若邮箱已注册，重置链接已发送");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请求失败，请稍后再试");
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
        <h1 className="text-2xl font-semibold">忘记密码</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          输入注册邮箱，我们会发送一封密码重置邮件。
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
        {isSubmitting ? "发送中" : "发送重置链接"}
      </button>

      <p className="mt-4 text-center text-sm">
        <Link className="text-[var(--primary)]" href="/login">
          返回登录
        </Link>
      </p>
    </form>
  );
}
