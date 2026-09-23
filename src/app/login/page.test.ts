import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("LoginPage", () => {
  it("shows the expired-session notice with priority over password reset", () => {
    const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

    expect(source).toContain('expired === "1"');
    expect(source).toContain("登录已失效，请重新登录");
    expect(source.indexOf('expired === "1"')).toBeLessThan(
      source.indexOf('reset === "1"'),
    );
  });
});
