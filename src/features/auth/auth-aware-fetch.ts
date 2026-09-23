export const SESSION_EXPIRED_EVENT = "home-inventory:session-expired";
const SESSION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function setupSelfHostedSessionLifecycle({
  enabled,
  fetchImpl = globalThis.fetch,
}: {
  enabled: boolean;
  fetchImpl?: FetchLike;
}) {
  if (!enabled) {
    return () => undefined;
  }

  const refreshSession = () => {
    void authAwareFetch(
      "/api/auth/session",
      { method: "POST" },
      fetchImpl,
    ).catch(() => undefined);
  };

  refreshSession();
  const interval = setInterval(refreshSession, SESSION_REFRESH_INTERVAL_MS);

  return () => {
    clearInterval(interval);
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
