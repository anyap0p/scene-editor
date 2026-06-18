import type { Project } from './types';

/** Curated fonts for text elements (label + CSS font-family value). */
export const TEXT_FONTS = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Open Sans', value: '"Open Sans", sans-serif' },
  { label: 'Lora', value: 'Lora, serif' },
  { label: 'Playfair Display', value: '"Playfair Display", serif' },
  { label: 'Oswald', value: 'Oswald, sans-serif' },
  { label: 'Pacifico', value: 'Pacifico, cursive' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Impact', value: 'Impact, sans-serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
];

export const DEFAULT_FONT_FAMILY = 'Inter, sans-serif';

export type FontOption = { label: string; value: string };

/** Google Fonts that only ship a single weight (no wght axis in URL). */
const SINGLE_WEIGHT_GOOGLE = new Set(['Pacifico']);

const SYSTEM_FONT_NAMES = new Set(
  [
    'Arial',
    'Georgia',
    'Times New Roman',
    'Courier New',
    'Verdana',
    'Trebuchet MS',
    'Impact',
    'Comic Sans MS',
  ].map((n) => n.toLowerCase()),
);

/** Google Fonts families used by TEXT_FONTS (non-system). */
const GOOGLE_FAMILIES = [
  'Inter',
  'Roboto',
  'Open+Sans',
  'Lora',
  'Playfair+Display',
  'Oswald',
  'Pacifico',
];

const CURATED_VALUES = new Set(TEXT_FONTS.map((f) => f.value));
const CURATED_LABELS = new Set(TEXT_FONTS.map((f) => f.label.toLowerCase()));

export function primaryFontName(fontFamily: string): string {
  return fontFamily.split(',')[0]?.replace(/^["']|["']$/g, '').trim() || fontFamily;
}

export function isSystemFontName(name: string): boolean {
  return SYSTEM_FONT_NAMES.has(name.toLowerCase());
}

function parseFontWeight(weight?: string | number): number {
  if (weight == null) return 400;
  if (weight === 'normal') return 400;
  if (weight === 'bold') return 700;
  const n = Number(weight);
  return Number.isFinite(n) ? n : 400;
}

function googleFontUrlParam(name: string, weights: Set<number>): string {
  const enc = encodeURIComponent(name).replace(/%20/g, '+');
  if (SINGLE_WEIGHT_GOOGLE.has(name)) return `family=${enc}`;
  const list = [...weights].sort((a, b) => a - b).join(';');
  return `family=${enc}:wght@${list}`;
}

/** Collect web fonts + weights used by text elements for Google Fonts CSS. */
export function collectWebFontsForProject(project: Project): Map<string, Set<number>> {
  const used = new Map<string, Set<number>>();

  for (const el of project.elements) {
    if (el.type !== 'text') continue;
    const name = primaryFontName(resolveFontFamily(el.fontFamily));
    if (isSystemFontName(name)) continue;

    const weights = used.get(name) ?? new Set<number>();
    weights.add(parseFontWeight(el.fontWeight));
    used.set(name, weights);
  }

  return used;
}

export function googleFontsStylesheetUrlForProject(project: Project): string {
  const used = collectWebFontsForProject(project);
  if (used.size === 0) return googleFontsStylesheetUrl();

  const params = [...used.entries()].map(([name, weights]) =>
    googleFontUrlParam(name, weights),
  );
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`;
}

export function googleFontsStylesheetUrl(): string {
  return `https://fonts.googleapis.com/css2?family=${GOOGLE_FAMILIES.join('&family=')}&display=swap`;
}

export function googleFontsLinkTagForProject(project: Project): string {
  const url = googleFontsStylesheetUrlForProject(project);
  return `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${url}" />`;
}

export function googleFontsLinkTag(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${googleFontsStylesheetUrl()}" />`;
}

export function resolveFontFamily(fontFamily?: string): string {
  return fontFamily?.trim() || DEFAULT_FONT_FAMILY;
}

/** CSS font-family for a single family name (e.g. installed font). */
export function cssFontFamilyForName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_FONT_FAMILY;
  const quoted = /^["'].*["']$/.test(trimmed);
  if (quoted) return `${trimmed}, sans-serif`;
  if (/\s/.test(trimmed)) return `"${trimmed}", sans-serif`;
  return `${trimmed}, sans-serif`;
}

export function isLocalFontAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'queryLocalFonts' in window;
}

/**
 * Read font families installed on this device (Chrome/Edge; requires permission).
 * @returns {Promise<FontOption[]>}
 */
export async function queryInstalledFonts(): Promise<FontOption[]> {
  if (!isLocalFontAccessSupported()) return [];

  // @ts-expect-error Local Font Access API (Chromium)
  const fonts = await window.queryLocalFonts();
  const families = new Set<string>();
  for (const font of fonts) {
    if (font.family) families.add(font.family);
  }

  const options: FontOption[] = [];
  for (const family of [...families].sort((a, b) => a.localeCompare(b))) {
    if (CURATED_LABELS.has(family.toLowerCase())) continue;
    const value = cssFontFamilyForName(family);
    if (CURATED_VALUES.has(value)) continue;
    options.push({ label: family, value });
  }
  return options;
}

/** Option for a fontFamily not in built-in or installed lists (e.g. typed custom name). */
export function fontOptionForCurrent(
  fontFamily: string | undefined,
  installed: FontOption[],
): FontOption | null {
  const value = resolveFontFamily(fontFamily);
  const known = [...TEXT_FONTS, ...installed];
  if (known.some((f) => f.value === value)) return null;
  const name = value.split(',')[0].replace(/^["']|["']$/g, '').trim() || value;
  return { label: name, value };
}
