type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ClientOptions = { fetch?: FetchLike };

type ApiResponse = { ok: boolean; message?: string };

export function createFeedbackClient({
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
}: ClientOptions = {}) {
  return {
    async submitFeedback(message: string) {
      const response = await fetchImpl("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, source: "web" }),
      });
      const payload = (await response.json()) as ApiResponse;

      if (!payload.ok) {
        throw new Error(payload.message ?? "反馈发送失败");
      }
    },
  };
}
