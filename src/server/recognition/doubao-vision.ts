export type DoubaoRecognitionResult =
  | { ok: true; value: string }
  | { ok: false; reason: "api_key_missing" | "upstream_error" | "not_recognized" };

export type DoubaoVisionClient = {
  recognizeItemDetails: (jpegBuffer: Buffer) => Promise<DoubaoItemDetailsResult>;
  recognizeExpireDate: (jpegBuffer: Buffer) => Promise<DoubaoRecognitionResult>;
};

export type DoubaoItemDetails = {
  name: string;
  note: string | null;
};

export type DoubaoItemDetailsResult =
  | { ok: true; value: DoubaoItemDetails }
  | { ok: false; reason: "api_key_missing" | "upstream_error" | "not_recognized" };

export class DoubaoApiKeyMissingError extends Error {
  constructor() {
    super("DOUBAO_API_KEY is required for photo recognition");
    this.name = "DoubaoApiKeyMissingError";
  }
}

type DoubaoVisionDependencies = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const ITEM_DETAILS_PROMPT =
  "请识别图片中的物品。第一行只返回一个详细的中文名称，尽量包含品牌和规格等关键信息，例如“蒙牛纯牛奶250ml”，不要解释，不要加标点。第二行返回一句简短备注，说明规格、材质或保存方式等，例如“常温保存”或“约500g”，如果没有可补充的信息就不要输出第二行。如果无法识别，只返回“无法识别”。";

const EXPIRE_PROMPT =
  "请识别图片中印刷的有效期（或保质期、过期日期、生产日期）。只返回 YYYY-MM-DD 或 YYYY-MM 格式的日期；如果图片里没有日期，只返回“无”。不要解释。";

export function createDoubaoVisionClient(
  deps: DoubaoVisionDependencies = {},
): DoubaoVisionClient {
  const apiKey =
    deps.apiKey ?? process.env.DOUBAO_API_KEY?.trim() ?? "";
  const model =
    deps.model ??
    process.env.DOUBAO_VISION_MODEL?.trim() ??
    "doubao-1.5-vision-lite-250315";
  const baseUrl =
    deps.baseUrl ??
    process.env.DOUBAO_VISION_BASE_URL?.trim() ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  async function complete(
    prompt: string,
    jpegBuffer: Buffer,
  ): Promise<DoubaoRecognitionResult> {
    if (!apiKey) {
      return { ok: false, reason: "api_key_missing" };
    }

    const base64 = jpegBuffer.toString("base64");
    let response: Response;

    try {
      response = await fetchImpl(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${base64}` },
                },
              ],
            },
          ],
        }),
      });
    } catch {
      return { ok: false, reason: "upstream_error" };
    }

    if (!response.ok) {
      return { ok: false, reason: "upstream_error" };
    }

    const body = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const content = body?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, reason: "not_recognized" };
    }

    return { ok: true, value: content.trim() };
  }

  return {
    recognizeItemDetails: async (jpegBuffer) => {
      const result = await complete(ITEM_DETAILS_PROMPT, jpegBuffer);

      if (!result.ok) {
        return result;
      }

      const lines = result.value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const rawName = (lines[0] ?? "")
        .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
        .trim();

      if (!rawName || rawName.includes("无法识别") || rawName.length > 40) {
        return { ok: false, reason: "not_recognized" };
      }

      const noteLine = lines
        .slice(1)
        .join(" ")
        .replace(/^备注[:：]?\s*/i, "")
        .trim();
      const note = noteLine && noteLine.length <= 200 ? noteLine : null;

      return { ok: true, value: { name: rawName, note } };
    },
    recognizeExpireDate: async (jpegBuffer) => {
      const result = await complete(EXPIRE_PROMPT, jpegBuffer);

      if (!result.ok) {
        return result;
      }

      if (result.value.includes("无")) {
        return { ok: false, reason: "not_recognized" };
      }

      const match = result.value.match(
        /(20\d{2})[-/年.](\d{1,2})(?:[-/月.](\d{1,2}))?/,
      );

      if (!match) {
        return { ok: false, reason: "not_recognized" };
      }

      const month = match[2].padStart(2, "0");
      const day = match[3] ? match[3].padStart(2, "0") : "01";
      return { ok: true, value: `${match[1]}-${month}-${day}` };
    },
  };
}
