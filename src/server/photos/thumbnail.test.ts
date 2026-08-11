import { describe, expect, it } from "vitest";
import { decode, encode } from "jpeg-js";

import { createMediumPhoto, createThumbnail, isJpeg } from "./thumbnail";

function makeJpeg(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200;
    data[i + 1] = 100;
    data[i + 2] = 50;
    data[i + 3] = 255;
  }
  const encoded = encode({ data, width, height }, 80);
  return Buffer.from(encoded.data);
}

describe("thumbnail", () => {
  it("detects jpeg magic bytes", () => {
    expect(isJpeg(makeJpeg(10, 10))).toBe(true);
    expect(isJpeg(Buffer.from("hello"))).toBe(false);
  });

  it("downscales a 400x300 jpeg to 200x150", () => {
    const thumbnail = createThumbnail(makeJpeg(400, 300));
    const pixels = decode(thumbnail, { useTArray: true });

    expect(pixels.width).toBe(200);
    expect(pixels.height).toBe(150);
    expect(isJpeg(thumbnail)).toBe(true);
  });

  it("keeps images smaller than the target dimension unchanged", () => {
    const thumbnail = createThumbnail(makeJpeg(100, 80));
    const pixels = decode(thumbnail, { useTArray: true });

    expect(pixels.width).toBe(100);
    expect(pixels.height).toBe(80);
  });

  it("creates a 1280px medium photo", () => {
    const medium = createMediumPhoto(makeJpeg(2000, 1000));
    const pixels = decode(medium, { useTArray: true });

    expect(pixels.width).toBe(1280);
    expect(pixels.height).toBe(640);
    expect(isJpeg(medium)).toBe(true);
  });
});
