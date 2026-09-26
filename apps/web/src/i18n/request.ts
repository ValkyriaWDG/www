import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { formats } from './formats';
import { messages } from './messages';
import { DISPLAY_TIME_ZONE, routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: messages[locale],
    timeZone: DISPLAY_TIME_ZONE,
    formats,
    onError(error) {
      // Missing keys are caught by the dictionary parity test; never leak details to users.
      console.error(`[i18n] ${error.code}: ${error.message}`);
    },
  };
});
