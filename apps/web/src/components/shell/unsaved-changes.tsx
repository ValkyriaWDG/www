'use client';

import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { GameButton } from '@/components/ui/game-button';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { canSaveAll, dirtyEntries, type GuardEntry, saveDirtyEntries } from './unsaved-changes-logic';

type NavigationOptions = {
  /** Full document navigation (e.g. language switch endpoint): suppress the native beforeunload prompt once confirmed. */
  fullPage?: boolean;
};

type GuardContextValue = {
  register: (id: string, entry: GuardEntry) => void;
  unregister: (id: string) => void;
  isDirty: () => boolean;
  /** Runs `proceed` immediately when clean; otherwise asks Stay / (Save) / Discard first. */
  confirmNavigation: (proceed: () => void, options?: NavigationOptions) => void;
};

const GuardContext = createContext<GuardContextValue | null>(null);

type PendingNavigation = { proceed: () => void; fullPage: boolean };

/**
 * Registry of dirty forms for the whole shell. Header navigation and the language
 * switcher consult it; `beforeunload` covers reloads, closing the tab and external links.
 * Browser back/forward inside the app is not intercepted (Next.js has no blocking API).
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common.unsaved');
  const entries = useRef(new Map<string, GuardEntry>());
  const bypassUnload = useRef(false);
  const stayRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [canSave, setCanSave] = useState(false);

  const isDirty = useCallback(() => dirtyEntries(entries.current.values()).length > 0, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassUnload.current || !isDirty()) return;
      event.preventDefault();
      // Legacy browsers require a non-undefined returnValue to show the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const value = useMemo<GuardContextValue>(
    () => ({
      register: (id, entry) => {
        entries.current.set(id, entry);
      },
      unregister: (id) => {
        entries.current.delete(id);
      },
      isDirty,
      confirmNavigation: (proceed, options) => {
        if (!isDirty()) {
          proceed();
          return;
        }
        setSaveFailed(false);
        setCanSave(canSaveAll(entries.current.values()));
        setPending({ proceed, fullPage: options?.fullPage === true });
      },
    }),
    [isDirty],
  );

  const leave = (navigation: PendingNavigation) => {
    setPending(null);
    if (navigation.fullPage) bypassUnload.current = true;
    navigation.proceed();
  };

  const save = async () => {
    if (!pending) return;
    setSaving(true);
    setSaveFailed(false);
    const ok = await saveDirtyEntries(entries.current.values());
    setSaving(false);
    if (ok) leave(pending);
    else setSaveFailed(true);
  };

  return (
    <GuardContext.Provider value={value}>
      {children}
      <ModalDialog
        open={pending !== null}
        onClose={() => {
          if (!saving) setPending(null);
        }}
        dismissible={!saving}
        role="alertdialog"
        title={t('title')}
        description={t('body')}
        initialFocusRef={stayRef}
        actions={
          <>
            <GameButton ref={stayRef} intent="secondary" onClick={() => setPending(null)} disabled={saving} data-unsaved-action="stay">
              {t('stay')}
            </GameButton>
            {canSave ? (
              <GameButton intent="primary" onClick={save} pending={saving} pendingLabel={t('saving')} data-unsaved-action="save">
                {t('saveAndContinue')}
              </GameButton>
            ) : null}
            <GameButton intent="danger" onClick={() => pending && leave(pending)} disabled={saving} data-unsaved-action="discard">
              {t('discard')}
            </GameButton>
          </>
        }
      >
        {saveFailed ? (
          <p role="alert" data-unsaved-error="">
            {t('saveFailed')}
          </p>
        ) : null}
      </ModalDialog>
    </GuardContext.Provider>
  );
}

/**
 * Registers a form's dirty state with the shell guard. While dirty, header navigation and
 * the language switcher ask before leaving; `onSaveRequest` (resolving `true` only after
 * an authorized successful save) enables "Save and continue".
 */
export function useUnsavedChangesGuard(isDirty: boolean, options?: { onSaveRequest?: () => Promise<boolean> }): void {
  const context = useContext(GuardContext);
  const id = useId();
  const onSaveRequest = options?.onSaveRequest;

  useEffect(() => {
    if (context) {
      context.register(id, { dirty: isDirty, onSaveRequest });
      return;
    }
    // Outside the shell: still protect against closing/reloading the tab.
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [context, id, isDirty, onSaveRequest]);

  useEffect(() => () => context?.unregister(id), [context, id]);
}

/** Navigation-side API used by guarded links and the language switcher. */
export function useNavigationGuard(): Pick<GuardContextValue, 'isDirty' | 'confirmNavigation'> {
  const context = useContext(GuardContext);
  return useMemo(
    () =>
      context ?? {
        isDirty: () => false,
        confirmNavigation: (proceed: () => void) => proceed(),
      },
    [context],
  );
}
