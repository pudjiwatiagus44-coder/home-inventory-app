export const BOOKKEEPING_DRAFT_FIELDS = [
  "dateTime",
  "type",
  "category",
  "amount",
  "currency",
  "payerPayee",
  "account",
  "participant",
  "tag",
  "merchant",
  "property",
  "note",
] as const;

export type BookkeepingDraft = Record<(typeof BOOKKEEPING_DRAFT_FIELDS)[number], string>;

export type DoubaoBookkeepingResult =
  | { ok: true; value: BookkeepingDraft[] }
  | { ok: false; reason: "api_key_missing" | "upstream_error" | "invalid_response" };

type Dependencies = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const SYSTEM_PROMPT = `你是中文个人记账信息整理器。输入是手机本地 OCR 后的纯文本，不是图片。
请结合支付页面上下文主动修正常见 OCR 错字和知名品牌名（例如“拼夕夕平台商户”应纠正为“拼多多平台商户”，金额“8.OO”应纠正为“8.00”），并尽量归入下面 12 个字段。
只输出一个 JSON 数组，不要 Markdown，不要解释。数组中的每个对象必须且只能包含这些字符串字段：
dateTime,type,category,amount,currency,payerPayee,account,participant,tag,merchant,property,note。
屏幕中有几笔独立付款就输出几个对象；不要把商品明细、优惠金额、余额、订单号当成独立账单。
规则：
1. dateTime 输出 YYYY-MM-DD HH:mm；必须优先使用页面明确标注的支付时间、交易时间或下单时间。页面缺年份时只借用 capturedAt 的年份；capturedAt 绝不能覆盖页面已有的月、日和时分。
2. amount 只保留十进制数字，不带货币符号，必须取最终付款价格（实付金额），禁止把商品原价或划线价当作付款金额；优先“实付/已付/合计/付款金额/订单金额”等标签旁的金额，其次取结算区（紧邻订单编号、交易状态、收货信息）的金额；商品名旁紧跟的价格通常是原价，不作为付款金额。currency 通常填人民币。
3. type 只填支出、收入或转账，核心看资金方向：
   - 资金流出让用户（付款、消费、扣款、支出、买单、转出、退款给他人）→ 支出。
   - 资金流入到用户（收款、收到转账、到账、入账、红包、工资、奖金、报销、退款入账、余额/零钱提示收到、还款有“+金额”）→ 收入。
   - 用户自己的账户间互转（如银行卡转余额宝、信用卡还款）→ 转账。
   - 收入页面常见特征：页面或金额附近出现“收款/转入/到账/入账/收到/红包/工资/退款/+¥/+X.XX”等字样，或收款方是用户本人；遇到这些一律判为收入，不要判成支出。
   category 尽量使用餐饮、购物、交通、娱乐、居家、医疗、教育、人情、其他；收入归属不清时用“其他”。
4. account 保留支付渠道、银行和卡尾号；payerPayee 和 merchant 填写店铺名或商户名。
5. 购物页面（淘宝、京东、拼多多、抖音等）必须区分店铺名与商品名：店铺名（常以“旗舰店、专营店、官方店、专卖店、超市、商场”等结尾）填 payerPayee 和 merchant；商品名（品牌+品类+规格，通常紧邻价格，如“小米手环9 NFC版”）填 note；禁止把店铺名当作商品名或主标题。
6. participant 无其他证据时填自己；无法可靠推断的字段填空字符串，禁止编造。
7. note 优先填商品名（购物页面），其次放未被其他字段承载但对核对有用的信息，不要把整段 OCR 文本塞入 note。`;

export function createDoubaoBookkeepingClient(deps: Dependencies = {}) {
  const apiKey = deps.apiKey ?? process.env.DOUBAO_API_KEY?.trim() ?? "";
  const model = deps.model ?? process.env.DOUBAO_VISION_MODEL?.trim() ?? "doubao-seed-2-0-mini-260428";
  const baseUrl = deps.baseUrl ?? process.env.DOUBAO_VISION_BASE_URL?.trim() ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  return {
    async understandOcrText(ocrText: string, capturedAt: string): Promise<DoubaoBookkeepingResult> {
      if (!apiKey) return { ok: false, reason: "api_key_missing" };

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
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: `capturedAt: ${capturedAt}\nOCR文本：\n${ocrText}` },
            ],
          }),
        });
      } catch {
        return { ok: false, reason: "upstream_error" };
      }

      if (!response.ok) return { ok: false, reason: "upstream_error" };
      const body = await response.json().catch(() => null) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      } | null;
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string") return { ok: false, reason: "invalid_response" };

      try {
        const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned) as unknown;
        const values = Array.isArray(parsed) ? parsed : [parsed];
        if (values.length === 0) throw new Error("empty result");
        const drafts = values.map((value) => {
          if (!value || typeof value !== "object") throw new Error("invalid object");
          const draft = Object.fromEntries(
            BOOKKEEPING_DRAFT_FIELDS.map((field) => {
              const fieldValue = (value as Record<string, unknown>)[field];
              if (typeof fieldValue !== "string") throw new Error(`invalid ${field}`);
              return [field, fieldValue.trim()];
            }),
          ) as BookkeepingDraft;
          draft.dateTime = deriveExplicitDateTime(ocrText, capturedAt) || draft.dateTime;
          return draft;
        });
        return { ok: true, value: drafts };
      } catch {
        return { ok: false, reason: "invalid_response" };
      }
    },
  };
}

function deriveExplicitDateTime(ocrText: string, capturedAt: string): string {
  const full = ocrText.match(
    /(?:支付时间|交易时间|下单时间|付款时间)?\s*(20\d{2})[年/-](\d{1,2})[月/-](\d{1,2})日?\s+(\d{1,2}):(\d{2})/,
  );
  if (full) return formatDateTime(full[1], full[2], full[3], full[4], full[5]);

  const partial = ocrText.match(
    /(?:支付时间|交易时间|下单时间|付款时间)\s*[:：]?\s*(\d{1,2})月(\d{1,2})日?\s+(\d{1,2}):(\d{2})/,
  );
  if (!partial) return "";
  const capturedDate = new Date(capturedAt);
  if (Number.isNaN(capturedDate.getTime())) return "";
  return formatDateTime(String(capturedDate.getFullYear()), partial[1], partial[2], partial[3], partial[4]);
}

function formatDateTime(year: string, month: string, day: string, hour: string, minute: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute}`;
}
