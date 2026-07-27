import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Home Inventory",
  description: "A private home inventory app for tracking household items.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-center text-xs text-[var(--muted-foreground)]">
          <a
            className="transition hover:text-[var(--foreground)]"
            href="https://beian.miit.gov.cn/"
            rel="noopener noreferrer"
            target="_blank"
          >
            粤ICP备2026094933号
          </a>
        </footer>
      </body>
    </html>
  );
}
