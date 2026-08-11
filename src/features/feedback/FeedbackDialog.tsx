"use client";

import { FormEvent, useState } from "react";

export function FeedbackDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (message: string) => Promise<void>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || status === "sending") return;

    setStatus("sending");
    setErrorMessage("");
    try {
      await onSubmit(message.trim());
      setMessage("");
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "反馈发送失败");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
      <form
        className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-semibold">意见反馈</h2>
        <textarea
          className="mt-3 min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-sm outline-none focus:border-[var(--primary)]"
          maxLength={2000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="说说你的建议或遇到的问题"
          value={message}
        />
        {status === "success" ? (
          <p className="mt-2 text-sm text-[#2f7d32]">反馈已发送</p>
        ) : null}
        {status === "error" ? (
          <p className="mt-2 text-sm text-[#c2410c]">{errorMessage}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
          <button
            className="h-10 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60"
            disabled={!message.trim() || status === "sending"}
            type="submit"
          >
            {status === "sending" ? "发送中…" : "提交反馈"}
          </button>
        </div>
      </form>
    </div>
  );
}
