import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("AppDashboard location actions", () => {
  it("exposes a delete action for each visible location", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("handleDeleteLocation");
    expect(source).toContain("handleDeleteLocation(location.id)");
  });

  it("keeps the top bar aligned to the reference search-first layout", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain('data-testid="global-item-search"');
    expect(source).toContain("搜索物品（名称 / 备注 / 位置）");
    expect(source).toContain("xl:grid-cols-[minmax(180px,280px)_minmax(320px,520px)_minmax(180px,1fr)]");
  });

  it("uses a wide desktop workbench without fixed-width item controls", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("max-w-[1760px]");
    expect(source).toContain("xl:grid-cols-[260px_260px_minmax(420px,1fr)]");
    expect(source).toContain("2xl:grid-cols-[280px_280px_minmax(640px,1fr)]");
    expect(source).not.toContain("max-w-7xl");
    expect(source).not.toContain("min-w-[520px]");
    expect(source).not.toContain("xl:grid-cols-[1fr_150px_170px_1fr_150px_auto]");
  });

  it("keeps the desktop dashboard visually compact for repeated inventory work", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("gap-0 border-t");
    expect(source).toContain("p-3");
    expect(source).toContain("h-9 rounded-md");
    expect(source).toContain("px-4 py-2 transition");
    expect(source).not.toContain("gap-5 px-4 py-5");
    expect(source).not.toContain("px-4 py-3 transition");
  });

  it("keeps area and location edit actions on the same row as their names", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain('data-testid="area-list-item-main"');
    expect(source).toContain('data-testid="location-list-item-main"');
    expect(source).not.toContain('className="mt-0.5 flex justify-end gap-3 px-2"');
  });

  it("keeps area, location, and item row metadata on one line", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("area.locationCount} 个位置");
    expect(source).toContain("{location.areaName}");
    expect(source).toContain("{item.areaName} / {item.locationName}");
    expect(source).not.toContain('className="mt-1 block text-xs text-[var(--muted-foreground)]"');
    expect(source).not.toContain('className="mt-1 block truncate text-xs text-[var(--muted-foreground)]"');
    expect(source).not.toContain('className="mt-0.5 text-xs text-[var(--muted-foreground)]"');
  });

  it("aligns area and location composer panels with a compact location color picker", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain('data-testid="area-panel"');
    expect(source).toContain('data-testid="location-panel"');
    expect(source).toContain('data-testid="area-add-button"');
    expect(source).toContain('data-testid="location-add-button"');
    expect(source).toContain("showAreaComposer");
    expect(source).toContain("showLocationComposer");
    expect(source).toContain('data-testid="location-composer-fields"');
    expect(source).toContain('data-testid="location-color-picker"');
    expect(source).toContain("grid gap-2 sm:grid-cols-2");
  });

  it("uses the reference workbench with an item table and top add action", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain('data-testid="desktop-inventory-shell"');
    expect(source).toContain('data-testid="item-table"');
    expect(source).toContain('data-testid="top-add-item-button"');
    expect(source).toContain('data-testid="item-sort"');
    expect(source).not.toContain('data-testid="right-rail"');
    expect(source).not.toContain('data-testid="right-rail-summary"');
    expect(source).not.toContain('data-testid="right-rail-expiring"');
    expect(source).not.toContain('data-testid="item-search"\n            className="hidden gap-2');
  });

  it("keeps area, location, and item lists independently scrollable", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("h-[calc(100vh-65px)] overflow-hidden");
    expect(source).toContain('data-testid="area-list-scroll"');
    expect(source).toContain('data-testid="location-list-scroll"');
    expect(source).toContain('data-testid="item-list-scroll"');
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto");
  });

  it("edits rows with double click and keeps only compact delete controls", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("onDoubleClick={() => startEditArea(area)}");
    expect(source).toContain("onDoubleClick={() => startEditLocation(location)}");
    expect(source).toContain("onDoubleClick={() => startEditItem(item)}");
    expect(source).toContain('aria-label="删除区域"');
    expect(source).toContain('aria-label="删除位置"');
    expect(source).toContain('aria-label="删除物品"');
    expect(source).toContain("×");
    expect(source).not.toContain("<span>状态</span>");
    expect(source).not.toContain("<ExpirationBadge item={item} />");
  });

  it("uses the reference typography scale on the desktop workbench", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("text-[18px] font-semibold leading-6");
    expect(source).toContain("text-[16px] font-semibold leading-6");
    expect(source).toContain("text-[14px] font-semibold leading-5");
    expect(source).toContain("text-[13px] text-[var(--muted-foreground)]");
    expect(source).toContain("text-[12px] text-[var(--muted-foreground)]");
  });

  it("keeps the item composer in a dialog opened from the top bar", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");
    const composerIndex = source.indexOf('data-testid="item-composer"');
    const topAddIndex = source.indexOf('data-testid="top-add-item-button"');

    expect(composerIndex).toBeGreaterThan(-1);
    expect(topAddIndex).toBeGreaterThan(-1);
    expect(composerIndex).toBeGreaterThan(topAddIndex);
  });

  it("matches the reference mobile layout with horizontal sections and a floating add button", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain('data-testid="mobile-dashboard"');
    expect(source).toContain('data-testid="mobile-search-field"');
    expect(source).toContain('data-testid="mobile-area-strip"');
    expect(source).toContain('data-testid="mobile-location-strip"');
    expect(source).toContain('data-testid="mobile-add-item-button"');
    expect(source).toContain('data-testid="mobile-location-photo-chip"');
    expect(source).toContain('data-testid="mobile-area-photo-chip"');
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("搜索物品（名称 / 类别 / 位置 / 备注）");
    expect(source).not.toContain("查看区域");
  });

  it("uses a two-step Excel import preview before committing conflicts", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("previewImport(file)");
    expect(source).toContain("commitImport({");
    expect(source).toContain('data-testid="import-conflict-dialog"');
    expect(source).toContain("setConflictResolution");
    expect(source).toContain("都保留");
    expect(source).toContain("覆盖");
  });

  it("keeps the mobile dashboard compact with independent scrolling zones", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain("h-[calc(100dvh-65px)]");
    expect(source).toContain("grid-rows-[40px_88px_72px_minmax(0,1fr)]");
    expect(source).toContain('data-testid="mobile-item-scroll"');
    expect(source).toContain('data-testid="mobile-item-thumbnail"');
    expect(source).toContain("min-h-0 overflow-y-auto");
    expect(source).toContain("overscroll-x-contain");
    expect(source).toContain("h-10 min-w-20");
    expect(source).toContain("h-9 min-w-20");
    expect(source).toContain("h-[44px]");
    expect(source).not.toContain("grid-rows-[44px_112px_92px_minmax(0,1fr)]");
    expect(source).not.toContain("h-[58px] min-w-[82px]");
    expect(source).not.toContain("h-12 min-w-24");
    expect(source).not.toContain("grid-rows-[48px_150px_126px_minmax(0,1fr)]");
    expect(source).not.toContain("h-[74px] min-w-[88px]");
    expect(source).not.toContain("h-[62px] min-w-[104px]");
    expect(source).not.toContain("h-[92px] min-w-[112px]");
    expect(source).not.toContain("h-[78px] min-w-[132px]");
  });

  it("adds area and location photo entries on the desktop panels", () => {
    const source = readFileSync(join(__dirname, "AppDashboard.tsx"), "utf8");

    expect(source).toContain('aria-label="区域照片"');
    expect(source).toContain('aria-label="位置照片"');
  });
});
