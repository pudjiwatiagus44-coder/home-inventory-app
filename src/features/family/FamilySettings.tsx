"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  approveHouseholdJoinRequest,
  createHouseholdInvitationLink,
  listHouseholdInvitations,
  listHouseholdJoinRequests,
  listHouseholdMembers,
  rejectHouseholdJoinRequest,
  removeHouseholdMember,
  revokeHouseholdInvitationLink,
} from "./family-actions";
import {
  getInvitationStatus,
  type FamilyJoinRequestRow,
  type FamilyMemberRow,
  type InvitationLinkRow,
} from "./family-data";

type FamilySettingsProps = {
  householdId: string;
  householdName: string;
  isOwner: boolean;
  onClose: () => void;
};

type PanelMessage =
  | { kind: "info" | "error"; text: string }
  | null;

export function FamilySettings({
  householdId,
  householdName,
  isOwner,
  onClose,
}: FamilySettingsProps) {
  const [links, setLinks] = useState<InvitationLinkRow[]>([]);
  const [requests, setRequests] = useState<FamilyJoinRequestRow[]>([]);
  const [members, setMembers] = useState<FamilyMemberRow[]>([]);
  const [message, setMessage] = useState<PanelMessage>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();

    const [linksResult, requestsResult, membersResult] = await Promise.all([
      listHouseholdInvitations(supabase, { householdId }).catch((error) => {
        throw error;
      }),
      isOwner
        ? listHouseholdJoinRequests(supabase, { householdId }).catch(
            (error) => {
              throw error;
            },
          )
        : Promise.resolve([]),
      listHouseholdMembers(supabase, { householdId }).catch((error) => {
        throw error;
      }),
    ]);

    setLinks(linksResult);
    setRequests(requestsResult);
    setMembers(membersResult);
  }, [householdId, isOwner]);

  useEffect(() => {
    let isMounted = true;

    void Promise.resolve()
      .then(() => refresh())
      .catch((error) => {
        if (isMounted) {
          setMessage({
            kind: "error",
            text: error instanceof Error ? error.message : "加载家庭设置失败",
          });
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refresh]);

  async function handleGenerateLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsGenerating(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const result = await createHouseholdInvitationLink(supabase, {
        householdId,
        origin: window.location.origin,
      });

      await navigator.clipboard?.writeText(result.url);
      setMessage({
        kind: "info",
        text: `邀请链接已生成并复制：${result.url}`,
      });
      setLinks(await listHouseholdInvitations(supabase, { householdId }));
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "生成邀请链接失败",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRevokeLink(linkId: string) {
    if (!window.confirm("作废这条邀请链接？已发送的链接将立即失效。")) {
      return;
    }

    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      await revokeHouseholdInvitationLink(supabase, { linkId });
      setLinks(await listHouseholdInvitations(supabase, { householdId }));
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "作废链接失败",
      });
    }
  }

  async function handleApprove(requestId: string) {
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      await approveHouseholdJoinRequest(supabase, { requestId });
      await refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "批准申请失败",
      });
    }
  }

  async function handleReject(requestId: string) {
    if (!window.confirm("拒绝这条加入申请？")) {
      return;
    }

    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      await rejectHouseholdJoinRequest(supabase, { requestId });
      await refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "拒绝申请失败",
      });
    }
  }

  async function handleRemoveMember(userId: string, email: string) {
    if (!window.confirm(`确认移除成员 ${email}？对方将立即失去家庭清单访问权。`)) {
      return;
    }

    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      await removeHouseholdMember(supabase, { householdId, userId });
      await refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "移除成员失败",
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">家庭设置</h2>
            <p className="text-sm text-[var(--muted-foreground)]">{householdName}</p>
          </div>
          <button
            aria-label="关闭"
            className="rounded-md px-2 py-1 text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>

        {message ? (
          <p
            className={
              message.kind === "error"
                ? "mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                : "mb-4 rounded-md bg-[var(--surface-muted)] px-3 py-2 text-sm"
            }
          >
            {message.text}
          </p>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            加载中…
          </p>
        ) : (
          <div className="space-y-6">
            {isOwner ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">邀请家人</h3>
                <p className="mb-2 text-[13px] text-[var(--muted-foreground)]">
                  生成链接后复制发送到微信，家人打开链接即可申请加入。
                </p>
                <form className="flex gap-2" onSubmit={handleGenerateLink}>
                  <button
                    className="h-9 flex-1 rounded-md bg-[var(--primary)] px-3 text-[13px] font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
                    disabled={isGenerating}
                    type="submit"
                  >
                    {isGenerating ? "生成中…" : "生成邀请链接"}
                  </button>
                </form>

                {links.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {links.map((link) => {
                      const status = getInvitationStatus(link);

                      return (
                        <li
                          className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2"
                          key={link.id}
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {status === "active" ? "有效" : status === "expired" ? "已过期" : "已作废"}
                            <span className="ml-2 text-[var(--muted-foreground)]">
                              {new Date(link.expires_at).toLocaleDateString()} 过期
                            </span>
                          </span>
                          {status === "active" ? (
                            <div className="flex shrink-0 gap-1">
                              <button
                                className="rounded-md px-2 py-1 text-[12px] text-[var(--primary)]"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(
                                    `${window.location.origin}/join/${encodeURIComponent(link.token)}`,
                                  );
                                  setMessage({
                                    kind: "info",
                                    text: "邀请链接已复制",
                                  });
                                }}
                                type="button"
                              >
                                复制
                              </button>
                              <button
                                className="rounded-md px-2 py-1 text-[12px] text-red-600"
                                onClick={() => void handleRevokeLink(link.id)}
                                type="button"
                              >
                                作废
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {isOwner && requests.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">加入申请</h3>
                <ul className="space-y-2">
                  {requests
                    .filter((request) => request.status === "pending")
                    .map((request) => (
                      <li
                        className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2"
                        key={request.id}
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {request.email}
                          <span className="ml-2 text-[var(--muted-foreground)]">
                            {new Date(request.created_at).toLocaleString()}
                          </span>
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            className="rounded-md bg-[var(--primary)] px-2 py-1 text-[12px] text-white"
                            onClick={() => void handleApprove(request.id)}
                            type="button"
                          >
                            批准
                          </button>
                          <button
                            className="rounded-md border border-[var(--border)] px-2 py-1 text-[12px]"
                            onClick={() => void handleReject(request.id)}
                            type="button"
                          >
                            拒绝
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-sm font-semibold">成员</h3>
              {members.length === 0 ? (
                <p className="text-[13px] text-[var(--muted-foreground)]">
                  暂无成员
                </p>
              ) : (
                <ul className="space-y-2">
                  {members.map((member) => (
                    <li
                      className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2"
                      key={member.user_id}
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {member.email}
                        <span className="ml-2 text-[var(--muted-foreground)]">
                          {member.role === "owner" ? "房主" : "成员"}
                        </span>
                      </span>
                      {isOwner && member.role === "member" ? (
                        <button
                          className="shrink-0 rounded-md px-2 py-1 text-[12px] text-red-600"
                          onClick={() =>
                            void handleRemoveMember(member.user_id, member.email)
                          }
                          type="button"
                        >
                          移除
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
