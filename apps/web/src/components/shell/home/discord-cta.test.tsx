import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiscordCta } from './discord-cta';

const labels = {
  label: 'PŘIPOJIT SE NA DISCORD',
  sublabel: 'KOMUNITA VALKYRIA',
  externalLabel: '(externí odkaz)',
  unavailableTitle: 'DISCORD NENÍ K DISPOZICI',
  unavailableBody: 'Pozvánka na Discord teď není nastavena.',
};

describe('DiscordCta', () => {
  it('renders a same-tab external link with the localized label when configured', () => {
    const html = renderToStaticMarkup(createElement(DiscordCta, { url: 'https://discord.gg/vlkhll', ...labels }));
    expect(html).toContain('href="https://discord.gg/vlkhll"');
    expect(html).toContain('PŘIPOJIT SE NA DISCORD');
    expect(html).toContain('(externí odkaz)');
    expect(html).not.toContain('target=');
  });

  it('renders an explicit unavailable state without any link when the invite is missing', () => {
    const html = renderToStaticMarkup(createElement(DiscordCta, { url: null, ...labels }));
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href=');
    expect(html).toContain('DISCORD NENÍ K DISPOZICI');
    expect(html).toContain('Pozvánka na Discord teď není nastavena.');
  });
});
