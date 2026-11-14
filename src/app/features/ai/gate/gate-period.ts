import { parseDay, presetRange } from '../spend/spend-period';

/**
 * The period of "AI → Q2 gate" (plan 90, §6.7, step 16). Unlike the spend, the gate's default is
 * all time: the gate counts every draft teachers ever settled on a template. `from` / `to` live in
 * the URL as UTC days, each optional (the server reads them so); a bad day, or a start after the
 * end, is dropped silently so a hand-edited link still opens.
 */

export const GATE_PRESETS = ['all', '90', '30'] as const;
export type GatePreset = (typeof GATE_PRESETS)[number];

export interface GateRange {
  readonly from: string | null;
  readonly to: string | null;
}

export const ALL_TIME: GateRange = { from: null, to: null };

/** `?from=&to=` → the range to read. */
export function parseGateRange(from: string | null, to: string | null): GateRange {
  const f = parseDay(from);
  const t = parseDay(to);
  if (f && t && f > t) return ALL_TIME;
  return { from: f, to: t };
}

/** Both ends either empty or a day, and in order. */
export function isValidGateRange(from: string | null, to: string | null): boolean {
  const f = from ? parseDay(from) : null;
  const t = to ? parseDay(to) : null;
  if ((from && !f) || (to && !t)) return false;
  return !(f && t && f > t);
}

/** The range a preset means today. */
export function gatePresetRange(preset: GatePreset, now: Date = new Date()): GateRange {
  return preset === 'all' ? ALL_TIME : presetRange(preset, now);
}

/** The preset that gives exactly this range today, or null for a range picked by hand. */
export function gatePresetOf(range: GateRange, now: Date = new Date()): GatePreset | null {
  return (
    GATE_PRESETS.find((p) => {
      const r = gatePresetRange(p, now);
      return r.from === range.from && r.to === range.to;
    }) ?? null
  );
}
