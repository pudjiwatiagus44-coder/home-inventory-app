export const SESSION_EXPIRED_EVENT = "home-inventory:session-expired";
const SESSION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type SessionEventTarget = {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
};

export function setupSelfHostedSessionLifecycle({
  enabled,
  fetchImpl,
  browserWindow,
  replace,
}: {
  enabled: boolean;
  fetchImpl: FetchLike;
  browserWindow: SessionEventTarget;
  replace: (href: string) => void;
}) {
  if (!enabled) {
    return () => undefined;
  }

  const refreshSession = () => {
    void fetchImpl("/api/auth/session", { method: "POST" }).catch(() => undefined);
  };
  const handleSessionExpired = () => replace("/login?expired=1");

  refreshSession();
  const interval = setInterval(refreshSession, SESSION_REFRESH_INTERVAL_MS);
  browserWindow.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

  return () => {
    clearInterval(interval);
    browserWindow.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  };
}

const credentialEndpoints = new Set([
  "/api/auth/login",
  "/api/auth/register",
]);

export async function authAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImpl: FetchLike = globalThis.fetch,
) {
  const response = await fetchImpl(input, init);

  if (
    response.status === 401 &&
    !credentialEndpoints.has(getRequestPath(input)) &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  return response;
}

function getRequestPath(input: RequestInfo | URL) {
  const value = input instanceof Request ? input.url : String(input);

  try {
    return new URL(value, "http://localhost").pathname;
  } catch {
    return value.split("?")[0];
  }
}
