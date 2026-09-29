import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import cs from '@/i18n/messages/cs/matches.json';
import en from '@/i18n/messages/en/matches.json';
import { MatchCountry } from './match-country';

describe('legacy match country labels', () => {
  it.each(['CZ', 'FR', 'RU', 'TR', 'ES', 'FI', 'DE', 'US', 'PL', 'AU', 'CN', 'HU', 'GB', 'BR'])('renders %s as an original vector with an accessible country name', (code) => {
    const t = createTranslator({ locale: 'en', messages: en });
    const html = renderToStaticMarkup(<MatchCountry code={code} t={t} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<img|https?:/);
  });

  it('localizes names and keeps unknown/regional codes as neutral badges', () => {
    const t = createTranslator({ locale: 'cs', messages: cs });
    expect(renderToStaticMarkup(<MatchCountry code="CZ" t={t} />)).toContain('aria-label="Česko"');
    for (const code of ['EU', 'CIS', 'ZZ']) {
      const html = renderToStaticMarkup(<MatchCountry code={code} t={t} />);
      expect(html).toContain(`data-match-country="${code}"`);
      expect(html).not.toContain('<svg');
      expect(html).toContain(`>${code}</span>`);
    }
  });

  it('renders nothing for absent country metadata', () => {
    const t = createTranslator({ locale: 'en', messages: en });
    expect(renderToStaticMarkup(<MatchCountry code={null} t={t} />)).toBe('');
  });
});
