'use client';

import type { JSONContent } from '@tiptap/core';
import { GAMES, PUBLIC_ROLE_KEYS, type Game, type PublicRoleKey } from '@valkyria/db/schema';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import { Checkbox, FieldError, FormActions, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice, PageHeader, StatusBadge } from '@/components/ui/panels';
import { Link, useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/result';
import {
  confirmMemberConsentAction,
  createMemberAction,
  hideMemberAction,
  loadMemberAction,
  publishMemberAction,
  publishMemberBioAction,
  saveMemberBioAction,
  unpublishMemberBioAction,
  updateMemberAction,
  withdrawMemberConsentAction,
  type AdminMemberView,
} from '@/modules/members/actions';
import { ConfirmDialog } from './confirm-dialog';
import { errorFor, type FieldErrors } from './errors';
import { formatDate } from './format';
import { MediaField, type MediaRef } from './media-field';
import { ProseTabs, type ProseActions, STATUS_KIND } from './prose-tabs';
import { PROFILE_STATE_KIND } from './status';
import { useActionError, useFieldError } from './use-messages';
import styles from './admin-community.module.css';

type UiLocale = 'cs' | 'en';

type MemberValues = {
  displayName: string;
  slug: string;
  sortOrder: string;
  games: Game[];
  roles: PublicRoleKey[];
  avatar: MediaRef | null;
};

type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title?: string; text: string; conflict?: boolean } | null;
type Dialog = 'hide' | 'withdraw' | null;

function valuesFrom(member: AdminMemberView | null): MemberValues {
  if (!member) return { displayName: '', slug: '', sortOrder: '100', games: [], roles: [], avatar: null };
  return {
    displayName: member.displayName,
    slug: member.slug,
    sortOrder: String(member.sortOrder),
    games: [...member.games],
    roles: [...member.publicRoleKeys],
    avatar: member.avatarAssetId ? { assetId: member.avatarAssetId, filename: null } : null,
  };
}

const sameList = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((item) => b.includes(item));

function valuesEqual(a: MemberValues, b: MemberValues) {
  return (
    a.displayName === b.displayName &&
    a.slug === b.slug &&
    a.sortOrder === b.sortOrder &&
    sameList(a.games, b.games) &&
    sameList(a.roles, b.roles) &&
    (a.avatar?.assetId.toLowerCase() ?? null) === (b.avatar?.assetId.toLowerCase() ?? null)
  );
}

/** Three-way merge: fields still equal to the old base take the fresh server value. */
function mergeValues(user: MemberValues, oldBase: MemberValues, fresh: MemberValues): MemberValues {
  const media = (value: MediaRef | null) => value?.assetId.toLowerCase() ?? null;
  return {
    displayName: user.displayName !== oldBase.displayName ? user.displayName : fresh.displayName,
    slug: user.slug !== oldBase.slug ? user.slug : fresh.slug,
    sortOrder: user.sortOrder !== oldBase.sortOrder ? user.sortOrder : fresh.sortOrder,
    games: sameList(user.games, oldBase.games) ? fresh.games : user.games,
    roles: sameList(user.roles, oldBase.roles) ? fresh.roles : user.roles,
    avatar: media(user.avatar) !== media(oldBase.avatar) ? user.avatar : fresh.avatar,
  };
}

function ordered<T extends string>(all: readonly T[], selected: T[]): T[] {
  return all.filter((item) => selected.includes(item));
}

/**
 * Member publication editor: edits only the public projection (approved display name kept
 * byte-for-byte, slug, games, curated role keys, avatar, order), records explicit consent,
 * publishes/hides, and manages per-locale biographies. Shows exactly what becomes public;
 * Discord identifiers, e-mail and guild roles are never displayed or editable here.
 */
export function MemberEditor({ uiLocale, initial, canPublish, created }: { uiLocale: UiLocale; initial: AdminMemberView | null; canPublish: boolean; created?: boolean }) {
  const t = useTranslations('adminCommunity.members.editor');
  const tc = useTranslations('adminCommunity.common');
  const tGame = useTranslations('adminCommunity.common.game');
  const tRole = useTranslations('adminCommunity.common.roles');
  const tState = useTranslations('adminCommunity.common.profileState');
  const tProse = useTranslations('adminCommunity.common.proseStatus');
  const fieldError = useFieldError();
  const actionError = useActionError();
  const router = useRouter();

  const [server, setServer] = useState<AdminMemberView | null>(initial);
  const [values, setValues] = useState<MemberValues>(() => valuesFrom(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(() => (created ? { kind: 'success', text: t('createdNotice') } : null));
  const [pending, setPending] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [bioDirty, setBioDirty] = useState({ cs: false, en: false });
  const [leaving, setLeaving] = useState(false);

  const isCreate = server === null;
  const baseline = useMemo(() => valuesFrom(server), [server]);
  const dirty = !valuesEqual(values, baseline);
  const anyDirty = dirty || bioDirty.cs || bioDirty.en;
  useUnsavedChangesGuard(anyDirty && !leaving);
  const onBioDirty = useCallback((locale: UiLocale, value: boolean) => setBioDirty((current) => (current[locale] === value ? current : { ...current, [locale]: value })), []);

  const fail = (failure: Extract<ActionResult<unknown>, { ok: false }>) => {
    setErrors(failure.fieldErrors ?? {});
    if (failure.code === 'conflict') setNotice({ kind: 'warning', title: t('conflictTitle'), text: t('conflictBody'), conflict: true });
    else setNotice({ kind: 'error', text: failure.fieldErrors?.consent ? fieldError(failure.fieldErrors.consent)! : actionError(failure.code) });
  };

  const apply = (next: AdminMemberView, resetForm: boolean) => {
    setServer(next);
    const fresh = valuesFrom(next);
    const freshWithMedia = { ...fresh, avatar: fresh.avatar && values.avatar && fresh.avatar.assetId === values.avatar.assetId ? values.avatar : fresh.avatar };
    // Untouched fields follow the newer server version; edited fields keep the user's value.
    setValues(resetForm ? freshWithMedia : mergeValues(values, baseline, freshWithMedia));
    setErrors({});
  };

  const run = async (name: string, call: () => Promise<ActionResult<AdminMemberView>>, success: string, resetForm = false) => {
    setPending(name);
    const outcome = await call();
    setPending(null);
    if (!outcome.ok) {
      fail(outcome);
      return false;
    }
    apply(outcome.data, resetForm);
    setNotice({ kind: 'success', text: success });
    return true;
  };

  const validate = (): FieldErrors => {
    const result: FieldErrors = {};
    if (values.displayName.trim() === '') result.displayName = 'required';
    if (!/^\d{1,5}$/.test(values.sortOrder.trim())) result.sortOrder = 'invalid_number';
    return result;
  };

  const payload = () => ({
    displayName: values.displayName,
    games: ordered(GAMES, values.games),
    publicRoleKeys: ordered(PUBLIC_ROLE_KEYS, values.roles),
    avatarAssetId: values.avatar?.assetId ?? null,
    sortOrder: Number(values.sortOrder.trim()),
  });

  const save = async () => {
    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setNotice({ kind: 'error', text: actionError('validation') });
      return;
    }
    if (isCreate) {
      setPending('save');
      const slug = values.slug.trim();
      const outcome = await createMemberAction({ ...payload(), ...(slug ? { slug } : {}) });
      if (!outcome.ok) {
        setPending(null);
        fail(outcome);
        return;
      }
      setLeaving(true);
      router.push(`/admin/members/${outcome.data.id}?created=1`);
      return;
    }
    const next = payload();
    const previous = { displayName: baseline.displayName, games: ordered(GAMES, baseline.games), publicRoleKeys: ordered(PUBLIC_ROLE_KEYS, baseline.roles), avatarAssetId: baseline.avatar?.assetId ?? null, sortOrder: Number(baseline.sortOrder) };
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (JSON.stringify(next[key]) !== JSON.stringify(previous[key])) patch[key] = next[key];
    if (values.slug.trim() !== baseline.slug) patch.slug = values.slug.trim();
    await run('save', () => updateMemberAction({ id: server.id, expectedVersion: server.version, ...patch }), t('savedNotice'), true);
  };

  const target = () => ({ id: server!.id, expectedVersion: server!.version });

  const reloadLatest = async () => {
    if (!server) return;
    setPending('reload');
    const outcome = await loadMemberAction({ id: server.id });
    setPending(null);
    if (!outcome.ok) return fail(outcome);
    apply(outcome.data, false);
    setNotice({ kind: 'info', text: t('reloadedNotice') });
  };

  const bioActions = useMemo<ProseActions | null>(
    () =>
      server
        ? {
            save: (locale, expectedVersion, body: JSONContent) => saveMemberBioAction({ memberId: server.id, locale, expectedVersion, body }),
            publish: (locale, expectedVersion) => publishMemberBioAction({ memberId: server.id, locale, expectedVersion }),
            unpublish: (locale, expectedVersion) => unpublishMemberBioAction({ memberId: server.id, locale, expectedVersion }),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server?.id],
  );

  const busy = pending !== null;
  const err = (...keys: string[]) => fieldError(errorFor(errors, ...keys));
  const toggle = <T extends string>(list: T[], item: T, on: boolean) => (on ? [...new Set([...list, item])] : list.filter((value) => value !== item));
  const consented = Boolean(server?.consentConfirmedAt);
  const isPublic = server?.state === 'published' && consented;
  const publicPath = `/members/${server?.slug ?? (values.slug.trim() || '…')}`;

  return (
    <div className={styles.page} data-member-editor="" data-mode={isCreate ? 'create' : 'edit'}>
      <PageHeader eyebrow={t('eyebrow')} title={isCreate ? t('createTitle') : server.displayName} back={{ href: '/admin/members', label: t('backToList') }} description={isCreate ? t('createIntro') : undefined} />
      {notice ? (
        <FeedbackNotice
          kind={notice.kind}
          title={notice.title}
          action={
            notice.conflict ? (
              <div className={styles.inlineActionsTight}>
                <GameButton size="sm" intent="secondary" onClick={reloadLatest} pending={pending === 'reload'}>
                  {t('reloadLatest')}
                </GameButton>
                <GameButton size="sm" intent="ghost" onClick={() => setValues(baseline)} disabled={busy}>
                  {t('discardMine')}
                </GameButton>
              </div>
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
                <TextField
                  name="displayName"
                  label={t('fields.displayName')}
                  required
                  hint={t('hints.displayName')}
                  value={values.displayName}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setValues({ ...values, displayName: event.target.value })}
                  error={err('displayName')}
                />
                <TextField
                  name="slug"
                  label={t('fields.slug')}
                  markOptional={isCreate}
                  required={!isCreate}
                  hint={isCreate ? t('hints.slugCreate') : t('hints.slugEdit')}
                  value={values.slug}
                  maxLength={80}
                  autoComplete="off"
                  onChange={(event) => setValues({ ...values, slug: event.target.value })}
                  error={err('slug')}
                />
                <TextField name="sortOrder" label={t('fields.sortOrder')} inputMode="numeric" hint={t('hints.sortOrder')} value={values.sortOrder} onChange={(event) => setValues({ ...values, sortOrder: event.target.value })} error={err('sortOrder')} />
              </div>
              <MediaField label={t('fields.avatar')} hint={t('hints.avatar')} scope="editorial" locale={uiLocale} value={values.avatar} onChange={(avatar) => setValues({ ...values, avatar })} error={err('avatarAssetId')} testId="member-avatar" />
            </div>
          </fieldset>

          <fieldset className={styles.group} data-group="labels">
            <legend>{t('groups.labels')}</legend>
            <div className={styles.groupBody}>
              <div className={styles.grid}>
                <fieldset className={styles.roundFieldset} aria-describedby="member-games-error">
                  <legend className={styles.repeatHeading}>{t('fields.games')}</legend>
                  <div className={styles.checkGrid}>
                    {GAMES.map((game) => (
                      <Checkbox key={game} name={`game-${game}`} label={tGame(game)} checked={values.games.includes(game)} onChange={(event) => setValues({ ...values, games: toggle(values.games, game, event.target.checked) })} />
                    ))}
                  </div>
                  <FieldError id="member-games-error">{err('games')}</FieldError>
                </fieldset>
                <fieldset className={styles.roundFieldset} aria-describedby="member-roles-hint member-roles-error">
                  <legend className={styles.repeatHeading}>{t('fields.roles')}</legend>
                  <p id="member-roles-hint" className={styles.actionNote}>
                    {t('hints.roles')}
                  </p>
                  <div className={styles.checkGrid}>
                    {PUBLIC_ROLE_KEYS.map((role) => (
                      <Checkbox key={role} name={`role-${role}`} label={tRole(role)} checked={values.roles.includes(role)} onChange={(event) => setValues({ ...values, roles: toggle(values.roles, role, event.target.checked) })} />
                    ))}
                  </div>
                  <FieldError id="member-roles-error">{err('publicRoleKeys')}</FieldError>
                </fieldset>
              </div>
            </div>
          </fieldset>

          {server && bioActions ? (
            <fieldset className={styles.group} data-group="biography">
              <legend>{t('groups.biography')}</legend>
              <div className={styles.groupBody}>
                <ProseTabs
                  kind="biography"
                  uiLocale={uiLocale}
                  details={server.biographyDetail}
                  canPublish={canPublish}
                  mediaScope="editorial"
                  actions={bioActions}
                  onDirtyChange={onBioDirty}
                  ownerNotPublicNote={isPublic ? null : t('bioPrivateUntilPublic')}
                />
              </div>
            </fieldset>
          ) : (
            <p className={styles.actionNote}>{t('bioAfterCreate')}</p>
          )}

          <FormActions status={pending === 'save' ? tc('saving') : anyDirty ? tc('unsaved') : isCreate ? t('createStatus') : tc('allSaved')}>
            {dirty ? (
              <GameButton intent="ghost" onClick={() => setValues(baseline)} disabled={busy}>
                {tc('discard')}
              </GameButton>
            ) : null}
            <GameButton intent="primary" onClick={save} disabled={busy || (!isCreate && !dirty)} pending={pending === 'save'} pendingLabel={tc('saving')} data-action="save">
              {isCreate ? t('actions.create') : t('actions.save')}
            </GameButton>
          </FormActions>
        </div>

        <aside className={styles.editorAside} aria-label={t('publicationPanel')}>
          {server ? (
            <section className={styles.panel} data-publication-panel="">
              <h2 className={styles.panelTitle}>{t('publicationPanel')}</h2>
              <div className={styles.badges}>
                <StatusBadge kind={PROFILE_STATE_KIND[server.state]}>
                  <span data-member-state={server.state}>{tState(server.state)}</span>
                </StatusBadge>
                <StatusBadge kind={consented ? 'success' : 'warning'}>
                  <span data-member-consent={consented ? 'yes' : 'no'}>{consented ? t('consentRecorded') : t('consentMissing')}</span>
                </StatusBadge>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>{t('consentLabel')}</dt>
                  <dd>{server.consentConfirmedAt ? t('consentSince', { date: formatDate(server.consentConfirmedAt, uiLocale, 'dateTimeZone') }) : t('consentNone')}</dd>
                </div>
                <div>
                  <dt>{t('publicPage')}</dt>
                  <dd>
                    {isPublic ? (
                      <Link href={`/members/${server.slug}`} data-public-link="">
                        /{uiLocale}/members/{server.slug}
                      </Link>
                    ) : (
                      t('notPublic')
                    )}
                  </dd>
                </div>
              </dl>
              {!consented ? (
                <div className={styles.stack} data-consent-form="">
                  <Checkbox name="consent" label={t('consentCheckbox', { name: server.displayName })} checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} error={err('confirmed')} />
                  <GameButton
                    intent="secondary"
                    fullWidth
                    disabled={!consentChecked || busy || dirty}
                    pending={pending === 'consent'}
                    pendingLabel={tc('working')}
                    onClick={async () => {
                      if (await run('consent', () => confirmMemberConsentAction({ ...target(), confirmed: consentChecked }), t('consentSavedNotice'))) setConsentChecked(false);
                    }}
                    data-action="confirm-consent"
                  >
                    {t('actions.recordConsent')}
                  </GameButton>
                </div>
              ) : null}
              <div className={styles.actionStack}>
                {canPublish && server.state !== 'published' ? (
                  <GameButton intent="primary" fullWidth onClick={() => run('publish', () => publishMemberAction(target()), t('publishedNotice'))} disabled={busy || anyDirty} pending={pending === 'publish'} pendingLabel={tc('working')} data-action="publish">
                    {t('actions.publish')}
                  </GameButton>
                ) : null}
                {canPublish && server.state === 'published' ? (
                  <GameButton intent="secondary" fullWidth onClick={() => setDialog('hide')} disabled={busy || anyDirty} data-action="hide">
                    {t('actions.hide')}
                  </GameButton>
                ) : null}
                {consented ? (
                  <GameButton intent="danger" fullWidth onClick={() => setDialog('withdraw')} disabled={busy || anyDirty} data-action="withdraw-consent">
                    {t('actions.withdrawConsent')}
                  </GameButton>
                ) : null}
              </div>
              {!consented && canPublish ? <p className={styles.actionNote}>{t('publishNeedsConsent')}</p> : null}
              {anyDirty ? <p className={styles.actionNote}>{tc('dirtyBlocked')}</p> : null}
              {!canPublish ? <p className={styles.actionNote}>{t('noPublishPermission')}</p> : null}
            </section>
          ) : (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>{t('publicationPanel')}</h2>
              <p className={styles.actionNote}>{t('createAside')}</p>
            </section>
          )}

          <section className={styles.panel} data-public-preview="" aria-labelledby="member-preview-title">
            <h2 id="member-preview-title" className={styles.panelTitle}>
              {t('previewTitle')}
            </h2>
            <p className={styles.actionNote}>{isPublic ? t('previewLive') : t('previewPrivate')}</p>
            <div className={styles.previewCard}>
              {values.avatar ? (
                // Private admin thumbnail; decorative next to the name.
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.previewAvatar} src={`/api/media/${values.avatar.assetId}/thumb`} alt="" width={72} height={72} />
              ) : (
                <span className={styles.previewAvatar} aria-hidden="true" />
              )}
              <div className={styles.cellStack}>
                <p className={styles.previewName} data-preview-name="">
                  {values.displayName || t('previewNoName')}
                </p>
                <p className={`${styles.cellMuted} ${styles.code}`}>
                  /{uiLocale}
                  {publicPath}
                </p>
              </div>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>{t('fields.games')}</dt>
                <dd>{values.games.length ? ordered(GAMES, values.games).map((game) => tGame(game)).join(', ') : '—'}</dd>
              </div>
              <div>
                <dt>{t('fields.roles')}</dt>
                <dd>{values.roles.length ? ordered(PUBLIC_ROLE_KEYS, values.roles).map((role) => tRole(role)).join(', ') : '—'}</dd>
              </div>
              {server ? (
                <div>
                  <dt>{t('previewBiography')}</dt>
                  <dd>
                    <span className={styles.miniStates}>
                      {(['cs', 'en'] as const).map((locale) => (
                        <StatusBadge key={locale} kind={STATUS_KIND[server.biographyDetail[locale].status]} icon={false}>
                          {locale.toUpperCase()} · {tProse(server.biographyDetail[locale].status)}
                        </StatusBadge>
                      ))}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className={styles.actionNote}>{t('previewNeverPublic')}</p>
          </section>
        </aside>
      </div>

      {server ? (
        <>
          <ConfirmDialog
            open={dialog === 'hide'}
            title={t('dialogs.hideTitle')}
            description={t('dialogs.hideBody')}
            confirmLabel={t('actions.hide')}
            pending={pending === 'hide'}
            onConfirm={async () => {
              if (await run('hide', () => hideMemberAction(target()), t('hiddenNotice'))) setDialog(null);
            }}
            onClose={() => setDialog(null)}
            testId="confirm-hide"
          />
          <ConfirmDialog
            open={dialog === 'withdraw'}
            title={t('dialogs.withdrawTitle')}
            description={t('dialogs.withdrawBody')}
            confirmLabel={t('actions.withdrawConsent')}
            intent="danger"
            pending={pending === 'withdraw'}
            onConfirm={async () => {
              if (await run('withdraw', () => withdrawMemberConsentAction(target()), t('withdrawnNotice'))) setDialog(null);
            }}
            onClose={() => setDialog(null)}
            testId="confirm-withdraw"
          />
        </>
      ) : null}
    </div>
  );
}
