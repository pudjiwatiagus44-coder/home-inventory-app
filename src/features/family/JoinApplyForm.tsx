"use client";

import { useState } from "react";
import { createFamilyHttpClient } from "./family-client";

type JoinApplyFormProps = {
  token: string;
  householdName: string;
  apkDownloadUrl: string;
};

type FormStatus =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "submitted" }
  | { status: "error"; message: string };

export function JoinApplyForm({
  token,
  householdName,
  apkDownloadUrl,
}: JoinApplyFormProps) {
  const [form, setForm] = useState<FormStatus>({ status: "idle" });

  async function handleApply() {
    setForm({ status: "applying" });

    try {
      await createFamilyHttpClient().submitJoinApplication(token);
      setForm({ status: "submitted" });
    } catch (error) {
      setForm({
        status: "error",
        message: error instanceof Error ? error.message : "提交申请失败",
      });
    }
  }

  return (
    <div className="py-4 text-center">
      <h1 className="text-lg font-semibold">申请加入 {householdName}</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        提交申请后，等待房主批准即可共同查看和编辑家庭物品清单。
      </p>

      {form.status === "idle" ? (
        <button
          className="mt-5 h-10 w-full rounded-md bg-[var(--primary)] text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          onClick={() => void handleApply()}
          type="button"
        >
          申请加入
        </button>
      ) : null}

      {form.status === "applying" ? (
        <p className="mt-5 text-sm text-[var(--muted-foreground)]">提交中…</p>
      ) : null}

      {form.status === "submitted" ? (
        <div className="mt-5">
          <p className="text-sm font-medium text-[var(--primary)]">
            申请已提交，等待房主批准
          </p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            批准后你就能和家人一起维护清单了。
          </p>
        </div>
      ) : null}

      {form.status === "error" ? (
        <p className="mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {form.message}
        </p>
      ) : null}

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
    </div>
  );
}
