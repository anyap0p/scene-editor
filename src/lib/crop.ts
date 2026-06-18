import type { SceneElement } from './types';
import heartMaskUrl from '../assets/heart-mask.png?url';

export type CropShape = 'rounded' | 'circle' | 'heart';

export interface ElementCrop {
  shape: CropShape;
  /** Crop region within the element (0–1). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius in px (rounded shape only). */
  cornerRadius?: number;
}

export const HEART_MASK_URL = heartMaskUrl;

export function isMediaElement(el: Pick<SceneElement, 'type'>): boolean {
  return el.type === 'image' || el.type === 'video';
}

export function hasCrop(el: Pick<SceneElement, 'crop'>): boolean {
  return el.crop != null;
}

export function fixedAspectShape(shape: CropShape): boolean {
  return shape === 'circle' || shape === 'heart';
}

export function defaultCrop(shape: CropShape = 'rounded', elW = 320, elH = 240): ElementCrop {
  if (fixedAspectShape(shape)) {
    const sizePx = Math.min(elW, elH) * 0.72;
    return {
      shape,
      x: (elW - sizePx) / 2 / elW,
      y: (elH - sizePx) / 2 / elH,
      w: sizePx / elW,
      h: sizePx / elH,
      cornerRadius: 0,
    };
  }
  return {
    shape,
    x: 0.08,
    y: 0.08,
    w: 0.84,
    h: 0.84,
    cornerRadius: 16,
  };
}

export function cloneCrop(crop: ElementCrop): ElementCrop {
  return { ...crop };
}

export function cropRectPx(crop: ElementCrop, elW: number, elH: number) {
  return {
    x: crop.x * elW,
    y: crop.y * elH,
    w: crop.w * elW,
    h: crop.h * elH,
  };
}

/** Pixel crop rect forced to a square (circle / heart). */
export function squareCropRectPx(crop: ElementCrop, elW: number, elH: number) {
  const r = cropRectPx(crop, elW, elH);
  if (!fixedAspectShape(crop.shape)) return r;
  const size = Math.min(r.w, r.h);
  return {
    x: r.x + (r.w - size) / 2,
    y: r.y + (r.h - size) / 2,
    w: size,
    h: size,
  };
}

export function clampCrop(crop: ElementCrop, elW: number, elH: number): ElementCrop {
  let { x, y, w, h } = crop;
  w = Math.max(0.05, Math.min(1, w));
  h = Math.max(0.05, Math.min(1, h));
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));
  return { ...crop, x, y, w, h };
}

export function clampCropRectPx(
  rect: { x: number; y: number; w: number; h: number },
  elW: number,
  elH: number,
  minSize = 24,
) {
  let { x, y, w, h } = rect;
  w = Math.max(minSize, Math.min(w, elW));
  h = Math.max(minSize, Math.min(h, elH));
  x = Math.max(0, Math.min(x, elW - w));
  y = Math.max(0, Math.min(y, elH - h));
  w = Math.min(w, elW - x);
  h = Math.min(h, elH - y);
  return { x, y, w, h };
}

export function clampSquareCropRectPx(
  rect: { x: number; y: number; w: number; h: number },
  elW: number,
  elH: number,
  minSize = 24,
) {
  const size = Math.max(minSize, Math.min(rect.w, rect.h, elW, elH));
  const x = Math.max(0, Math.min(rect.x, elW - size));
  const y = Math.max(0, Math.min(rect.y, elH - size));
  return { x, y, w: size, h: size };
}

export function constrainCrop(crop: ElementCrop, elW: number, elH: number): ElementCrop {
  return fixedAspectShape(crop.shape)
    ? constrainFixedAspect(crop, elW, elH)
    : clampCrop(crop, elW, elH);
}

export function cropFromRectPx(
  crop: ElementCrop,
  rect: { x: number; y: number; w: number; h: number },
  elW: number,
  elH: number,
): ElementCrop {
  const clamped = fixedAspectShape(crop.shape)
    ? clampSquareCropRectPx(rect, elW, elH)
    : clampCropRectPx(rect, elW, elH);
  return constrainCrop(
    {
      ...crop,
      x: clamped.x / elW,
      y: clamped.y / elH,
      w: clamped.w / elW,
      h: clamped.h / elH,
    },
    elW,
    elH,
  );
}

/** Keep a square crop region in pixel space (circle / heart). */
export function constrainFixedAspect(crop: ElementCrop, elW: number, elH: number): ElementCrop {
  if (!fixedAspectShape(crop.shape)) return clampCrop(crop, elW, elH);
  const wPx = crop.w * elW;
  const hPx = crop.h * elH;
  const size = Math.max(24, Math.min(wPx, hPx, elW, elH));
  let x = crop.x * elW;
  let y = crop.y * elH;
  x = Math.max(0, Math.min(elW - size, x));
  y = Math.max(0, Math.min(elH - size, y));
  return clampCrop(
    {
      ...crop,
      x: x / elW,
      y: y / elH,
      w: size / elW,
      h: size / elH,
    },
    elW,
    elH,
  );
}

export function setCropShape(
  crop: ElementCrop,
  shape: CropShape,
  elW: number,
  elH: number,
): ElementCrop {
  const next = { ...crop, shape };
  if (shape === 'rounded' && next.cornerRadius == null) next.cornerRadius = 16;
  if (fixedAspectShape(shape)) return constrainFixedAspect(next, elW, elH);
  return clampCrop(next, elW, elH);
}

export function heartMaskStyle(): string {
  const url = JSON.stringify(HEART_MASK_URL);
  return [
    `-webkit-mask-image: url(${url})`,
    `mask-image: url(${url})`,
    '-webkit-mask-size: 100% 100%',
    'mask-size: 100% 100%',
    '-webkit-mask-repeat: no-repeat',
    'mask-repeat: no-repeat',
    '-webkit-mask-position: center',
    'mask-position: center',
  ].join('; ');
}

export function cropShapeClipStyle(crop: ElementCrop): string {
  switch (crop.shape) {
    case 'circle':
      return 'clip-path: circle(50% at 50% 50%);';
    case 'heart':
      return heartMaskStyle();
    case 'rounded': {
      const r = Math.max(0, crop.cornerRadius ?? 0);
      return r > 0 ? `border-radius: ${r}px;` : '';
    }
    default:
      return '';
  }
}

export function cropViewportStyle(crop: ElementCrop, elW: number, elH: number): string {
  const r = fixedAspectShape(crop.shape)
    ? squareCropRectPx(crop, elW, elH)
    : cropRectPx(crop, elW, elH);
  const clip = cropShapeClipStyle(crop);
  return [
    `left: ${r.x}px`,
    `top: ${r.y}px`,
    `width: ${r.w}px`,
    `height: ${r.h}px`,
    fixedAspectShape(crop.shape) ? 'aspect-ratio: 1 / 1' : '',
    'overflow: hidden',
    clip,
  ]
    .filter(Boolean)
    .join('; ');
}

export function cropMediaOffsetStyle(crop: ElementCrop, elW: number, elH: number): string {
  const r = fixedAspectShape(crop.shape)
    ? squareCropRectPx(crop, elW, elH)
    : cropRectPx(crop, elW, elH);
  return `left: ${-r.x}px; top: ${-r.y}px; width: ${elW}px; height: ${elH}px;`;
}

export function exportCropRuntimeSource(heartMaskDataUrl: string): string {
  const url = JSON.stringify(heartMaskDataUrl);
  return `
function cropRectPx(crop, elW, elH) {
  return { x: crop.x * elW, y: crop.y * elH, w: crop.w * elW, h: crop.h * elH };
}

function squareCropRectPx(crop, elW, elH) {
  var r = cropRectPx(crop, elW, elH);
  if (crop.shape !== 'circle' && crop.shape !== 'heart') return r;
  var size = Math.min(r.w, r.h);
  return { x: r.x + (r.w - size) / 2, y: r.y + (r.h - size) / 2, w: size, h: size };
}

function cropShapeClipCss(crop) {
  if (crop.shape === 'circle') return 'clip-path: circle(50% at 50% 50%);';
  if (crop.shape === 'heart') {
    return '-webkit-mask-image:url(' + ${url} + ');mask-image:url(' + ${url} + ');-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;';
  }
  if (crop.shape === 'rounded') {
    var r = crop.cornerRadius || 0;
    return r > 0 ? 'border-radius:' + r + 'px;' : '';
  }
  return '';
}

function cropViewportCss(crop, elW, elH) {
  var r = (crop.shape === 'circle' || crop.shape === 'heart')
    ? squareCropRectPx(crop, elW, elH)
    : cropRectPx(crop, elW, elH);
  var ar = (crop.shape === 'circle' || crop.shape === 'heart') ? 'aspect-ratio:1/1;' : '';
  return 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px;' + ar + 'overflow:hidden;' + cropShapeClipCss(crop);
}

function cropMediaOffsetCss(crop, elW, elH) {
  var r = (crop.shape === 'circle' || crop.shape === 'heart')
    ? squareCropRectPx(crop, elW, elH)
    : cropRectPx(crop, elW, elH);
  return 'left:' + (-r.x) + 'px;top:' + (-r.y) + 'px;width:' + elW + 'px;height:' + elH + 'px;';
}

function appendCroppedMedia(node, el, buildMedia) {
  if (!el.crop) {
    buildMedia(node);
    return;
  }
  var clip = document.createElement('div');
  clip.className = 'crop-viewport';
  clip.style.cssText = cropViewportCss(el.crop, el.width, el.height);
  var inner = document.createElement('div');
  inner.className = 'crop-media';
  inner.style.cssText = cropMediaOffsetCss(el.crop, el.width, el.height);
  buildMedia(inner);
  clip.appendChild(inner);
  node.appendChild(clip);
}
`.trim();
}
