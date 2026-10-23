import { addDaysIso, todayIso } from '@core/models';

/** Quick date ranges for report pages (local 'YYYY-MM-DD', both ends inclusive). */
export type DatePreset = 'today' | 'last7' | 'thisMonth' | 'lastMonth';

export interface DateRange {
  from: string | null;
  to: string | null;
}

export const DATE_PRESETS: readonly { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'วันนี้' },
  { id: 'last7', label: '7 วันล่าสุด' },
  { id: 'thisMonth', label: 'เดือนนี้' },
  { id: 'lastMonth', label: 'เดือนก่อน' },
];

const firstOfMonth = (iso: string): string => `${iso.slice(0, 7)}-01`;

/**
 * Local-date range for a preset. No 'all': dated lists take at most `MAX_RANGE_DAYS` (api limit,
 * decided 2026-10-23).
 */
export function presetRange(preset: DatePreset, today = todayIso()): DateRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDaysIso(today, -6), to: today };
    case 'thisMonth':
      return { from: firstOfMonth(today), to: today };
    case 'lastMonth': {
      const lastDay = addDaysIso(firstOfMonth(today), -1);
      return { from: firstOfMonth(lastDay), to: lastDay };
    }
  }
}

/** The preset matching a range, or null for a custom range. */
export const matchingPreset = (range: DateRange, today = todayIso()): DatePreset | null =>
  DATE_PRESETS.find((p) => {
    const r = presetRange(p.id, today);
    return r.from === range.from && r.to === range.to;
  })?.id ?? null;
