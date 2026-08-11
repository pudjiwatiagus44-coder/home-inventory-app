import nodemailer from "nodemailer";

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super("SMTP credentials are not configured");
    this.name = "SmtpNotConfiguredError";
  }
}

export class SmtpSendFailedError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Failed to send email");
    this.name = "SmtpSendFailedError";
  }
}

export type PasswordResetMailer = {
  sendPasswordResetEmail: (input: {
    to: string;
    resetUrl: string;
  }) => Promise<void>;
};

export type FeedbackMailer = {
  sendFeedbackEmail: (input: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<void>;
};

export type AppMailer = PasswordResetMailer & FeedbackMailer;

export type SmtpMailerTransporter = {
  sendMail: (mail: Record<string, unknown>) => Promise<unknown>;
};

type SmtpMailerDependencies = {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
  transporter?: SmtpMailerTransporter;
};

export function createSmtpMailer(
  deps: SmtpMailerDependencies = {},
): AppMailer {
  const host = deps.host ?? process.env.SMTP_HOST?.trim() ?? "";
  const port = deps.port ?? Number(process.env.SMTP_PORT ?? 465);
  const secure = deps.secure ?? (process.env.SMTP_SECURE ?? "true") !== "false";
  const user = deps.user ?? process.env.SMTP_USER?.trim() ?? "";
  const pass = deps.pass ?? process.env.SMTP_PASS ?? "";
  const from = deps.from ?? process.env.EMAIL_FROM?.trim() ?? user;

  return {
    async sendPasswordResetEmail({ to, resetUrl }) {
      if (!user || !pass) {
        throw new SmtpNotConfiguredError();
      }

      const transporter: SmtpMailerTransporter =
        deps.transporter ??
        (nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        }) as unknown as SmtpMailerTransporter);

      const html = [
        "<p>你好，</p>",
        "<p>我们收到了你的密码重置请求。请在 30 分钟内打开下面的链接设置新密码：</p>",
        `<p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>`,
        "<p>如果这不是你的操作，请忽略这封邮件，你的密码不会改变。</p>",
      ].join("\n");

      try {
        await transporter.sendMail({
          from,
          to,
          subject: "重置你的家庭物品密码",
          text: `打开以下链接在 30 分钟内设置新密码：${resetUrl}`,
          html,
        });
      } catch (error) {
        throw new SmtpSendFailedError(error);
      }
    },

    async sendFeedbackEmail({ to, subject, text, html }) {
      if (!user || !pass) {
        throw new SmtpNotConfiguredError();
      }

      const transporter: SmtpMailerTransporter =
        deps.transporter ??
        (nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        }) as unknown as SmtpMailerTransporter);

      try {
        await transporter.sendMail({
          from,
          to,
          subject,
          text,
          html,
        });
      } catch (error) {
        throw new SmtpSendFailedError(error);
      }
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
