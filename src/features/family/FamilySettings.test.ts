import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FamilySettings", () => {
  it("labels household member roles as 管理 / 新增 / 只读", () => {
    const source = readFileSync(join(__dirname, "FamilySettings.tsx"), "utf8");

    expect(source).toContain("管理");
    expect(source).toContain("新增");
    expect(source).toContain("只读");
    expect(source).toContain("member.role");
  });
});
