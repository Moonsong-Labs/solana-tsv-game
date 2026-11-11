/**
 * How the game prints amounts, times and dates. The venue day is a fixed
 * date, so every paper in the game reads the same on every run.
 */
import { DAY } from './rules.ts';

/** The venue day: Tuesday 10 November 2026. Times count minutes from its midnight. */
const VENUE_DAY_UTC = Date.UTC(2026, 10, 10);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9:41" for a time on the venue day. */
export function clock(minutes: number): string {
    const inDay = ((Math.floor(minutes) % DAY) + DAY) % DAY;
    const hours = Math.floor(inDay / 60);
    const mins = inDay % 60;
    return `${hours}:${String(mins).padStart(2, '0')}`;
}

/** "10 Nov 2026" for any time. */
export function date(minutes: number): string {
    const when = new Date(VENUE_DAY_UTC + Math.floor(minutes / DAY) * 86_400_000);
    return `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()}`;
}

/** "10 Nov 2026, 12:00" for any time. */
export function dateTime(minutes: number): string {
    return `${date(minutes)}, ${clock(minutes)}`;
}

/** A token amount with a sensible number of decimals: "0.80", "12.40", "1,240". */
export function amount(value: number, decimals = 2): string {
    const abs = Math.abs(value);
    const places = abs >= 1000 ? 0 : abs >= 100 ? Math.min(decimals, 1) : decimals;
    return value.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
}

/** A dollar price: "12.40". */
export function money(value: number): string {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const NAMES: Record<string, string> = { US: 'United States', DE: 'Germany' };

/** The country a jurisdiction code stands for. */
export function jurisdictionName(code: string): string {
    return NAMES[code] ?? code;
}
