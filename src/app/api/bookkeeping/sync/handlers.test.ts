import { describe, expect, it } from "vitest";
import { createBookkeepingSyncErrorResponse } from "./handlers";

describe("bookkeeping sync error response", () => {
  it("不向客户端暴露内部错误详情", async () => {
    const response = createBookkeepingSyncErrorResponse(new Error("database password leaked"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "Bookkeeping sync failed" });
  });
});
