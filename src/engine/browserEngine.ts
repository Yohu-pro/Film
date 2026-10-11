/**
 * Bộ dựng DỰ PHÒNG chạy ngay trong trình duyệt (không cần cài gì).
 * Dùng khi máy dựng FFmpeg chưa bật. Hạn chế: dựng theo thời gian thực
 * (phim 5 phút = chờ 5 phút), phải giữ tab mở và đang hiển thị.
 *
 * Mọi quyết định về thời lượng / phụ đề / kích thước lấy từ shared/render/plan.ts
 * nên khớp với máy dựng FFmpeg.
 */
import { buildTimeline } from '../../shared/render/plan';
import type { SceneSpec, SubtitleStyle, TimelineScene } from '../../shared/render/types';
import { createTextReveal, type TextReveal } from './textReveal';
import { RenderCancelled, EngineError, type RenderCallbacks, type RenderRequest, type RenderResult } from './types';

const DUCK_LEVEL = 0.22;
/** Ảnh slide: tự nhận diện từng khối chữ và cho hiện lần lượt. Đặt false để tắt. */
const ENABLE_TEXT_REVEAL = true;
const FADE_MS = 500;      // thời gian chuyển cảnh mờ dần (ms)
const SUB_ANIM_SEC = 0.35; // thời gian phụ đề hiện dần (giây)

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(' '));
    return head;
  }
  return lines;
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: SubtitleStyle,
  W: number,
  H: number,
  anim = 1,
) {
  const fontSize = Math.round(Math.min(W, H) * 0.052);
  ctx.save();
  ctx.globalAlpha = anim;
  ctx.translate(0, (1 - anim) * fontSize * 0.8); // trượt nhẹ từ dưới lên
  ctx.font = `bold ${fontSize}px "Be Vietnam Pro", "Outfit", "Inter", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = wrapLines(ctx, text, W * 0.88);
  const lineH = fontSize * 1.25;
  const bottomMargin = H * (W / H < 0.8 ? 0.12 : 0.07);
  const firstY = H - bottomMargin - (lines.length - 1) * lineH - fontSize / 2;

  lines.forEach((line, i) => {
    const y = firstY + i * lineH;
    if (style === 'yellow_stroke') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.18));
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, W / 2, y);
      ctx.fillStyle = '#FFE600';
      ctx.fillText(line, W / 2, y);
    } else {
      const padX = fontSize * 0.6;
      const boxW = ctx.measureText(line).width + padX * 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.roundRect((W - boxW) / 2, y - lineH / 2, boxW, lineH, 10);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, W / 2, y);
    }
  });
  ctx.restore();
}

type Drawable = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: Drawable,
  fit: 'blur' | 'cover' | 'contain',
  W: number,
  H: number,
  zoom = 1,
  panX = 0,
) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  const vW = (video instanceof HTMLVideoElement ? video.videoWidth : video instanceof HTMLImageElement ? video.naturalWidth : video.width) || W;
  const vH = (video instanceof HTMLVideoElement ? video.videoHeight : video instanceof HTMLImageElement ? video.naturalHeight : video.height) || H;
  if (zoom !== 1 || panX !== 0) {
    ctx.save();
    ctx.translate(W / 2 + panX, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
  }
  drawFitted(ctx, video, vW, vH, fit, W, H);
  if (zoom !== 1 || panX !== 0) ctx.restore();
}

function drawFitted(
  ctx: CanvasRenderingContext2D,
  video: Drawable,
  vW: number,
  vH: number,
  fit: 'blur' | 'cover' | 'contain',
  W: number,
  H: number,
) {
  if (fit === 'cover') {
    const scale = Math.max(W / vW, H / vH);
    ctx.drawImage(video, (W - vW * scale) / 2, (H - vH * scale) / 2, vW * scale, vH * scale);
    return;
  }
  if (fit === 'blur') {
    ctx.save();
    ctx.filter = 'blur(30px) brightness(0.45)';
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();
  }
  const scale = Math.min(W / vW, H / vH);
  ctx.drawImage(video, (W - vW * scale) / 2, (H - vH * scale) / 2, vW * scale, vH * scale);
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 20000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement | null> {
  return new Promise(resolve => {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.loop = true; // clip ngắn hơn cảnh -> lặp lại (giống máy dựng FFmpeg)
    el.preload = 'auto';
    const timer = setTimeout(() => resolve(null), 20000);
    el.onloadeddata = () => { clearTimeout(timer); resolve(el); };
    el.onerror = () => { clearTimeout(timer); resolve(null); };
    el.src = url;
  });
}

export async function renderInBrowser(req: RenderRequest, cb: RenderCallbacks): Promise<RenderResult> {
  const warnings: string[] = [];
  const { settings } = req;

  const usable = req.scenes.filter((s, i) => {
    if (s.videoUrl) return true;
    if (s.voiceUrl) warnings.push(`Cảnh ${i + 1}: có voice nhưng chưa có video nên đã bỏ qua cảnh này.`);
    return false;
  });
  if (usable.length === 0) throw new EngineError('Không có video hợp lệ để dựng.');

  const specs: SceneSpec[] = usable.map(s => ({
    id: s.id,
    kind: s.kind,
    videoDuration: s.videoDuration,
    videoWidth: s.videoWidth,
    videoHeight: s.videoHeight,
    voiceDuration: s.voiceUrl ? s.voiceDuration : undefined,
    subtitleText: s.subtitleText,
  }));
  const timeline = buildTimeline(specs, settings);
  const W = timeline.width;
  const H = timeline.height;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  // Ảnh chụp khung hình cuối của cảnh trước, dùng để chuyển cảnh mờ dần
  const snap = document.createElement('canvas');
  snap.width = W;
  snap.height = H;
  let hasSnap = false;
  if (!ctx) throw new EngineError('Trình duyệt không hỗ trợ vẽ video (Canvas 2D).');

  if (typeof MediaRecorder === 'undefined') {
    throw new EngineError('Trình duyệt này không hỗ trợ ghi video. Hãy dùng Chrome hoặc Edge, hoặc bật máy dựng.');
  }

  const AudioCtxClass: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtxClass();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const audioDest = audioCtx.createMediaStreamDestination();

  let wakeLock: { release: () => Promise<void> } | null = null;
  try { wakeLock = await (navigator as any).wakeLock?.request('screen'); } catch { /* không hỗ trợ */ }

  let bgmEl: HTMLAudioElement | null = null;
  let bgmGain: GainNode | null = null;
  const bgmBase = Math.max(0, Math.min(1, settings.bgmVolume / 100));
  if (settings.enableBgm && req.bgm) {
    bgmEl = new Audio(req.bgm.url);
    bgmEl.loop = true;
    bgmEl.crossOrigin = 'anonymous';
    const src = audioCtx.createMediaElementSource(bgmEl);
    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = bgmBase;
    src.connect(bgmGain);
    bgmGain.connect(audioDest);
  }

  const canvasStream = canvas.captureStream(timeline.fps);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);

  const mimeTypes = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const isMp4 = mimeType.startsWith('video/mp4');
  const bitrate = settings.quality === '4k' ? 18_000_000 : settings.quality === '720p' ? 4_000_000 : 9_000_000;

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });

  const onVisibility = () => {
    if (document.hidden) cb.onProgress(-1, 'Hãy giữ tab này mở và hiển thị để phim không bị đứng hình...');
  };
  document.addEventListener('visibilitychange', onVisibility);

  const players: Array<HTMLMediaElement> = [];
  try {
    recorder.start(250);
    if (bgmEl) {
      bgmEl.currentTime = 0;
      await bgmEl.play().catch(() => warnings.push('Không phát được nhạc nền, phim có thể thiếu nhạc.'));
    }

    for (const scene of timeline.scenes) {
      if (cb.signal.aborted) throw new RenderCancelled();
      const src = usable[scene.index];
      cb.onProgress(
        Math.min(94, 3 + Math.round((scene.start / timeline.totalDuration) * 90)),
        `Đang dựng cảnh ${scene.index + 1}/${timeline.scenes.length}...`,
      );

      const isImage = src.kind === 'image';
      const videoEl: (HTMLVideoElement | HTMLImageElement | null) = isImage ? await loadImage(src.videoUrl) : await loadVideo(src.videoUrl);
      if (!videoEl) {
        warnings.push(`Cảnh ${scene.index + 1}: file video "${src.videoName}" bị hỏng hoặc không đọc được nên đã bỏ qua.`);
        continue;
      }
      if (videoEl instanceof HTMLVideoElement) players.push(videoEl);

      let voiceEl: HTMLAudioElement | null = null;
      if (src.voiceUrl && scene.voiceOffset !== null) {
        voiceEl = new Audio(src.voiceUrl);
        voiceEl.crossOrigin = 'anonymous';
        const node = audioCtx.createMediaElementSource(voiceEl);
        node.connect(audioDest);
        players.push(voiceEl);
      }

      if (videoEl instanceof HTMLVideoElement) {
        videoEl.currentTime = 0;
        await videoEl.play().catch(() => { /* sẽ thử lại theo khung hình */ });
      }

      const reveal: TextReveal | null =
        isImage && ENABLE_TEXT_REVEAL ? createTextReveal(videoEl as HTMLImageElement, scene.duration) : null;

      await runScene(ctx, videoEl, voiceEl, scene, {
        fit: settings.fitMode,
        subtitleStyle: settings.subtitleStyle,
        reveal,
        motion: scene.index % 4,
        prev: hasSnap ? snap : null,
        W, H,
        signal: cb.signal,
        duck: (on: boolean) => {
          if (!bgmGain) return;
          const target = on ? bgmBase * DUCK_LEVEL : bgmBase;
          bgmGain.gain.setTargetAtTime(target, audioCtx.currentTime, on ? 0.12 : 0.3);
        },
      });

      try { snap.getContext('2d')?.drawImage(canvas, 0, 0); hasSnap = true; } catch { /* bỏ qua */ }

      if (videoEl instanceof HTMLVideoElement) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      if (voiceEl) { voiceEl.pause(); voiceEl.removeAttribute('src'); voiceEl.load(); }
    }

    cb.onProgress(96, 'Đang đóng gói video...');
    bgmEl?.pause();
    recorder.stop();
    await stopped;
  } catch (err) {
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* bỏ qua */ }
    throw err;
  } finally {
    document.removeEventListener('visibilitychange', onVisibility);
    players.forEach(p => { try { p.pause(); } catch { /* bỏ qua */ } });
    bgmEl?.pause();
    void audioCtx.close().catch(() => {});
    void wakeLock?.release().catch(() => {});
  }

  const type = mimeType || 'video/webm';
  const blob = new Blob(chunks, { type });
  if (blob.size === 0) throw new EngineError('Trình duyệt không ghi được video. Hãy thử Chrome/Edge hoặc bật máy dựng.');
  const url = URL.createObjectURL(blob);

  if (!req.bgm && req.generatedMusic && settings.enableBgm) {
    warnings.push('Nhạc nền tự tạo cần máy dựng. Hãy bật máy dựng hoặc tải nhạc của bạn lên.');
  }
  if (!isMp4) warnings.push('Trình duyệt này chỉ xuất được định dạng WebM. Dùng Chrome/Edge mới hoặc bật máy dựng để có MP4 chuẩn.');

  return {
    engine: 'browser',
    url,
    downloadUrl: () => url,
    extension: isMp4 ? 'mp4' : 'webm',
    duration: Math.round(timeline.totalDuration * 10) / 10,
    sizeMB: Math.round((blob.size / 1048576) * 10) / 10,
    width: W,
    height: H,
    warnings,
    dispose: () => URL.revokeObjectURL(url),
  };
}

interface SceneRunOptions {
  fit: 'blur' | 'cover' | 'contain';
  subtitleStyle: SubtitleStyle;
  /** 0: zoom vào, 1: zoom ra, 2: zoom vào + lướt trái, 3: zoom vào + lướt phải */
  motion: number;
  reveal: TextReveal | null;
  prev: HTMLCanvasElement | null;
  W: number;
  H: number;
  signal: AbortSignal;
  duck: (on: boolean) => void;
}

function runScene(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | HTMLImageElement,
  voice: HTMLAudioElement | null,
  scene: TimelineScene,
  o: SceneRunOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sceneMs = scene.duration * 1000;
    const voiceStartMs = scene.voiceOffset !== null ? scene.voiceOffset * 1000 : Infinity;
    const voiceEndMs = voiceStartMs + scene.voiceDuration * 1000;
    let voiceStarted = false;
    let voiceEnded = false;
    const t0 = performance.now();

    const timer = setInterval(() => {
      if (o.signal.aborted) {
        clearInterval(timer);
        reject(new RenderCancelled());
        return;
      }
      const elapsedMs = performance.now() - t0;
      if (elapsedMs >= sceneMs) {
        clearInterval(timer);
        if (voiceStarted && !voiceEnded) o.duck(false);
        resolve();
        return;
      }

      if (voice && !voiceStarted && elapsedMs >= voiceStartMs) {
        voiceStarted = true;
        o.duck(true);
        voice.currentTime = 0;
        void voice.play().catch(() => {});
      }
      if (voiceStarted && !voiceEnded && elapsedMs >= voiceEndMs) {
        voiceEnded = true;
        o.duck(false);
      }
      let zoom = 1;
      let panX = 0;
      if (video instanceof HTMLVideoElement) {
        if (video.paused) void video.play().catch(() => {});
      } else {
        const t = Math.min(1, elapsedMs / sceneMs);
        const p = t * t * (3 - 2 * t); // chuyển động êm ở đầu và cuối cảnh
        const Z = 0.16;
        if (o.motion === 1) zoom = 1 + Z - Z * p;
        else if (o.motion === 2) { zoom = 1.1 + 0.06 * p; panX = o.W * 0.04 * (0.5 - p); }
        else if (o.motion === 3) { zoom = 1.1 + 0.06 * p; panX = o.W * 0.04 * (p - 0.5); }
        else zoom = 1 + Z * p;
      }

      // Ảnh slide có hiệu ứng hiện lần lượt: dùng khung đã ghép sẵn thay cho ảnh gốc
      const frameSrc: Drawable = o.reveal ? o.reveal.render(elapsedMs / 1000) : video;

      // Chuyển cảnh mờ dần từ cảnh trước
      const fadeP = o.prev ? Math.min(1, elapsedMs / FADE_MS) : 1;
      if (o.prev && fadeP < 1) {
        ctx.globalAlpha = 1;
        ctx.drawImage(o.prev, 0, 0);
        ctx.globalAlpha = fadeP;
        drawVideoFrame(ctx, frameSrc, o.fit, o.W, o.H, zoom, panX);
        ctx.globalAlpha = 1;
      } else {
        drawVideoFrame(ctx, frameSrc, o.fit, o.W, o.H, zoom, panX);
      }

      const elapsed = elapsedMs / 1000;
      const cue = scene.cues.find(c => elapsed >= c.start && elapsed < c.end);
      if (cue) {
        const a = Math.min(1, (elapsed - cue.start) / SUB_ANIM_SEC);
        drawSubtitle(ctx, cue.text, o.subtitleStyle, o.W, o.H, 1 - (1 - a) * (1 - a));
      }
    }, 1000 / 30);
  });
}
