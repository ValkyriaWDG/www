/** Page numbers to show: first, last, current ±1; `null` marks a gap (a single hidden page is shown instead). */
export function paginationWindow(page: number, pageCount: number): (number | null)[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const value of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === 'number' && value - previous > 1) result.push(value - previous === 2 ? previous + 1 : null);
    result.push(value);
  }
  return result;
}
