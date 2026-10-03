import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './dialogs';

// The dialog needs only `useTranslations`; the real module and the Link wrapper pull the Next.js client runtime.
vi.mock('@/i18n/navigation', () => ({ Link: ({ children, href }: { children: ReactNode; href: string }) => createElement('a', { href }, children) }));
vi.mock('next-intl', async () => {
  const messages = (await import('@/i18n/messages/cs/adminEditorial.json')).default as Record<string, unknown>;
  return {
    useTranslations: (namespace: string) => (key: string) => {
      const value = `${namespace}.${key}`
        .split('.')
        .slice(1)
        .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), messages);
      if (typeof value !== 'string') throw new Error(`Missing message ${namespace}.${key}`);
      return value;
    },
  };
});

function render(cancelLabel?: string): string {
  return renderToStaticMarkup(
    <ConfirmDialog open title="Zrušit plán?" confirmLabel="Zrušit plán" cancelLabel={cancelLabel} onConfirm={() => undefined} onCancel={() => undefined} />,
  );
}

const buttonText = (html: string, role: 'cancel' | 'confirm') => new RegExp(`<button[^>]*data-confirm="${role}"[^>]*>(.*?)</button>`).exec(html)?.[1]?.replace(/<[^>]+>/g, '').trim();

describe('ConfirmDialog', () => {
  it('uses the generic cancel label by default', () => {
    const html = render();
    expect(buttonText(html, 'cancel')).toBe('Zrušit');
    expect(buttonText(html, 'confirm')).toBe('Zrušit plán');
  });

  it('names the safe choice explicitly when the confirm action is itself a cancellation', () => {
    const html = render('Ponechat plán');
    expect(buttonText(html, 'cancel')).toBe('Ponechat plán');
    expect(buttonText(html, 'confirm')).toBe('Zrušit plán');
  });
});
