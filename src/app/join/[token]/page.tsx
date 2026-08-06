import { cookies } from "next/headers";
import Link from "next/link";

import { resolveSelfHostedAppUser } from "../../app/app-auth";
import { createRouteFamilyService } from "../../api/family/handlers";
import { normalizeInvitationToken } from "../../../features/family/family-data";
import { JoinApplyForm } from "../../../features/family/JoinApplyForm";

export default async function JoinInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const selfHostedUser = await resolveSelfHostedAppUser(await cookies());

  let token: string | null = null;

  try {
    token = normalizeInvitationToken(rawToken);
  } catch {
    token = null;
  }

  const apkDownloadUrl = process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL ?? "";

  if (!token) {
    return (
      <JoinShell>
        <h1 className="text-lg font-semibold">邀请链接无效</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          链接可能已过期、已作废或地址不正确，请联系房主重新发送。
        </p>
      </JoinShell>
    );
  }

  if (!selfHostedUser) {
    return (
      <JoinShell>
        <h1 className="text-lg font-semibold">加入家人的清单</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          先登录或注册账号，登录后即可申请加入这个家庭。
        </p>
        <Link
          className="mt-5 block rounded-md bg-[var(--primary)] px-4 py-2.5 text-center text-sm font-medium text-white"
          href={`/login?redirect=/join/${encodeURIComponent(token)}`}
        >
          去登录 / 注册
        </Link>
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
      </JoinShell>
    );
  }

  let household: { householdId: string; householdName: string } | null = null;
  let errorMessage = "";

  try {
    household =
      await createRouteFamilyService().getHouseholdForInvitationForCurrentUser({
        userId: selfHostedUser.userId,
        token,
      });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "加载邀请信息失败";
  }

  if (errorMessage) {
    return (
      <JoinShell>
        <h1 className="text-lg font-semibold">加载失败</h1>
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
      </JoinShell>
    );
  }

  if (!household) {
    return (
      <JoinShell>
        <h1 className="text-lg font-semibold">邀请链接无效</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          链接可能已过期、已作废或地址不正确，请联系房主重新发送。
        </p>
      </JoinShell>
    );
  }

  return (
    <JoinShell>
      <JoinApplyForm
        apkDownloadUrl={apkDownloadUrl}
        householdName={household.householdName}
        token={token}
      />
    </JoinShell>
  );
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4 text-[var(--foreground)]">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        {children}
      </div>
    </main>
  );
}
