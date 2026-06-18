export type ElementType = 'text' | 'image' | 'video';

export interface SceneElement {
  id: string;
  type: ElementType;
  label: string;
  text?: string;
  src?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  start: number;
  end: number;
  zIndex: number;
  groupId?: string;
  fontSize?: number;
  color?: string;
  fontWeight?: string;
  fontFamily?: string;
  /** Rotation in degrees (text elements). */
  rotation?: number;
  /** Playback speed multiplier for GIF and video (1 = normal, 0.5 = half speed). */
  playbackSpeed?: number;
}

export interface TimelineGroup {
  id: string;
  name: string;
  collapsed: boolean;
  order: number;
}

export interface Project {
  name: string;
  duration: number;
  canvasWidth: number;
  canvasHeight: number;
  elements: SceneElement[];
  groups?: TimelineGroup[];
}

export function newId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newGroupId(): string {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultElement(type: ElementType, duration: number, atTime = 0): SceneElement {
  const clipLen = Math.min(3, duration);
  const minClip = 0.2;
  let start = Math.min(Math.max(atTime, 0), duration);
  let end = Math.min(start + clipLen, duration);
  if (end - start < minClip) {
    start = Math.max(0, end - clipLen);
    end = Math.min(Math.max(start + minClip, start), duration);
  }

  const id = newId();
  const base = {
    id,
    type,
    label: `${type} ${duration > 0 ? '' : ''}`.trim() || type,
    x: 80,
    y: 80,
    width: type === 'text' ? 280 : 320,
    height: type === 'text' ? 80 : 240,
    start,
    end,
    zIndex: 1,
  };

  if (type === 'text') {
    return {
      ...base,
      label: 'Text',
      text: 'New text',
      fontSize: 28,
      color: '#ffffff',
      fontWeight: '600',
      fontFamily: 'Inter, sans-serif',
      rotation: 0,
    };
  }

  return {
    ...base,
    label: type === 'image' ? 'Image' : 'Video',
    src: '',
  };
}
