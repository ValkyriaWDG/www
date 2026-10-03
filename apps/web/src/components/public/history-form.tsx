'use client';

import type { ComponentProps } from 'react';

/**
 * GET filter form of the server game history. Without JavaScript the submit button
 * sends it; with JavaScript a changed `<select>` submits it at once (native submission,
 * the URL stays the only state). Typed inputs keep the explicit submit so a half-typed
 * playtime floor is never sent.
 */
export function HistoryFilterForm({ children, ...props }: ComponentProps<'form'>) {
  return (
    <form
      {...props}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
