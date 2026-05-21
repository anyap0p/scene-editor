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

export function defaultElement(type: ElementType, duration: number): SceneElement {
  const id = newId();
  const base = {
    id,
    type,
    label: `${type} ${duration > 0 ? '' : ''}`.trim() || type,
    x: 80,
    y: 80,
    width: type === 'text' ? 280 : 320,
    height: type === 'text' ? 80 : 240,
    start: 0,
    end: Math.min(3, duration),
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
    };
  }

  return {
    ...base,
    label: type === 'image' ? 'Image' : 'Video',
    src: '',
  };
}
