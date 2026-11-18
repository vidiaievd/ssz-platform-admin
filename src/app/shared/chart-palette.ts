/**
 * Colours of the panel's charts (chart.js draws on a canvas, so CSS tokens do not reach it).
 * Categorical series in fixed order, stepped for each surface — the validated palette of the
 * data-viz guide: adjacent pairs stay apart for colour-blind readers. A series past the last
 * colour is never a new hue: it folds into "Other", which is grey.
 */
export const SERIES_LIGHT = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#e34948',
] as const;
export const SERIES_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#0ca30c',
  '#9085e9',
  '#e66767',
] as const;
export const OTHER = { light: '#a3a29c', dark: '#6b6a64' } as const;
/** Axis text, grid lines and the surface (the gap between stacked segments). */
export const INK = {
  light: { text: '#52514e', grid: 'rgba(11, 11, 11, 0.08)', surface: '#ffffff' },
  dark: { text: '#c3c2b7', grid: 'rgba(240, 239, 236, 0.10)', surface: '#18181b' },
} as const;

/** The colour of series `slot` (null = "Other") on the current surface. */
export function seriesColour(slot: number | null, dark: boolean): string {
  if (slot === null) return dark ? OTHER.dark : OTHER.light;
  const palette = dark ? SERIES_DARK : SERIES_LIGHT;
  return palette[slot % palette.length];
}
