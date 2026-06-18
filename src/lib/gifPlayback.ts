import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js';
import { scaledLocalTime } from './media';

const rendererCache = new Map<string, Promise<GifRenderer | null>>();

async function srcToArrayBuffer(src: string): Promise<ArrayBuffer> {
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    if (comma === -1) throw new Error('Invalid data URL');
    const meta = src.slice(0, comma);
    const data = src.slice(comma + 1);
    if (meta.includes(';base64')) {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
    const decoded = decodeURIComponent(data);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return bytes.buffer;
  }

  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`Failed to load GIF (${resp.status})`);
  return resp.arrayBuffer();
}

export function loadGifRenderer(src: string): Promise<GifRenderer | null> {
  const cached = rendererCache.get(src);
  if (cached) return cached;

  const pending = GifRenderer.fromSrc(src).then((renderer) => {
    if (!renderer) rendererCache.delete(src);
    return renderer;
  });
  rendererCache.set(src, pending);
  return pending;
}

function frameIndexAtTime(frames: ParsedFrame[], timeMs: number): number {
  const total = frames.reduce((sum, frame) => sum + (frame.delay || 10), 0);
  if (total <= 0 || frames.length === 0) return 0;

  let t = ((timeMs % total) + total) % total;
  for (let i = 0; i < frames.length; i++) {
    const delay = frames[i].delay || 10;
    if (t < delay) return i;
    t -= delay;
  }
  return frames.length - 1;
}

export class GifRenderer {
  readonly width: number;
  readonly height: number;
  private readonly frames: ParsedFrame[];
  private readonly gifCanvas: HTMLCanvasElement;
  private readonly gifCtx: CanvasRenderingContext2D;
  private readonly tempCanvas: HTMLCanvasElement;
  private readonly tempCtx: CanvasRenderingContext2D;
  private frameImageData: ImageData | null = null;
  private lastIndex = -1;

  private constructor(frames: ParsedFrame[], width: number, height: number) {
    this.frames = frames;
    this.width = width;
    this.height = height;
    this.gifCanvas = document.createElement('canvas');
    this.gifCanvas.width = width;
    this.gifCanvas.height = height;
    this.gifCtx = this.gifCanvas.getContext('2d')!;
    this.tempCanvas = document.createElement('canvas');
    this.tempCtx = this.tempCanvas.getContext('2d')!;
  }

  static async fromSrc(src: string): Promise<GifRenderer | null> {
    try {
      const buffer = await srcToArrayBuffer(src);
      const parsed = parseGIF(buffer);
      const frames = decompressFrames(parsed, true);
      if (frames.length === 0) return null;
      const width = parsed.lsd.width;
      const height = parsed.lsd.height;
      return new GifRenderer(frames, width, height);
    } catch {
      return null;
    }
  }

  /** Force the next render to rebuild the composite frame. */
  invalidate() {
    this.lastIndex = -1;
  }

  renderAtSceneTime(sceneTime: number, start: number, speed?: number) {
    const localMs = scaledLocalTime(sceneTime, start, speed) * 1000;
    const index = frameIndexAtTime(this.frames, localMs);
    if (index === this.lastIndex) return;
    this.renderUpToFrame(index);
    this.lastIndex = index;
  }

  /** Always redraw, even when the frame index has not changed. */
  renderAndDrawTo(ctx: CanvasRenderingContext2D, width: number, height: number, sceneTime: number, start: number, speed?: number) {
    this.invalidate();
    this.renderAtSceneTime(sceneTime, start, speed);
    this.drawTo(ctx, width, height);
  }

  drawTo(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.gifCanvas, 0, 0, width, height);
  }

  private renderUpToFrame(targetIndex: number) {
    this.gifCtx.clearRect(0, 0, this.width, this.height);
    this.frameImageData = null;

    for (let i = 0; i <= targetIndex; i++) {
      const frame = this.frames[i];
      if (frame.disposalType === 2) {
        this.gifCtx.clearRect(0, 0, this.width, this.height);
      }
      this.drawPatch(frame);
    }
  }

  private drawPatch(frame: ParsedFrame) {
    const { dims, patch } = frame;
    if (
      !this.frameImageData ||
      dims.width !== this.frameImageData.width ||
      dims.height !== this.frameImageData.height
    ) {
      this.tempCanvas.width = dims.width;
      this.tempCanvas.height = dims.height;
      this.frameImageData = this.tempCtx.createImageData(dims.width, dims.height);
    }

    this.frameImageData.data.set(patch);
    this.tempCtx.putImageData(this.frameImageData, 0, 0);
    this.gifCtx.drawImage(this.tempCanvas, dims.left, dims.top);
  }
}

/** Runtime source embedded in exported standalone HTML. */
export function exportGifRuntimeSource(): string {
  return `
function playbackSpeedOf(speed) {
  if (speed == null || !Number.isFinite(speed)) return 1;
  return Math.min(4, Math.max(0.1, speed));
}

function scaledLocalTime(sceneTime, start, speed) {
  return Math.max(0, (sceneTime - start) * playbackSpeedOf(speed));
}

function frameIndexAtTime(frames, timeMs) {
  var total = frames.reduce(function (sum, frame) { return sum + (frame.delay || 10); }, 0);
  if (total <= 0 || frames.length === 0) return 0;
  var t = ((timeMs % total) + total) % total;
  for (var i = 0; i < frames.length; i++) {
    var delay = frames[i].delay || 10;
    if (t < delay) return i;
    t -= delay;
  }
  return frames.length - 1;
}

function createGifPlayer(canvas, frames, gifWidth, gifHeight, displayW, displayH) {
  var gifCanvas = document.createElement('canvas');
  gifCanvas.width = gifWidth;
  gifCanvas.height = gifHeight;
  var gifCtx = gifCanvas.getContext('2d');
  var tempCanvas = document.createElement('canvas');
  var tempCtx = tempCanvas.getContext('2d');
  var frameImageData = null;
  var lastIndex = -1;

  function drawPatch(frame) {
    var dims = frame.dims;
    var patch = frame.patch;
    if (!frameImageData || dims.width !== frameImageData.width || dims.height !== frameImageData.height) {
      tempCanvas.width = dims.width;
      tempCanvas.height = dims.height;
      frameImageData = tempCtx.createImageData(dims.width, dims.height);
    }
    frameImageData.data.set(patch);
    tempCtx.putImageData(frameImageData, 0, 0);
    gifCtx.drawImage(tempCanvas, dims.left, dims.top);
  }

  function renderUpToFrame(targetIndex) {
    gifCtx.clearRect(0, 0, gifWidth, gifHeight);
    frameImageData = null;
    for (var i = 0; i <= targetIndex; i++) {
      var frame = frames[i];
      if (frame.disposalType === 2) gifCtx.clearRect(0, 0, gifWidth, gifHeight);
      drawPatch(frame);
    }
  }

  function drawContained(ctx, destW, destH) {
    var gifAspect = gifWidth / gifHeight;
    var destAspect = destW / destH;
    var dw, dh, dx, dy;
    if (gifAspect > destAspect) {
      dw = destW;
      dh = destW / gifAspect;
      dx = 0;
      dy = (destH - dh) / 2;
    } else {
      dh = destH;
      dw = destH * gifAspect;
      dy = 0;
      dx = (destW - dw) / 2;
    }
    ctx.drawImage(gifCanvas, dx, dy, dw, dh);
  }

  return {
    renderAtSceneTime: function (sceneTime, start, speed) {
      var localMs = scaledLocalTime(sceneTime, start, speed) * 1000;
      var index = frameIndexAtTime(frames, localMs);
      if (index === lastIndex) return;
      renderUpToFrame(index);
      lastIndex = index;
    },
    drawToDisplay: function () {
      canvas.width = displayW;
      canvas.height = displayH;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, displayW, displayH);
      drawContained(ctx, displayW, displayH);
    },
    syncToSceneTime: function (sceneTime, start, speed) {
      lastIndex = -1;
      this.renderAtSceneTime(sceneTime, start, speed);
      this.drawToDisplay();
    },
  };
}

function isGifSrc(src) {
  if (!src) return false;
  if (src.indexOf('data:image/gif') === 0) return true;
  var path = src.split('?')[0].split('#')[0].toLowerCase();
  return path.slice(-4) === '.gif';
}

async function srcToArrayBuffer(src) {
  if (src.indexOf('data:') === 0) {
    var comma = src.indexOf(',');
    if (comma === -1) throw new Error('Invalid data URL');
    var meta = src.slice(0, comma);
    var data = src.slice(comma + 1);
    if (meta.indexOf(';base64') !== -1) {
      var binary = atob(data);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
    var decoded = decodeURIComponent(data);
    var raw = new Uint8Array(decoded.length);
    for (var j = 0; j < decoded.length; j++) raw[j] = decoded.charCodeAt(j);
    return raw.buffer;
  }
  var resp = await fetch(src);
  if (!resp.ok) throw new Error('Failed to load GIF');
  return resp.arrayBuffer();
}
`.trim();
}
