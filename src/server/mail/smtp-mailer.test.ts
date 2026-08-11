import { describe, expect, it, vi } from "vitest";

import {
  createSmtpMailer,
  SmtpNotConfiguredError,
  SmtpSendFailedError,
} from "./smtp-mailer";

type SendMailInput = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

describe("smtp mailer", () => {
  it("throws SmtpNotConfiguredError when SMTP credentials are missing", async () => {
    const mailer = createSmtpMailer({ user: "", pass: "" });

    await expect(
      mailer.sendPasswordResetEmail({
        to: "user@example.com",
        resetUrl: "https://homestorag.xyz/reset-password?token=abc",
      }),
    ).rejects.toBeInstanceOf(SmtpNotConfiguredError);
  });

  it("sends a password reset email with the reset link", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
    const mailer = createSmtpMailer({
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      user: "sender@qq.com",
      pass: "auth-code",
      from: "sender@qq.com",
      transporter: {
        sendMail,
      },
    });

    await mailer.sendPasswordResetEmail({
      to: "user@example.com",
      resetUrl: "https://homestorag.xyz/reset-password?token=abc",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0] as SendMailInput;
    expect(mail.to).toBe("user@example.com");
    expect(mail.from).toBe("sender@qq.com");
    expect(mail.subject).toBe("重置你的家庭物品密码");
    expect(mail.html).toContain(
      "https://homestorag.xyz/reset-password?token=abc",
    );
  });

  it("wraps transporter failures in SmtpSendFailedError", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("connection refused"));
    const mailer = createSmtpMailer({
      user: "sender@qq.com",
      pass: "auth-code",
      transporter: {
        sendMail,
      },
    });

    await expect(
      mailer.sendPasswordResetEmail({
        to: "user@example.com",
        resetUrl: "https://homestorag.xyz/reset-password?token=abc",
      }),
    ).rejects.toBeInstanceOf(SmtpSendFailedError);
  });

  it("sends a feedback email to the configured target", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
    const mailer = createSmtpMailer({
      user: "sender@qq.com",
      pass: "auth-code",
      transporter: { sendMail },
    });

    await mailer.sendFeedbackEmail({
      to: "736259416@qq.com",
      subject: "家庭物品 App 反馈 - user@example.com",
      text: "反馈内容",
      html: "<p>反馈内容</p>",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0] as SendMailInput;
    expect(mail.to).toBe("736259416@qq.com");
    expect(mail.subject).toContain("user@example.com");
    expect(mail.text).toContain("反馈内容");
  });
});
