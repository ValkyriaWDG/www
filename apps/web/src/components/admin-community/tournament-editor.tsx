'use client';

import type { JSONContent } from '@tiptap/core';
import { GAMES, type Game } from '@valkyria/db/schema';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { FormActions, Select, TextArea, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { ShieldIcon } from '@/components/ui/icons';
import { FeedbackNotice, PageHeader, StatusBadge } from '@/components/ui/panels';
import { Link, useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/result';
import { canonicalTournamentPath } from '@/modules/games/routes';
import {
  createTournamentAction,
  deleteTournamentAction,
  loadTournamentAction,
  publishTournamentAction,
  publishTournamentDescriptionAction,
  saveTournamentDescriptionAction,
  unpublishTournamentAction,
  unpublishTournamentDescriptionAction,
  updateTournamentAction,
} from '@/modules/tournaments/actions';
import type { AdminTournament } from '@/modules/tournaments/types';
import { ConfirmDialog } from './confirm-dialog';
import { errorFor, type FieldErrors } from './errors';
import { formatDate } from './format';
import { isHttpsUrl } from './match-form';
import { ProseTabs, type ProseActions } from './prose-tabs';
import { PUBLICATION_KIND } from './status';
import { useActionError, useFieldError } from './use-messages';
import styles from './admin-community.module.css';

type UiLocale = 'cs' | 'en';

export const MAX_TOURNAMENT_LINK_ROWS = 10;

type LinkValues = { key: string; label: string; url: string };

export type TournamentValues = {
  game: Game;
  name: string;
  season: string;
  organizer: string;
  startsOn: string;
  endsOn: string;
  links: LinkValues[];
  internalNotes: string;
  /** Create only: optional custom slug (generated from the name when empty). */
  slug: string;
};

let linkSequence = 0;
function newLinkKey(): string {
  linkSequence += 1;
  return `link-${linkSequence}`;
}

function emptyValues(game: Game): TournamentValues {
  return { game, name: '', season: '', organizer: '', startsOn: '', endsOn: '', links: [], internalNotes: '', slug: '' };
}

function valuesFrom(record: AdminTournament): TournamentValues {
  return {
    game: record.game,
    name: record.name,
    season: record.season ?? '',
    organizer: record.organizer ?? '',
    startsOn: record.startsOn ?? '',
    endsOn: record.endsOn ?? '',
    links: record.links.map((link) => ({ key: newLinkKey(), label: link.label, url: link.url })),
    internalNotes: record.internalNotes,
    slug: record.slug,
  };
}

function comparable(values: TournamentValues) {
  return { ...values, links: values.links.map((link) => [link.label, link.url]) };
}

function sameValues(a: TournamentValues, b: TournamentValues) {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

function payload(values: TournamentValues) {
  const optional = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    game: values.game,
    name: values.name.trim(),
    season: optional(values.season),
    organizer: optional(values.organizer),
    startsOn: values.startsOn || null,
    endsOn: values.endsOn || null,
    links: values.links.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
    internalNotes: values.internalNotes,
  };
}

/** Only changed fields are sent, so the audit log lists exactly what was edited. */
function changedFields(values: TournamentValues, baseline: TournamentValues) {
  const next = payload(values);
  const previous = payload(baseline);
  const patch: Partial<ReturnType<typeof payload>> = {};
  for (const key of Object.keys(next) as (keyof typeof next)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(previous[key])) (patch as Record<string, unknown>)[key] = next[key];
  }
  return patch;
}

function validate(values: TournamentValues): FieldErrors {
  const errors: FieldErrors = {};
  if (values.name.trim() === '') errors.name = 'required';
  if (values.startsOn && values.endsOn && values.endsOn < values.startsOn) errors.endsOn = 'ends_before_start';
  values.links.forEach((link, index) => {
    if (link.label.trim() === '') errors[`links.${index}.label`] = 'required';
    if (!isHttpsUrl(link.url.trim())) errors[`links.${index}.url`] = 'https_required';
  });
  return errors;
}

function focusFirstInvalid() {
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    target?.focus();
  });
}

type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title?: string; text: string; conflict?: boolean } | null;

type TournamentEditorProps = {
  uiLocale: UiLocale;
  /** `null` → create a new draft. */
  initial: AdminTournament | null;
  canPublish: boolean;
  /** Games the editor may create tournaments for (the actor's scope). */
  games: readonly Game[];
  created?: boolean;
};

/**
 * Tournament administration: shared facts and links, per-locale description (rules,
 * standings snapshots), publication and the matches linked from the match editor.
 */
export function TournamentEditor({ uiLocale, initial, canPublish, games, created }: TournamentEditorProps) {
  const t = useTranslations('adminCommunity.tournaments.editor');
  const tc = useTranslations('adminCommunity.common');
  const tGame = useTranslations('adminCommunity.common.game');
  const tPublication = useTranslations('adminCommunity.common.publication');
  const fieldError = useFieldError();
  const actionError = useActionError();
  const router = useRouter();

  const [server, setServer] = useState<AdminTournament | null>(initial);
  const [values, setValues] = useState<TournamentValues>(() => (initial ? valuesFrom(initial) : emptyValues(games.includes('hell-let-loose') ? 'hell-let-loose' : (games[0] ?? 'hell-let-loose'))));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(() => (created ? { kind: 'success', text: t('createdNotice') } : null));
  const [pending, setPending] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'unpublish' | 'delete' | null>(null);
  const [descriptionDirty, setDescriptionDirty] = useState({ cs: false, en: false });
  const [leaving, setLeaving] = useState(false);

  const isCreate = server === null;
  const baseline = useMemo(() => (server ? valuesFrom(server) : values), [server]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = isCreate ? !sameValues(values, emptyValues(values.game)) : !sameValues(values, baseline);
  const blockedByDirty = dirty || descriptionDirty.cs || descriptionDirty.en;
  useUnsavedChangesGuard(blockedByDirty && !leaving);
  const busy = pending !== null;
  const set = <K extends keyof TournamentValues>(key: K, value: TournamentValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const err = (...keys: string[]) => fieldError(errorFor(errors, ...keys));
  const onDescriptionDirty = useCallback((locale: UiLocale, value: boolean) => setDescriptionDirty((current) => (current[locale] === value ? current : { ...current, [locale]: value })), []);

  const fail = (failure: Extract<ActionResult<unknown>, { ok: false }>) => {
    setErrors(failure.fieldErrors ?? {});
    if (failure.code === 'conflict') setNotice({ kind: 'warning', title: t('conflictTitle'), text: t('conflictBody'), conflict: true });
    else setNotice({ kind: 'error', text: actionError(failure.code) });
    if (failure.fieldErrors) focusFirstInvalid();
  };

  /** Saved state follows the server; untouched fields also follow a newer version, edits are kept. */
  const applySnapshot = (next: AdminTournament, saved: boolean) => {
    const fresh = valuesFrom(next);
    if (saved) setValues(fresh);
    else {
      const merged = { ...fresh };
      for (const key of Object.keys(fresh) as (keyof TournamentValues)[]) {
        if (JSON.stringify(comparable(values)[key]) !== JSON.stringify(comparable(baseline)[key])) (merged as Record<string, unknown>)[key] = values[key];
      }
      setValues(merged);
    }
    setServer(next);
    setErrors({});
  };

  const runSnapshot = async (name: string, call: () => Promise<ActionResult<AdminTournament>>, saved: boolean, success: string) => {
    setPending(name);
    const outcome = await call();
    setPending(null);
    if (!outcome.ok) {
      fail(outcome);
      return false;
    }
    applySnapshot(outcome.data, saved);
    setNotice({ kind: 'success', text: success });
    return true;
  };

  const save = async () => {
    const clientErrors = validate(values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setNotice({ kind: 'error', text: actionError('validation') });
      focusFirstInvalid();
      return;
    }
    if (isCreate) {
      setPending('save');
      const slug = values.slug.trim();
      const outcome = await createTournamentAction({ ...payload(values), ...(slug ? { slug } : {}) });
      if (!outcome.ok) {
        setPending(null);
        fail(outcome);
        return;
      }
      setLeaving(true);
      router.push(`/admin/tournaments/${outcome.data.id}?created=1`);
      return;
    }
    await runSnapshot('save', () => updateTournamentAction({ id: server.id, expectedVersion: server.version, ...changedFields(values, baseline) }), true, t('savedNotice'));
  };

  const publication = async (publish: boolean) => {
    if (!server) return;
    const call = publish ? publishTournamentAction : unpublishTournamentAction;
    const done = await runSnapshot(publish ? 'publish' : 'unpublish', () => call({ id: server.id, expectedVersion: server.version }), false, publish ? t('publishedNotice') : t('unpublishedNotice'));
    if (done) setDialog(null);
  };

  const remove = async () => {
    if (!server) return;
    setPending('delete');
    const outcome = await deleteTournamentAction({ id: server.id, expectedVersion: server.version });
    if (!outcome.ok) {
      setPending(null);
      setDialog(null);
      fail(outcome);
      return;
    }
    setLeaving(true);
    router.push('/admin/tournaments?deleted=1');
  };

  const reloadLatest = async () => {
    if (!server) return;
    setPending('reload');
    const outcome = await loadTournamentAction({ id: server.id });
    setPending(null);
    if (!outcome.ok) {
      fail(outcome);
      return;
    }
    applySnapshot(outcome.data, false);
    setNotice({ kind: 'info', text: t('reloadedNotice') });
  };

  const descriptionActions = useMemo<ProseActions | null>(
    () =>
      server
        ? {
            save: (locale, expectedVersion, body: JSONContent) => saveTournamentDescriptionAction({ tournamentId: server.id, locale, expectedVersion, body }),
            publish: (locale, expectedVersion) => publishTournamentDescriptionAction({ tournamentId: server.id, locale, expectedVersion }),
            unpublish: (locale, expectedVersion) => unpublishTournamentDescriptionAction({ tournamentId: server.id, locale, expectedVersion }),
          }
        : null,
    // Actions only depend on the tournament identity, not on its version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server?.id],
  );

  const publicHref = server && server.publication === 'published' ? canonicalTournamentPath(server.game, server.slug) : null;
  const statusText = pending === 'save' ? tc('saving') : blockedByDirty ? tc('unsaved') : isCreate ? t('createStatus') : tc('allSaved');

  return (
    <div className={styles.page} data-tournament-editor="" data-mode={isCreate ? 'create' : 'edit'}>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={isCreate ? t('createTitle') : server.name}
        back={{ href: '/admin/tournaments', label: t('backToList') }}
        description={isCreate ? t('createIntro') : undefined}
        actions={
          publicHref ? (
            <GameButton href={publicHref} intent="secondary" size="sm" data-public-link="">
              {t('viewPublic')}
            </GameButton>
          ) : null
        }
      />
      {notice ? (
        <FeedbackNotice
          kind={notice.kind}
          title={notice.title}
          action={
            notice.conflict ? (
              <GameButton size="sm" intent="secondary" onClick={reloadLatest} pending={pending === 'reload'}>
                {t('reloadLatest')}
              </GameButton>
            ) : undefined
          }
        >
          {notice.text}
        </FeedbackNotice>
      ) : null}

      <div className={styles.editor}>
        <div className={styles.editorMain}>
          <fieldset className={styles.group} data-group="identity">
            <legend>{t('groups.identity')}</legend>
            <div className={styles.groupBody}>
              <div className={styles.grid}>
                <Select
                  name="game"
                  label={t('fields.game')}
                  required
                  hint={!isCreate && server.matches.length > 0 ? t('hints.gameLocked') : undefined}
                  value={values.game}
                  disabled={!isCreate && server.matches.length > 0}
                  onChange={(event) => set('game', event.target.value as Game)}
                  options={GAMES.filter((game) => games.includes(game) || game === values.game).map((game) => ({ value: game, label: tGame(game) }))}
                  error={err('game')}
                />
                <TextField name="name" label={t('fields.name')} required hint={t('hints.name')} value={values.name} maxLength={160} autoComplete="off" onChange={(event) => set('name', event.target.value)} error={err('name')} />
                <TextField name="season" label={t('fields.season')} markOptional value={values.season} maxLength={60} onChange={(event) => set('season', event.target.value)} error={err('season')} />
                <TextField name="organizer" label={t('fields.organizer')} markOptional value={values.organizer} maxLength={120} onChange={(event) => set('organizer', event.target.value)} error={err('organizer')} />
                <TextField name="startsOn" type="date" label={t('fields.startsOn')} markOptional value={values.startsOn} onChange={(event) => set('startsOn', event.target.value)} error={err('startsOn')} />
                <TextField name="endsOn" type="date" label={t('fields.endsOn')} markOptional value={values.endsOn} onChange={(event) => set('endsOn', event.target.value)} error={err('endsOn')} />
                {isCreate ? (
                  <TextField name="slug" label={t('fields.slug')} markOptional hint={t('hints.slug')} value={values.slug} maxLength={120} autoComplete="off" onChange={(event) => set('slug', event.target.value)} error={err('slug')} />
                ) : (
                  <div className={styles.fieldBlock}>
                    <p className={styles.mediaLabel}>{t('fields.publicAddress')}</p>
                    <p className={`${styles.mediaMeta} ${styles.code}`} data-public-path="">
                      /{uiLocale}
                      {canonicalTournamentPath(server.game, server.slug)}
                    </p>
                  </div>
                )}
              </div>
              <h3 className={styles.repeatHeading}>{t('linksTitle')}</h3>
              <p className={styles.groupIntro}>{t('linksIntro', { max: MAX_TOURNAMENT_LINK_ROWS })}</p>
              <ul className={styles.repeatList} hidden={values.links.length === 0}>
                {values.links.map((link, index) => (
                  <li key={link.key} className={styles.repeatItem}>
                    <fieldset>
                      <legend className={styles.repeatHeading}>{t('linkItem', { number: index + 1 })}</legend>
                      <div className={styles.grid}>
                        <TextField
                          name={`link-${link.key}-label`}
                          label={t('fields.linkLabel')}
                          required
                          value={link.label}
                          maxLength={80}
                          onChange={(event) => set('links', values.links.map((item) => (item.key === link.key ? { ...item, label: event.target.value } : item)))}
                          error={err(`links.${index}.label`)}
                        />
                        <TextField
                          name={`link-${link.key}-url`}
                          type="url"
                          label={t('fields.linkUrl')}
                          required
                          hint={t('hints.httpsOnly')}
                          value={link.url}
                          maxLength={2048}
                          onChange={(event) => set('links', values.links.map((item) => (item.key === link.key ? { ...item, url: event.target.value } : item)))}
                          error={err(`links.${index}.url`)}
                        />
                      </div>
                      <div className={styles.repeatButtons}>
                        <GameButton size="sm" intent="danger" onClick={() => set('links', values.links.filter((item) => item.key !== link.key))} aria-label={t('linkRemove', { number: index + 1 })}>
                          {t('removeShort')}
                        </GameButton>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ul>
              <div className={styles.inlineActions}>
                <GameButton size="sm" intent="secondary" disabled={values.links.length >= MAX_TOURNAMENT_LINK_ROWS} onClick={() => set('links', [...values.links, { key: newLinkKey(), label: '', url: '' }])} data-action="add-link">
                  + {t('linkAdd')}
                </GameButton>
                {err('links') ? <span className={styles.errorText}>{err('links')}</span> : null}
              </div>
            </div>
          </fieldset>

          <fieldset className={styles.group} data-group="description">
            <legend>{t('groups.description')}</legend>
            <div className={styles.groupBody}>
              <p className={styles.groupIntro}>{t('descriptionIntro')}</p>
              {server && descriptionActions ? (
                <ProseTabs
                  kind="description"
                  uiLocale={uiLocale}
                  details={server.descriptionDetail}
                  canPublish={canPublish}
                  mediaScope="match"
                  actions={descriptionActions}
                  onDirtyChange={onDescriptionDirty}
                  ownerNotPublicNote={server.publication === 'published' ? null : t('descriptionPrivateUntilPublished')}
                />
              ) : (
                <p className={styles.groupIntro}>{t('descriptionAfterCreate')}</p>
              )}
            </div>
          </fieldset>

          {server ? (
            <fieldset className={styles.group} data-group="matches">
              <legend>{t('groups.matches')}</legend>
              <div className={styles.groupBody}>
                <p className={styles.groupIntro}>{t('matchesIntro')}</p>
                {server.matches.length === 0 ? (
                  <p className={styles.actionNote}>{t('noMatches')}</p>
                ) : (
                  <ul className={styles.itemList} data-tournament-matches="">
                    {server.matches.map((item) => (
                      <li key={item.id}>
                        <Link href={`/admin/matches/${item.id}`} className={styles.textLink} data-tournament-match={item.slug}>
                          {item.opponentName}
                        </Link>{' '}
                        <span className={styles.cellMuted}>
                          {formatDate(item.startsAt, uiLocale, 'dateTimeZone', item.timeZone)} · {tPublication(item.publication)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </fieldset>
          ) : null}

          <fieldset className={`${styles.group} ${styles.private}`} data-group="private">
            <legend>
              {t('groups.private')}
              <span className={styles.privateTag}>
                <ShieldIcon size={16} /> {t('privateTag')}
              </span>
            </legend>
            <div className={styles.groupBody}>
              <TextArea name="internalNotes" label={t('fields.internalNotes')} markOptional hint={t('hints.internalNotes')} value={values.internalNotes} maxLength={5000} rows={4} onChange={(event) => set('internalNotes', event.target.value)} error={err('internalNotes')} />
            </div>
          </fieldset>

          <FormActions status={statusText}>
            {dirty && !isCreate ? (
              <GameButton intent="ghost" onClick={() => setValues(baseline)} disabled={busy}>
                {tc('discard')}
              </GameButton>
            ) : null}
            <GameButton intent="primary" onClick={save} disabled={busy || (!isCreate && !dirty)} pending={pending === 'save'} pendingLabel={tc('saving')} data-action="save">
              {isCreate ? t('actions.createDraft') : t('actions.save')}
            </GameButton>
          </FormActions>
        </div>

        <aside className={styles.editorAside} aria-label={t('statusPanel')}>
          <section className={styles.panel} data-status-panel="">
            <h2 className={styles.panelTitle}>{t('statusPanel')}</h2>
            {server ? (
              <>
                <div className={styles.badges}>
                  <StatusBadge kind={PUBLICATION_KIND[server.publication]}>
                    <span data-tournament-publication={server.publication}>{tPublication(server.publication)}</span>
                  </StatusBadge>
                </div>
                <p className={styles.actionNote}>{t('statusExplainer')}</p>
                <dl className={styles.facts}>
                  <div>
                    <dt>{t('linkedMatches')}</dt>
                    <dd>{server.matches.length}</dd>
                  </div>
                  <div>
                    <dt>{t('updatedAt')}</dt>
                    <dd>{formatDate(server.updatedAt, uiLocale, 'dateTimeZone')}</dd>
                  </div>
                </dl>
                <div className={styles.actionStack}>
                  {canPublish ? (
                    server.publication === 'draft' ? (
                      <GameButton intent="primary" fullWidth onClick={() => publication(true)} disabled={busy || blockedByDirty} pending={pending === 'publish'} pendingLabel={tc('working')} data-action="publish">
                        {t('actions.publish')}
                      </GameButton>
                    ) : (
                      <GameButton intent="secondary" fullWidth onClick={() => setDialog('unpublish')} disabled={busy || blockedByDirty} data-action="unpublish">
                        {t('actions.unpublish')}
                      </GameButton>
                    )
                  ) : null}
                  {server.publication === 'draft' ? (
                    <GameButton intent="danger" fullWidth onClick={() => setDialog('delete')} disabled={busy || blockedByDirty} data-action="delete">
                      {t('actions.delete')}
                    </GameButton>
                  ) : null}
                </div>
                {blockedByDirty ? <p className={styles.actionNote}>{tc('dirtyBlocked')}</p> : null}
                {!canPublish ? <p className={styles.actionNote}>{t('noPublishPermission')}</p> : null}
              </>
            ) : (
              <p className={styles.actionNote}>{t('createAside')}</p>
            )}
          </section>
        </aside>
      </div>

      {server ? (
        <>
          <ConfirmDialog
            open={dialog === 'unpublish'}
            title={t('dialogs.unpublishTitle')}
            description={t('dialogs.unpublishBody')}
            confirmLabel={t('actions.unpublish')}
            pending={pending === 'unpublish'}
            onConfirm={() => publication(false)}
            onClose={() => setDialog(null)}
            testId="confirm-unpublish"
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            title={t('dialogs.deleteTitle')}
            description={t('dialogs.deleteBody', { name: server.name })}
            confirmLabel={t('actions.delete')}
            intent="danger"
            pending={pending === 'delete'}
            onConfirm={remove}
            onClose={() => setDialog(null)}
            testId="confirm-delete"
          />
        </>
      ) : null}
    </div>
  );
}
