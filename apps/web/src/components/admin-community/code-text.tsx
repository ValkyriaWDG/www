import { Fragment } from 'react';
import styles from './admin-community.module.css';

/**
 * Technical identifier (audit action, capability, entity type) in monospace. Line breaks
 * are offered only after `.` and `_`, so `match.result.record` never splits mid-word.
 */
export function CodeText({ value }: { value: string | null | undefined }) {
  if (!value) return <span className={styles.code}>—</span>;
  const parts = value.split(/(?<=[._])/);
  return (
    <span className={`${styles.code} ${styles.codeNoWrap}`}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 ? <wbr /> : null}
        </Fragment>
      ))}
    </span>
  );
}
