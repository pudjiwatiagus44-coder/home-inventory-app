import type { FeedbackMailer } from "../mail/smtp-mailer";

type FeedbackServiceDependencies = {
  mailer: FeedbackMailer;
  to: string;
  now?: () => Date;
};

export type FeedbackService = {
  sendFeedback: (input: {
    email: string;
    message: string;
    source: "web" | "android";
    appVersion?: string;
  }) => Promise<void>;
};

export function createFeedbackService(
  deps: FeedbackServiceDependencies,
): FeedbackService {
  const now = deps.now ?? (() => new Date());

  return {
    async sendFeedback({ email, message, source, appVersion }) {
      const subject = `家庭物品 App 反馈 - ${email}`;
      const text = [
        `反馈内容：${message}`,
        `登录邮箱：${email}`,
        `来源：${source === "android" ? "Android" : "Web"}`,
        `App 版本：${appVersion ?? "未知"}`,
        `反馈时间：${now().toISOString()}`,
      ].join("\n");
      const html = [
        `<p>反馈内容：${escapeHtml(message)}</p>`,
        `<p>登录邮箱：${escapeHtml(email)}</p>`,
        `<p>来源：${source === "android" ? "Android" : "Web"}</p>`,
        `<p>App 版本：${escapeHtml(appVersion ?? "未知")}</p>`,
        `<p>反馈时间：${escapeHtml(now().toISOString())}</p>`,
      ].join("\n");

      await deps.mailer.sendFeedbackEmail({
        to: deps.to,
        subject,
        text,
        html,
      });
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
