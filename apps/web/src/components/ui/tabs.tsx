'use client';

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';
import styles from './tabs.module.css';

export type TabItem = { id: string; label: ReactNode; content: ReactNode };

/**
 * In-page tab widget (ARIA tablist/tab/tabpanel) with roving focus: Arrow keys, Home and
 * End move between tabs; activation follows focus. Use `LinkTabs` when tabs change URL.
 */
export function Tabs({ label, tabs, defaultTab, onChange }: { label: string; tabs: TabItem[]; defaultTab?: string; onChange?: (id: string) => void }) {
  const [selected, setSelected] = useState(defaultTab ?? tabs[0]?.id);
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const select = (id: string, focus: boolean) => {
    setSelected(id);
    onChange?.(id);
    if (focus) tabRefs.current.get(id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (target === null) return;
    event.preventDefault();
    const tab = tabs[target];
    if (tab) select(tab.id, true);
  };

  return (
    <div className={styles.widget}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((tab, index) => {
          const active = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                if (element) tabRefs.current.set(tab.id, element);
                else tabRefs.current.delete(tab.id);
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              className={styles.tab}
              onClick={() => select(tab.id, false)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} id={`${baseId}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab.id}`} tabIndex={0} hidden={tab.id !== selected} className={styles.panel}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
