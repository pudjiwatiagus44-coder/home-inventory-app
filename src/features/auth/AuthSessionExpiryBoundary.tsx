"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { SESSION_EXPIRED_EVENT } from "./auth-aware-fetch";

type SessionEventTarget = {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
};

export function setupAuthSessionExpiryListener(
  browserWindow: SessionEventTarget,
  replace: (href: string) => void,
) {
  const handleSessionExpired = () => replace("/login?expired=1");
  browserWindow.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

  return () => {
    browserWindow.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  };
}

export function AuthSessionExpiryBoundary() {
  const router = useRouter();

  useEffect(
    () => setupAuthSessionExpiryListener(window, (href) => router.replace(href)),
    [router],
  );

  return null;
}
