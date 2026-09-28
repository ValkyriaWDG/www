'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { FormActions, RadioGroup, Select, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice } from '@/components/ui/panels';
import { useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { Game } from '@valkyria/db/schema';
import { createNewsAction } from '@/modules/content/actions';
import styles from './admin.module.css';

/** Publication scope choices the actor may create in (`''` = community, platform-wide only). */
export type ScopeOption = { value: '' | Game; label: string };

/**
 * Creates the post (or Field Manual article) entity and its first draft in the chosen
 * CONTENT language (Czech by default, independent of the interface language) and the
 * chosen publication scope, then opens the editor. Scope options come from the server
 * and only list games the actor may edit; the server re-checks the choice.
 */
export function NewPostForm({
  uiLocale,
  kind = 'news',
  basePath = '/admin/news',
  scopes,
}: {
  uiLocale: AppLocale;
  kind?: 'news' | 'manual';
  basePath?: string;
  scopes: ScopeOption[];
}) {
  const t = useTranslations('adminEditorial.new');
  const tLang = useTranslations('adminEditorial.common.languages');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [contentLocale, setContentLocale] = useState<'cs' | 'en'>('cs');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [pending, setPending] = useState(false);
  const [scope, setScope] = useState<'' | Game>(scopes[0]?.value ?? '');
  useUnsavedChangesGuard(title.trim() !== '' && !pending);

  const submit = async () => {
    if (title.trim() === '') {
      setTitleError(true);
      return;
    }
    setPending(true);
    setError(null);
    const result = await createNewsAction({ kind, locale: contentLocale, title, game: scope || null }).catch(() => ({ ok: false as const, code: 'unavailable' as const, fieldErrors: undefined }));
    if (result.ok) {
      router.push(`${basePath}/${result.data.documentId}?lang=${contentLocale}`);
      return;
    }
    setPending(false);
    if (result.fieldErrors?.title) setTitleError(true);
    setError(result.code);
  };

  return (
    <form
      className={`${styles.panel} ${styles.panelBody} ${styles.stack}`}
      style={{ maxWidth: '48rem' }}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      data-testid="new-post-form"
    >
      {error ? (
        <FeedbackNotice kind="error" title={t('failed')}>
          {tErrors(error as 'unexpected')}
        </FeedbackNotice>
      ) : null}
      <RadioGroup
        name="contentLocale"
        id="new-post-locale"
        label={t('languageLabel')}
        hint={t('languageHint', { ui: tLang(uiLocale) })}
        value={contentLocale}
        onChange={(event) => setContentLocale(event.target.value === 'en' ? 'en' : 'cs')}
        options={[
          { value: 'cs', label: `${tLang('cs')} (CS)`, hint: t('czechHint') },
          { value: 'en', label: `${tLang('en')} (EN)`, hint: t('englishHint') },
        ]}
      />
      {scopes.length > 0 ? (
        <Select
          name="scope"
          id="new-post-scope"
          label={t('scopeLabel')}
          hint={kind === 'manual' ? t('scopeHintManual') : t('scopeHint')}
          value={scope}
          onChange={(event) => setScope(event.target.value as '' | Game)}
          options={scopes}
          data-testid="new-post-scope"
        />
      ) : (
        <FeedbackNotice kind="warning" title={t('noScopeTitle')} live={false}>
          {t('noScopeBody')}
        </FeedbackNotice>
      )}
      <TextField
        name="title"
        id="new-post-title"
        label={t('titleLabel', { language: tLang(contentLocale) })}
        hint={t('titleHint')}
        required
        maxLength={200}
        value={title}
        lang={contentLocale}
        error={titleError ? t('titleRequired') : null}
        onChange={(event) => {
          setTitle(event.target.value);
          setTitleError(false);
        }}
        data-testid="new-post-title"
      />
      <FormActions sticky={false} status={pending ? t('creating') : null}>
        <GameButton href={basePath} intent="secondary">
          {t('cancel')}
        </GameButton>
        <GameButton type="submit" intent="primary" pending={pending} pendingLabel={t('creating')} disabled={scopes.length === 0} data-testid="new-post-submit">
          {t('submit', { locale: contentLocale })}
        </GameButton>
      </FormActions>
    </form>
  );
}
