import type { ReactNode } from 'react';

/**
 * The document shell (`<html lang>`) is rendered by `app/[locale]/layout.tsx`, so the
 * language attribute always matches the URL locale. This pass-through root exists for
 * the root `not-found.tsx`, which renders its own document.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
