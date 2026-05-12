/** Shared neighbor-window presets for single-wallet and bulk whale map settings. */

export const NEIGHBOR_WINDOW_PRESET_DAYS = [1, 2, 3, 5, 7, 15, 30] as const;

export function neighborWindowSelectKey(days: number | null): string {
  if (days === null) return "full";
  if ((NEIGHBOR_WINDOW_PRESET_DAYS as readonly number[]).includes(days)) return String(days);
  return "custom";
}
