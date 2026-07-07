import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("AppDashboard location actions", () => {
  it("exposes a delete action for each visible location", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("handleDeleteLocation");
    expect(source).toContain("onClick={() => handleDeleteLocation(location.id)}");
  });
});
