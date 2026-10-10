/**
 * Điểm vào duy nhất của giao diện để dựng phim.
 * Tự chọn: máy dựng FFmpeg (nhanh, ổn định) nếu đang chạy, nếu không thì dùng trình duyệt.
 */
import { renderInBrowser } from './browserEngine';
import { pingEngine, renderRemote } from './remoteEngine';
import type { EngineHealth, RenderCallbacks, RenderRequest, RenderResult } from './types';

export * from './types';
export { getEngineUrl, pingEngine } from './remoteEngine';

export type EngineKind = 'server' | 'browser';

export async function detectEngine(): Promise<{ kind: EngineKind; health: EngineHealth | null }> {
  const health = await pingEngine();
  return health ? { kind: 'server', health } : { kind: 'browser', health: null };
}

export async function renderMovie(req: RenderRequest, cb: RenderCallbacks): Promise<RenderResult> {
  // Kiểm tra lại ngay lúc bấm để không dùng nhầm thông tin cũ
  const { kind } = await detectEngine();
  return kind === 'server' ? renderRemote(req, cb) : renderInBrowser(req, cb);
}
