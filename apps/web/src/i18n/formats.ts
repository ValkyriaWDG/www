import type { Formats } from 'next-intl';

/** Shared named formats. Dates render in Europe/Prague with an explicit zone where ambiguous. */
export const formats = {
  dateTime: {
    date: { day: 'numeric', month: 'long', year: 'numeric' },
    dateShort: { day: 'numeric', month: 'numeric', year: 'numeric' },
    time: { hour: '2-digit', minute: '2-digit' },
    dateTime: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    dateTimeZone: {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    },
    weekdayDateTime: { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' },
  },
  number: {
    integer: { maximumFractionDigits: 0 },
  },
} satisfies Formats;
