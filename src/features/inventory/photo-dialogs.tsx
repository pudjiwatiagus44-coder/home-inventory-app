"use client";

import { useEffect, useState } from "react";

export function PhotoViewerDialog({
  title,
  loadUrl,
  onAdd,
  onDismiss,
}: {
  title: string;
  loadUrl: string;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    fetch(loadUrl)
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setMissing(true);
          return;
        }
        const blob = await response.blob();
        if (!cancelled) {
          createdUrl = URL.createObjectURL(blob);
          setObjectUrl(createdUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [loadUrl]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      <p className="mb-3 text-[15px] font-semibold text-white">{title}</p>
      {objectUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={title}
          className="max-h-[70vh] max-w-full rounded-md object-contain"
          src={objectUrl}
        />
      ) : missing ? (
        <p className="text-sm text-white">照片不存在</p>
      ) : (
        <p className="text-sm text-white">加载中...</p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          onClick={onAdd}
          type="button"
        >
          拍照/选图
        </button>
        <button
          className="rounded-md bg-white px-4 py-2 text-sm text-black"
          onClick={onDismiss}
          type="button"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

export function NoPhotoDialog({
  kind,
  onTake,
  onPick,
  onDismiss,
}: {
  kind: string;
  onTake: () => void;
  onPick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <p className="text-[15px] font-semibold">
          还没有{kind}照片，拍照或从相册选择
        </p>
        <div className="mt-4 grid gap-2">
          <button
            className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
            onClick={onTake}
            type="button"
          >
            拍照
          </button>
          <button
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
            onClick={onPick}
            type="button"
          >
            从相册选择
          </button>
          <button
            className="px-3 py-2 text-sm text-[var(--muted-foreground)]"
            onClick={onDismiss}
            type="button"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
