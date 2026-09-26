import type { Metadata } from 'next';
import Link from 'next/link';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Stránka nenalezena · Page not found — Valkyria',
  robots: { index: false },
};

/**
 * Global 404 for URLs outside `/cs` and `/en` (including unsupported explicit locales).
 * No locale can be inferred, so it offers both languages explicitly.
 */
export default function GlobalNotFound() {
  return (
    <html lang="cs">
      <body className="status-page">
        <main className="status-panel" aria-labelledby="not-found-title">
          <p className="status-code">404</p>
          <h1 id="not-found-title">
            <span lang="cs">Stránka nenalezena</span>
            <span aria-hidden="true"> · </span>
            <span lang="en">Page not found</span>
          </h1>
          <ul className="status-links">
            <li>
              <Link href="/cs" lang="cs" hrefLang="cs">
                Hlavní menu (Čeština)
              </Link>
            </li>
            <li>
              <Link href="/en" lang="en" hrefLang="en">
                Main menu (English)
              </Link>
            </li>
          </ul>
        </main>
      </body>
    </html>
  );
}
