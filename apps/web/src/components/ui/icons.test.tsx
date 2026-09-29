import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as icons from './icons';

const PACK = path.join(process.cwd(), '../../assets/icons/valkyria-ui');
const catalog = JSON.parse(readFileSync(path.join(PACK, 'catalog.json'), 'utf8')) as { icons: { id: string; file: string }[] };
const geometry = (markup: string) =>
  [...markup.matchAll(/<(path|rect|circle)\b([^>]*?)\s*\/?>(?:<\/\1>)?/g)].map(([, tag, attributes]) => `${tag}${attributes!.replace(/\s+/g, ' ').trimEnd()}`);

describe('Valkyria UI icon pack in the shared Icon wrapper', () => {
  it.each(catalog.icons.map((icon) => icon.id))('%s keeps the source geometry and stays decorative', (id) => {
    const name = `${id.charAt(0).toUpperCase()}${id.slice(1)}Icon` as keyof typeof icons;
    const Component = icons[name] as (props: icons.IconProps) => React.JSX.Element;
    expect(Component, name).toBeTypeOf('function');
    const markup = renderToStaticMarkup(<Component size={20} />);
    const source = readFileSync(path.join(PACK, `${id}.svg`), 'utf8');
    expect(geometry(markup)).toEqual(geometry(source));
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke-width="1.75"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).toContain(`data-icon="${id}"`);
    expect(markup).toMatch(/width="20" height="20"/);
  });
});

describe('Discord mark', () => {
  it('keeps the Simple Icons geometry as a filled, decorative glyph', () => {
    const markup = renderToStaticMarkup(<icons.DiscordIcon size={20} />);
    const source = readFileSync(path.join(process.cwd(), '../../assets/icons/simple-icons/discord.svg'), 'utf8');
    expect(geometry(markup)).toEqual(geometry(source));
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('fill="currentColor"');
    expect(markup).toContain('stroke="none"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-icon="discord"');
    expect(markup).not.toContain('<title');
  });
});
