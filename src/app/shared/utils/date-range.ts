import { addDaysIso, todayIso } from '@core/models';

/** Quick date ranges for report pages (local 'YYYY-MM-DD', both ends inclusive). */
export type DatePreset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'all';

export interface DateRange {
  from: string | null;
  to: string | null;
}

export const DATE_PRESETS: readonly { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'วันนี้' },
  { id: 'last7', label: '7 วันล่าสุด' },
  { id: 'thisMonth', label: 'เดือนนี้' },
  { id: 'lastMonth', label: 'เดือนก่อน' },
  { id: 'all', label: 'ทั้งหมด' },
];

const firstOfMonth = (iso: string): string => `${iso.slice(0, 7)}-01`;

/** Local-date range for a preset ('all' = unbounded). */
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
    case 'all':
      return { from: null, to: null };
  }
}

/** The preset matching a range, or null for a custom range. */
export const matchingPreset = (range: DateRange, today = todayIso()): DatePreset | null =>
  DATE_PRESETS.find((p) => {
    const r = presetRange(p.id, today);
    return r.from === range.from && r.to === range.to;
  })?.id ?? null;
