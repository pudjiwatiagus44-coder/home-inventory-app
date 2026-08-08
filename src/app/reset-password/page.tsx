import Link from "next/link";

import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          className="mb-6 inline-block text-sm text-[var(--muted-foreground)]"
          href="/"
        >
          返回首页
        </Link>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-6">
            <h1 className="text-2xl font-semibold">重置链接无效</h1>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              重置链接无效或已过期，请重新申请。
            </p>
            <Link
              className="mt-4 inline-block text-sm text-[var(--primary)]"
              href="/forgot-password"
            >
              重新发送重置链接
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
