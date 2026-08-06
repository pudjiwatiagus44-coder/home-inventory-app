import Link from "next/link";
import { AuthForm } from "@/features/auth/AuthForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          className="mb-6 inline-block text-sm text-[var(--muted-foreground)]"
          href="/"
        >
          返回首页
        </Link>
        <AuthForm redirect={redirect} />
      </div>
    </main>
  );
}
