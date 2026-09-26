/** Original minimal toolbar glyphs (24px grid, currentColor strokes). Decorative only. */
const PATHS: Record<string, string> = {
  undo: 'M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2',
  redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h2',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8M6 20h8M15 4 9 20',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 21h14',
  strike: 'M4 12h16M16 6.5A4.5 3.5 0 0 0 8 8c0 4 8 3 8 8a4.5 3.5 0 0 1-8.5 1.5',
  clear: 'M6 5h12M12 5 9 19M4 20 20 4',
  bulletList: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  orderedList: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 14.5a1.5 1.5 0 1 1 2.5 1.2L3.5 19H6.5',
  blockquote: 'M5 17c2-1 3-3 3-6H5V6h5v5c0 4-2 7-5 8M14 17c2-1 3-3 3-6h-3V6h5v5c0 4-2 7-5 8',
  horizontalRule: 'M3 12h18M7 7h10M7 17h10',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  unlink: 'M15.5 8.5 19 5M5 19l3.5-3.5M9 5V3M3 9h2M15 21v-2M21 15h-2M10 14l-1 1a4 4 0 0 1-5.66-5.66L6 7M14 10l1-1a4 4 0 0 1 5.66 5.66L18 17',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
  table: 'M3 5h18v14H3zM3 10h18M3 14.5h18M9 5v14M15 5v14',
};

export function ToolIcon({ name }: { name: string }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
