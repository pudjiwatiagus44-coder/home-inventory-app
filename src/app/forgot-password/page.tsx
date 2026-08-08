import Link from "next/link";

import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          className="mb-6 inline-block text-sm text-[var(--muted-foreground)]"
          href="/"
        >
          返回首页
        </Link>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
