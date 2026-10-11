/**
 * HIỆU ỨNG "CHỮ HIỆN LẦN LƯỢT" CHO ẢNH SLIDE (chạy trong trình duyệt, không cần cài gì).
 *
 * Cách làm: tự nhận diện các khối nội dung trên ảnh (từ chữ, ô, thẻ có viền...),
 * dựng lại nền sạch (xóa các khối đó), rồi cho từng khối hiện ra theo thứ tự
 * từ trên xuống, từ trái sang phải: quét từ trái sang kèm trượt nhẹ lên.
 *
 * Phần nhận diện (detectBlocks, fillBackground) là hàm thuần túy, không dùng DOM.
 */

export interface Rect { x: number; y: number; w: number; h: number }

const EDGE_T = 28;      // ngưỡng nhận diện nét chữ/viền (nền slide chỉ có gradient nhẹ nên thấp hơn nhiều)
const DILATE_R = 0;     // độ "nở" để gộp các nét của cùng một chữ
const MAX_BLOCKS = 40;  // quá nhiều khối thì gộp theo dòng

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      const a = Math.max(0, x - r), b = Math.min(w - 1, x + r);
      for (let k = a; k <= b; k++) tmp[row + k] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!tmp[y * w + x]) continue;
      const a = Math.max(0, y - r), b = Math.min(h - 1, y + r);
      for (let k = a; k <= b; k++) out[k * w + x] = 1;
    }
  }
  return out;
}

function intersects(a: Rect, b: Rect, baseGap: number): boolean {
  // Chữ to thì khoảng cách giữa các chữ cái cũng lớn hơn, nên cho phép gộp xa hơn một chút
  const gap = Math.max(baseGap, 0.12 * Math.min(a.h, b.h));
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function mergeBoxes(input: Rect[], gap: number): Rect[] {
  const boxes = input.slice();
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (intersects(boxes[i], boxes[j], gap)) {
          boxes[i] = union(boxes[i], boxes[j]);
          boxes.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return boxes;
}

/** Xếp thành các hàng (từ trên xuống), trong hàng xếp từ trái sang phải */
function groupRows(boxes: Rect[]): Rect[][] {
  const sorted = boxes.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { top: number; bottom: number; items: Rect[] }[] = [];
  for (const b of sorted) {
    const row = rows.find(r => {
      const overlap = Math.min(r.bottom, b.y + b.h) - Math.max(r.top, b.y);
      return overlap >= 0.5 * b.h;
    });
    if (row) {
      row.items.push(b);
      row.top = Math.min(row.top, b.y);
      row.bottom = Math.max(row.bottom, b.y + b.h);
    } else {
      rows.push({ top: b.y, bottom: b.y + b.h, items: [b] });
    }
  }
  rows.sort((a, b) => a.top - b.top);
  return rows.map(r => r.items.sort((a, b) => a.x - b.x));
}

/**
 * Nhận diện các khối nội dung. data = RGBA của ảnh đã thu nhỏ (khoảng 480px ngang).
 * Trả về các khối theo thứ tự hiện (trên xuống, trái sang phải), tọa độ theo ảnh đã thu nhỏ.
 */
export function detectBlocks(data: Uint8ClampedArray, w: number, h: number): Rect[] {
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

  let mask: Uint8Array = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const g = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + w] - lum[i - w]);
      if (g > EDGE_T) mask[i] = 1;
    }
  }
  mask = dilate(mask, w, h, DILATE_R);

  // Gán nhãn các cụm liền nhau (8 hướng)
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let boxes: Rect[] = [];
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    label[s] = 1;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % w, y = (i - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue;
          const j = yy * w + xx;
          if (mask[j] && !label[j]) { label[j] = 1; stack[sp++] = j; }
        }
      }
    }
    // Bỏ phần "nở" do dilate để lấy đúng khung của nét chữ
    const bw = maxX - minX + 1 - 2 * DILATE_R;
    const bh = maxY - minY + 1 - 2 * DILATE_R;
    if (bw < 2 && bh < 2) continue; // đốm nhiễu
    boxes.push({ x: minX + DILATE_R, y: minY + DILATE_R, w: Math.max(1, bw), h: Math.max(1, bh) });
  }

  // Khối nằm trong / chạm nhau thì gộp (ví dụ chữ nằm trong ô có viền)
  boxes = mergeBoxes(boxes, 2);

  let rows = groupRows(boxes);
  if (boxes.length > MAX_BLOCKS) {
    // Quá nhiều khối: mỗi hàng thành một khối
    rows = rows.map(r => [r.reduce((a, b) => union(a, b))]);
  }
  return rows.flat();
}

/**
 * Xóa các khối khỏi ảnh bằng cách nội suy tuyến tính theo từng hàng
 * giữa hai điểm nền sát hai bên. Hợp với nền gradient mượt của slide.
 */
export function fillBackground(data: Uint8ClampedArray, w: number, h: number, rects: Rect[]): void {
  for (let y = 0; y < h; y++) {
    const spans: [number, number][] = [];
    for (const r of rects) {
      if (y >= r.y && y < r.y + r.h) spans.push([Math.max(0, Math.floor(r.x)), Math.min(w, Math.ceil(r.x + r.w))]);
    }
    if (!spans.length) continue;
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    }
    for (const [x0, x1] of merged) {
      const L = x0 - 1, R = x1;
      if (L < 0 && R >= w) continue;
      const rowBase = y * w;
      for (let x = x0; x < x1; x++) {
        const p = (rowBase + x) * 4;
        for (let c = 0; c < 3; c++) {
          let v: number;
          if (L < 0) v = data[(rowBase + R) * 4 + c];
          else if (R >= w) v = data[(rowBase + L) * 4 + c];
          else {
            const a = data[(rowBase + L) * 4 + c], b = data[(rowBase + R) * 4 + c];
            v = a + ((b - a) * (x - L)) / (R - L);
          }
          data[p + c] = v;
        }
        data[p + 3] = 255;
      }
    }
  }
}

export interface TextReveal {
  blockCount: number;
  /** Vẽ khung hình tại giây t của cảnh, trả về canvas kích thước bằng ảnh gốc */
  render: (tSec: number) => HTMLCanvasElement;
}

const ANIM_SEC = 0.55;
const easeOutCubic = (q: number) => 1 - Math.pow(1 - q, 3);

/** Trả null nếu ảnh không có đủ khối để làm hiệu ứng (khi đó dùng ảnh nguyên bản) */
export function createTextReveal(img: HTMLImageElement, sceneSec: number): TextReveal | null {
  try {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (nw < 300 || nh < 200 || sceneSec < 1.5) return null;

    const aw = Math.min(480, nw);
    const k = nw / aw;
    const ah = Math.round(nh / k);
    const small = document.createElement('canvas');
    small.width = aw;
    small.height = ah;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    if (!sctx) return null;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(img, 0, 0, aw, ah);
    const blocksSmall = detectBlocks(sctx.getImageData(0, 0, aw, ah).data, aw, ah);
    if (blocksSmall.length < 2) return null;

    const pad = Math.ceil(2 * k);
    const blocks: Rect[] = blocksSmall.map(b => {
      const x = Math.max(0, Math.floor(b.x * k) - pad);
      const y = Math.max(0, Math.floor(b.y * k) - pad);
      const x2 = Math.min(nw, Math.ceil((b.x + b.w) * k) + pad);
      const y2 = Math.min(nh, Math.ceil((b.y + b.h) * k) + pad);
      return { x, y, w: x2 - x, h: y2 - y };
    });

    // Nền sạch (đã xóa các khối)
    const bg = document.createElement('canvas');
    bg.width = nw;
    bg.height = nh;
    const bctx = bg.getContext('2d', { willReadFrequently: true });
    if (!bctx) return null;
    bctx.drawImage(img, 0, 0);
    const full = bctx.getImageData(0, 0, nw, nh);
    fillBackground(full.data, nw, nh, blocks);
    bctx.putImageData(full, 0, 0);

    const comp = document.createElement('canvas');
    comp.width = nw;
    comp.height = nh;
    const cctx = comp.getContext('2d');
    if (!cctx) return null;

    // Thời điểm hiện của từng khối (dồn hết trong khoảng 70% thời lượng cảnh)
    const n = blocks.length;
    const first = 0.2;
    const anim = Math.min(ANIM_SEC, sceneSec * 0.25);
    const available = Math.max(0.2, sceneSec * 0.7 - anim - first);
    const stagger = n > 1 ? Math.min(0.5, available / (n - 1)) : 0;
    const starts = blocks.map((_, i) => first + i * stagger);

    return {
      blockCount: n,
      render: (t: number) => {
        cctx.globalAlpha = 1;
        cctx.drawImage(bg, 0, 0);
        for (let i = 0; i < n; i++) {
          const q = Math.min(1, (t - starts[i]) / anim);
          if (q <= 0) continue;
          const e = easeOutCubic(q);
          const r = blocks[i];
          const dy = (1 - e) * nh * 0.015; // trượt nhẹ từ dưới lên
          cctx.save();
          cctx.beginPath();
          cctx.rect(r.x, r.y + dy, r.w * e, r.h); // quét từ trái sang phải
          cctx.clip();
          cctx.globalAlpha = Math.min(1, q * 2.2);
          cctx.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y + dy, r.w, r.h);
          cctx.restore();
        }
        return comp;
      },
    };
  } catch {
    return null; // ảnh bị chặn đọc điểm ảnh hoặc lỗi bất kỳ: bỏ hiệu ứng, dùng ảnh nguyên bản
  }
}
