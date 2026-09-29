// A TIME field stores a time of day as minutes since 00:00 (0 - 1439).
// Same rules as globiscomponents common/time-minutes.ts and globals.svy_utl_TimeOfDayToMinutes on the server.

import { Format } from '@servoy/public';

export const MAX_TIME_MINUTES = 1439;

/**
 * The format for a MaskFormat on a time input: HH:mm with a fixed colon, shown as __:__ while empty.
 */
export function createTimeMaskFormat(): Format {
    const format = new Format();
    format.type = 'TEXT';
    format.edit = '##:##';
    format.isMask = true;
    format.placeHolder = '_';
    return format;
}

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const TYPED_DIGITS_PATTERN = /^\d{1,4}$/;

function isValidMinutes(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= MAX_TIME_MINUTES;
}

/**
 * Converts 'HH:mm', 'H:mm', a whole number or a string with a whole number to minutes since 00:00.
 * Returns null when the value is empty and NaN when it is not a valid time of day.
 */
export function toMinutes(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    let minutes = Number.NaN;
    if (typeof value === 'number') {
        minutes = value;
    } else {
        const text = value.trim();
        if (text === '') {
            return null;
        }
        const match = TIME_PATTERN.exec(text);
        if (match) {
            const hours = Number.parseInt(match[1], 10);
            const mins = Number.parseInt(match[2], 10);
            if (hours <= 23 && mins <= 59) {
                minutes = hours * 60 + mins;
            }
        } else if (WHOLE_NUMBER_PATTERN.test(text)) {
            minutes = Number.parseInt(text, 10);
        }
    }

    return isValidMinutes(minutes) ? minutes : Number.NaN;
}

/**
 * Converts what a user typed to minutes since 00:00: 'HH:mm', 'H:mm', or digits without a colon
 * read as hours and minutes ('8' is 08:00, '830' is 08:30, '1345' is 13:45).
 * Returns null when the text is empty and NaN when it is not a valid time of day.
 */
export function parseTypedTime(text: string | null | undefined): number | null {
    const value = text?.trim() ?? '';
    if (value === '') {
        return null;
    }
    if (TYPED_DIGITS_PATTERN.test(value)) {
        const hours = value.length <= 2 ? value : value.slice(0, -2);
        const mins = value.length <= 2 ? '00' : value.slice(-2);
        return toMinutes(hours + ':' + mins);
    }
    return TIME_PATTERN.test(value) ? toMinutes(value) : Number.NaN;
}

/**
 * Converts the value of a ##:## masked input ('08:30', '13:__', '__:__') to minutes since 00:00.
 * Only the hours filled in means the full hour ('13:__' is 13:00).
 * Returns null when nothing is filled in and NaN when it is not a valid time of day.
 */
export function parseMaskedTime(text: string | null | undefined): number | null {
    const value = (text ?? '').replace(/_/g, '').trim();
    if (value === '' || value === ':') {
        return null;
    }
    return parseTypedTime(value.endsWith(':') ? value + '00' : value);
}

/**
 * Formats minutes since 00:00 as HH:mm.
 * Returns null when the value is empty or not between 0 and 1439.
 */
export function toHHmm(minutes: number | null | undefined): string | null {
    if (minutes === null || minutes === undefined || !isValidMinutes(minutes)) {
        return null;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

/**
 * True when a column holds minutes since 00:00: a time format (e.g. i18n:globis.formats.time) on a number dataprovider.
 * Number formats never contain H or h, and time formats on DATETIME columns are left alone.
 * The value is always shown as HH:mm, whatever the pattern.
 */
export function isTimeFormat(format: { type?: string; display?: string } | null | undefined): boolean {
    return !!format && (format.type === 'INTEGER' || format.type === 'NUMBER') && /[Hh]/.test(format.display ?? '');
}
