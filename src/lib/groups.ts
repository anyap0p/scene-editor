import type { Project, SceneElement, TimelineGroup } from './types';
import { newGroupId } from './types';

export function normalizeProject(project: Project): Project {
  const groups = project.groups ?? [];
  const groupIds = new Set(groups.map((g) => g.id));
  const elements = project.elements.map((el) =>
    el.groupId && !groupIds.has(el.groupId) ? { ...el, groupId: undefined } : el,
  );
  return { ...project, groups, elements };
}

export function groupMembers(project: Project, groupId: string): SceneElement[] {
  return project.elements.filter((e) => e.groupId === groupId);
}

export function ungroupedElements(project: Project): SceneElement[] {
  return project.elements.filter((e) => !e.groupId);
}

export function sortedGroups(project: Project): TimelineGroup[] {
  return [...(project.groups ?? [])].sort((a, b) => a.order - b.order);
}

export function groupBounds(members: SceneElement[]): { start: number; end: number } {
  if (members.length === 0) return { start: 0, end: 0 };
  return {
    start: Math.min(...members.map((m) => m.start)),
    end: Math.max(...members.map((m) => m.end)),
  };
}

export function createGroup(
  project: Project,
  elementIds: string[],
  name?: string,
): { project: Project; group: TimelineGroup } {
  const order = (project.groups ?? []).length;
  const group: TimelineGroup = {
    id: newGroupId(),
    name: name?.trim() || `Group ${order + 1}`,
    collapsed: false,
    order,
  };
  const idSet = new Set(elementIds);
  return {
    group,
    project: {
      ...project,
      groups: [...(project.groups ?? []), group],
      elements: project.elements.map((el) =>
        idSet.has(el.id) ? { ...el, groupId: group.id } : el,
      ),
    },
  };
}

export function dissolveGroup(project: Project, groupId: string): Project {
  return {
    ...project,
    groups: (project.groups ?? []).filter((g) => g.id !== groupId),
    elements: project.elements.map((el) =>
      el.groupId === groupId ? { ...el, groupId: undefined } : el,
    ),
  };
}

export function ungroupElements(project: Project, elementIds: string[]): Project {
  const idSet = new Set(elementIds);
  return {
    ...project,
    elements: project.elements.map((el) =>
      idSet.has(el.id) ? { ...el, groupId: undefined } : el,
    ),
  };
}

export function toggleGroupCollapsed(
  project: Project,
  groupId: string,
): Project {
  return {
    ...project,
    groups: (project.groups ?? []).map((g) =>
      g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
    ),
  };
}

export function renameGroup(
  project: Project,
  groupId: string,
  name: string,
): Project {
  return {
    ...project,
    groups: (project.groups ?? []).map((g) =>
      g.id === groupId ? { ...g, name: name.trim() || g.name } : g,
    ),
  };
}
