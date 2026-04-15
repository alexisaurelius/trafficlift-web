import { NextResponse } from "next/server";

export const runtime = "nodejs";

function createFaviconIco(): Uint8Array {
  const size = 32;
  const pixelCount = size * size;
  const bg = { r: 245, g: 250, b: 246 };
  const line = { r: 34, g: 197, b: 94 };

  const pixels = new Uint8Array(pixelCount * 4);

  const setPixel = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    pixels[idx] = b;
    pixels[idx + 1] = g;
    pixels[idx + 2] = r;
    pixels[idx + 3] = a;
  };

  const fillCircle = (cx: number, cy: number, radius: number, r: number, g: number, b: number, a = 255) => {
    const r2 = radius * radius;
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          setPixel(x, y, r, g, b, a);
        }
      }
    }
  };

  const drawSegment = (x1: number, y1: number, x2: number, y2: number, thickness: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;

    for (let i = 0; i <= steps; i += 1) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Math.round(x1 + dx * t);
      const y = Math.round(y1 + dy * t);
      fillCircle(x, y, thickness, line.r, line.g, line.b);
    }
  };

  const cornerRadius = 7;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inTopLeft = x < cornerRadius && y < cornerRadius;
      const inTopRight = x >= size - cornerRadius && y < cornerRadius;
      const inBottomLeft = x < cornerRadius && y >= size - cornerRadius;
      const inBottomRight = x >= size - cornerRadius && y >= size - cornerRadius;

      if (inTopLeft) {
        const dx = x - cornerRadius;
        const dy = y - cornerRadius;
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) continue;
      }
      if (inTopRight) {
        const dx = x - (size - cornerRadius - 1);
        const dy = y - cornerRadius;
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) continue;
      }
      if (inBottomLeft) {
        const dx = x - cornerRadius;
        const dy = y - (size - cornerRadius - 1);
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) continue;
      }
      if (inBottomRight) {
        const dx = x - (size - cornerRadius - 1);
        const dy = y - (size - cornerRadius - 1);
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) continue;
      }

      setPixel(x, y, bg.r, bg.g, bg.b, 255);
    }
  }

  drawSegment(6, 22, 14, 16, 2);
  drawSegment(14, 16, 20, 18, 2);
  drawSegment(20, 18, 26, 9, 2);
  drawSegment(26, 9, 22, 9, 2);
  drawSegment(26, 9, 24, 13, 2);

  const bitmapHeaderSize = 40;
  const pixelDataSize = pixels.length;
  const andMaskRowSize = Math.ceil(size / 32) * 4;
  const andMaskSize = andMaskRowSize * size;
  const imageDataSize = bitmapHeaderSize + pixelDataSize + andMaskSize;

  const iconDirSize = 6;
  const iconEntrySize = 16;
  const imageOffset = iconDirSize + iconEntrySize;
  const totalSize = imageOffset + imageDataSize;

  const out = Buffer.alloc(totalSize);
  let offset = 0;

  out.writeUInt16LE(0, offset);
  offset += 2;
  out.writeUInt16LE(1, offset);
  offset += 2;
  out.writeUInt16LE(1, offset);
  offset += 2;

  out.writeUInt8(size, offset);
  offset += 1;
  out.writeUInt8(size, offset);
  offset += 1;
  out.writeUInt8(0, offset);
  offset += 1;
  out.writeUInt8(0, offset);
  offset += 1;
  out.writeUInt16LE(1, offset);
  offset += 2;
  out.writeUInt16LE(32, offset);
  offset += 2;
  out.writeUInt32LE(imageDataSize, offset);
  offset += 4;
  out.writeUInt32LE(imageOffset, offset);
  offset += 4;

  out.writeUInt32LE(bitmapHeaderSize, offset);
  offset += 4;
  out.writeInt32LE(size, offset);
  offset += 4;
  out.writeInt32LE(size * 2, offset);
  offset += 4;
  out.writeUInt16LE(1, offset);
  offset += 2;
  out.writeUInt16LE(32, offset);
  offset += 2;
  out.writeUInt32LE(0, offset);
  offset += 4;
  out.writeUInt32LE(pixelDataSize, offset);
  offset += 4;
  out.writeInt32LE(0, offset);
  offset += 4;
  out.writeInt32LE(0, offset);
  offset += 4;
  out.writeUInt32LE(0, offset);
  offset += 4;
  out.writeUInt32LE(0, offset);
  offset += 4;

  for (let y = size - 1; y >= 0; y -= 1) {
    const rowStart = y * size * 4;
    out.set(pixels.subarray(rowStart, rowStart + size * 4), offset);
    offset += size * 4;
  }

  out.fill(0x00, offset, offset + andMaskSize);

  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

export function GET() {
  const iconBytes = createFaviconIco();
  const stableBytes = Uint8Array.from(iconBytes);
  const body = new Blob([stableBytes], { type: "image/x-icon" });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
