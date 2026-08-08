"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { resetPassword } from "./reset-password-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("密码至少需要 8 位");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("两次输入的密码不一致");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword({ token, password });
      router.push("/login?reset=1");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重置失败，请稍后再试");
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
        <h1 className="text-2xl font-semibold">设置新密码</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          重置链接仅 30 分钟内有效，请设置一个新密码。
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">新密码</span>
        <input
          className="h-11 w-full rounded-md border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--primary)]"
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="至少 8 位"
          type="password"
          value={password}
        />
      </label>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">确认新密码</span>
        <input
          className="h-11 w-full rounded-md border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--primary)]"
          autoComplete="new-password"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="再次输入新密码"
          type="password"
          value={confirmPassword}
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
        {isSubmitting ? "提交中" : "设置新密码"}
      </button>
    </form>
  );
}
