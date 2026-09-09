import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("bookkeeping error report migration", () => {
  it("grants the production application role access to both runtime tables", () => {
    const sql = readFileSync(
      join(process.cwd(), "dev-docs/sql/bookkeeping_transaction_error_reports_20260908.sql"),
      "utf8",
    ).toLowerCase();

    expect(sql).toContain(
      "grant select, insert on bookkeeping_transaction_error_reports to home_inventory_app",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on bookkeeping_error_report_file_cleanup to home_inventory_app",
    );
  });
});
