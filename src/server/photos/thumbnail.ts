import { decode, encode } from "jpeg-js";

export function isJpeg(buffer: Buffer) {
  return (
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

export function createThumbnail(
  source: Buffer,
  maxDimension = 200,
): Buffer {
  const pixels = decode(source, {
    useTArray: true,
    maxMemoryUsageInMB: 256,
  });
  const { width, height, data } = pixels;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const resized = new Uint8Array(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) / scale));
      const sy = Math.min(height - 1, Math.floor((y + 0.5) / scale));
      const sourceIndex = (sy * width + sx) * 4;
      const targetIndex = (y * targetWidth + x) * 4;
      resized[targetIndex] = data[sourceIndex];
      resized[targetIndex + 1] = data[sourceIndex + 1];
      resized[targetIndex + 2] = data[sourceIndex + 2];
      resized[targetIndex + 3] = 255;
    }
  }

  const encoded = encode(
    { data: resized, width: targetWidth, height: targetHeight },
    70,
  );
  return Buffer.from(encoded.data);
}
