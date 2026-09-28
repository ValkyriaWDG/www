import { useTranslations } from 'next-intl';
import { type ReactNode, useId } from 'react';
import { Link } from '@/i18n/navigation';
import { SortIcon } from './icons';
import styles from './data.module.css';

export type SortDirection = 'ascending' | 'descending';

export type SelectionColumn<Row> = {
  key: string;
  header: ReactNode;
  /** Plain-text header used in the sort button's accessible name when `header` is not text. */
  headerText?: string;
  cell: (row: Row) => ReactNode;
  sortable?: boolean;
  align?: 'start' | 'center' | 'end';
  /** Tabular numerals for scores/times. */
  numeric?: boolean;
  /** Render cells as row headers (`<th scope="row">`), usually the name column. */
  rowHeader?: boolean;
  width?: string;
};

export type SelectionTableProps<Row> = {
  /** Table caption; also names the scroll region. */
  caption: string;
  captionHidden?: boolean;
  columns: SelectionColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  /** Every row carries a real link (logical localized path). */
  getRowHref: (row: Row) => string;
  /** Column whose cell content is wrapped in the row link (also stretched over the row). */
  linkColumn: string;
  selectedKey?: string | null;
  sort?: { key: string; direction: SortDirection } | null;
  /** Client-side sorting callback (only from client components). */
  onSort?: (key: string) => void;
  /** Server-side sorting through a GET form: header buttons submit `name=key:direction`. */
  sortForm?: { action: string; name?: string; params?: Record<string, string> };
  /** `false` keeps the scroll position (row selection that only updates a detail pane). */
  linkScroll?: boolean;
};

/**
 * Semantic data table after references 12/13: zebra rows, amber 2 px outline on the
 * selected row, a real link per row, sortable headers as buttons with `aria-sort`. Wide
 * tables scroll inside a labelled, focusable region instead of the whole page.
 */
export function SelectionTable<Row>({ caption, captionHidden, columns, rows, getRowKey, getRowHref, linkColumn, selectedKey, sort, onSort, sortForm, linkScroll }: SelectionTableProps<Row>) {
  const t = useTranslations('common');
  const formId = useId();
  const nextDirection = (key: string): SortDirection => (sort?.key === key && sort.direction === 'ascending' ? 'descending' : 'ascending');

  const header = (column: SelectionColumn<Row>) => {
    if (!column.sortable || (!onSort && !sortForm)) return column.header;
    const active = sort?.key === column.key ? sort.direction : undefined;
    const label = t('table.sortBy', { column: column.headerText ?? (typeof column.header === 'string' ? column.header : column.key) });
    const content = (
      <>
        <span>{column.header}</span>
        <SortIcon size={16} direction={active ?? 'none'} />
        <span className="visually-hidden">
          {label}
          {active ? `, ${active === 'ascending' ? t('table.sortedAscending') : t('table.sortedDescending')}` : ''}
        </span>
      </>
    );
    return onSort ? (
      <button type="button" className={styles.sortButton} onClick={() => onSort(column.key)}>
        {content}
      </button>
    ) : (
      <button type="submit" form={formId} name={sortForm?.name ?? 'sort'} value={`${column.key}:${nextDirection(column.key)}`} className={styles.sortButton}>
        {content}
      </button>
    );
  };

  return (
    <>
      {sortForm && !onSort ? (
        <form id={formId} action={sortForm.action} method="get" hidden>
          {Object.entries(sortForm.params ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </form>
      ) : null}
      <div className={styles.scroll} role="region" aria-label={t('a11y.scrollRegion', { label: caption })} tabIndex={0}>
        <table className={styles.table}>
          <caption className={captionHidden ? 'visually-hidden' : styles.caption}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  data-align={column.align}
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={column.sortable ? (sort?.key === column.key ? sort.direction : 'none') : undefined}
                >
                  {header(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = getRowKey(row);
              const selected = selectedKey === key;
              return (
                <tr key={key} data-selected={selected || undefined}>
                  {columns.map((column) => {
                    const content = column.cell(row);
                    const Cell = column.rowHeader ? 'th' : 'td';
                    return (
                      <Cell key={column.key} scope={column.rowHeader ? 'row' : undefined} data-align={column.align} data-numeric={column.numeric || undefined}>
                        {column.key === linkColumn ? (
                          <Link href={getRowHref(row)} scroll={linkScroll} className={styles.rowLink} aria-current={selected ? 'page' : undefined}>
                            {content}
                            {selected ? <span className="visually-hidden"> ({t('table.selected')})</span> : null}
                          </Link>
                        ) : (
                          content
                        )}
                      </Cell>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
