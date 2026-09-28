'use client';

import { useState } from 'react';
import styles from './servers.module.css';

/**
 * Copies an approved public connection address. The result is announced politely; the
 * address itself stays visible as text so copying is never the only way to get it.
 */
export function CopyAddress({ address, labels }: { address: string; labels: { copy: string; copied: string; failed: string } }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };
  return (
    <span className={styles.copy}>
      <button type="button" className={styles.copyButton} onClick={onCopy} data-copy-address="">
        {labels.copy}
      </button>
      <span role="status" aria-live="polite" className={styles.copyStatus} data-copy-status={status}>
        {status === 'copied' ? labels.copied : status === 'failed' ? labels.failed : ''}
      </span>
    </span>
  );
}
