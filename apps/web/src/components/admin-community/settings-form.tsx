'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import type { z } from 'zod';
import { useUnsavedChangesGuard } from '@/components/shell/unsaved-changes';
import type { BackgroundSource } from '@/components/shell/background-policy';
import { FormActions, RadioGroup, Select, TextArea, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { FeedbackNotice } from '@/components/ui/panels';
import type { ActionResult } from '@/lib/result';
import { loadSettingsAction, saveSettingsAction, type SettingChange } from '@/modules/settings/actions';
import {
  backgroundMediaSchema,
  COMMUNITY_LINK_KINDS,
  communityLinksSchema,
  discordInviteUrlSchema,
  MAX_COMMUNITY_LINKS,
  type BackgroundMedia,
  type CommunityLink,
  type CommunityLinkKind,
  type SettingKey,
} from '@/modules/settings/schemas';
import type { AdminSetting } from '@/modules/settings/service';
import { BackgroundPreview } from './background-preview';
import { errorFor, type FieldErrors } from './errors';
import { formatDate } from './format';
import { useActionError, useFieldError } from './use-messages';
import styles from './admin-community.module.css';

export type SettingsDefaults = {
  discordInviteUrl: string | null;
  background: { posterUrl: string | null; mp4Url: string | null; webmUrl: string | null };
};

type LinkValues = { key: string; kind: CommunityLinkKind; label: string; url: string };
type BackgroundValues = { mode: 'default' | 'custom'; posterUrl: string; mp4Url: string; webmUrl: string; focalX: string; focalY: string; provenance: string };
type Values = { discordInviteUrl: string; links: LinkValues[]; background: BackgroundValues };
type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title?: string; text: string; conflict?: boolean } | null;

const DISCORD: SettingKey = 'community.discordInviteUrl';
const LINKS: SettingKey = 'community.links';
const BACKGROUND: SettingKey = 'background.media';

let linkSequence = 0;
const linkKey = () => `link-${(linkSequence += 1)}`;

function setting(settings: AdminSetting[], key: SettingKey): AdminSetting {
  return settings.find((item) => item.key === key) ?? { key, value: null, version: 0, updatedAt: null, invalid: false };
}

function valuesFrom(settings: AdminSetting[]): Values {
  const discord = setting(settings, DISCORD).value as string | null;
  const links = (setting(settings, LINKS).value as CommunityLink[] | null) ?? [];
  const background = setting(settings, BACKGROUND).value as BackgroundMedia | null;
  return {
    discordInviteUrl: discord ?? '',
    links: links.map((link) => ({ key: linkKey(), kind: link.kind, label: link.label, url: link.url })),
    background: background
      ? {
          mode: 'custom',
          posterUrl: background.posterUrl ?? '',
          mp4Url: background.mp4Url ?? '',
          webmUrl: background.webmUrl ?? '',
          focalX: String(background.focalX),
          focalY: String(background.focalY),
          provenance: background.provenance,
        }
      : { mode: 'default', posterUrl: '', mp4Url: '', webmUrl: '', focalX: '50', focalY: '50', provenance: '' },
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());
const focal = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));

/** Values as the setting payloads that would be stored (`null` = no override). */
function payloads(values: Values): Record<SettingKey, unknown> {
  const bg = values.background;
  return {
    [DISCORD]: orNull(values.discordInviteUrl),
    [LINKS]: values.links.length > 0 ? values.links.map((link) => ({ kind: link.kind, label: link.label.trim(), url: link.url.trim() })) : null,
    [BACKGROUND]:
      bg.mode === 'default'
        ? null
        : { posterUrl: orNull(bg.posterUrl), mp4Url: orNull(bg.mp4Url), webmUrl: orNull(bg.webmUrl), focalX: focal(bg.focalX), focalY: focal(bg.focalY), provenance: bg.provenance.trim() },
  } as Record<SettingKey, unknown>;
}

function issuesToErrors(key: string, error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const path = [key, ...issue.path.map(String)].join('.');
    if (!(path in result)) result[path] = /^[a-z][a-z_]*$/.test(issue.message) ? issue.message : issue.code;
  }
  return result;
}

function validate(values: Values, allowedOrigins: string[]): FieldErrors {
  const next = payloads(values);
  const errors: FieldErrors = {};
  if (next[DISCORD] !== null) {
    const parsed = discordInviteUrlSchema.safeParse(next[DISCORD]);
    if (!parsed.success) Object.assign(errors, issuesToErrors(DISCORD, parsed.error));
  }
  if (next[LINKS] !== null) {
    const parsed = communityLinksSchema.safeParse(next[LINKS]);
    if (!parsed.success) Object.assign(errors, issuesToErrors(LINKS, parsed.error));
  }
  if (next[BACKGROUND] !== null) {
    const bg = next[BACKGROUND] as { focalX: number; focalY: number };
    if (Number.isNaN(bg.focalX)) errors[`${BACKGROUND}.focalX`] = 'invalid_number';
    if (Number.isNaN(bg.focalY)) errors[`${BACKGROUND}.focalY`] = 'invalid_number';
    const parsed = backgroundMediaSchema(allowedOrigins).safeParse(next[BACKGROUND]);
    if (!parsed.success) {
      for (const [path, code] of Object.entries(issuesToErrors(BACKGROUND, parsed.error))) if (!(path in errors)) errors[path] = code;
    }
  }
  return errors;
}

function sourcesOf(media: { mp4Url: string | null; webmUrl: string | null }): BackgroundSource[] {
  const list: BackgroundSource[] = [];
  if (media.webmUrl) list.push({ src: media.webmUrl, type: 'video/webm' });
  if (media.mp4Url) list.push({ src: media.mp4Url, type: 'video/mp4' });
  return list;
}

type SettingsFormProps = {
  uiLocale: 'cs' | 'en';
  initial: AdminSetting[];
  defaults: SettingsDefaults;
  allowedOrigins: string[];
  /** Server-rendered original fallback scene for the preview frame. */
  fallbackScene: ReactNode;
};

/**
 * Site settings for administrators/owners: public community links and background media.
 * Live values are shown next to proposed ones; "Save settings" validates everything,
 * then writes all changed keys atomically (they go live immediately). Conflicts and
 * failures keep the entered values. Only allowlisted keys exist here (no `system.*`).
 */
export function SettingsForm({ uiLocale, initial, defaults, allowedOrigins, fallbackScene }: SettingsFormProps) {
  const t = useTranslations('adminCommunity.settings');
  const tc = useTranslations('adminCommunity.common');
  const fieldError = useFieldError();
  const actionError = useActionError();
  const [stored, setStored] = useState<AdminSetting[]>(initial);
  const [values, setValues] = useState<Values>(() => valuesFrom(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<'save' | 'reload' | null>(null);

  const baseline = useMemo(() => valuesFrom(stored), [stored]);
  const baselinePayloads = useMemo(() => payloads(baseline), [baseline]);
  const current = payloads(values);
  const changedKeys = ([DISCORD, LINKS, BACKGROUND] as SettingKey[]).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(baselinePayloads[key]));
  const dirty = changedKeys.length > 0;
  useUnsavedChangesGuard(dirty);

  const liveErrors = useMemo(() => validate(values, allowedOrigins), [values, allowedOrigins]);
  const backgroundValid = !Object.keys(liveErrors).some((key) => key.startsWith(`${BACKGROUND}.`));
  const err = (...keys: string[]) => fieldError(errorFor(errors, ...keys));

  const storedDiscord = setting(stored, DISCORD);
  const storedLinks = setting(stored, LINKS);
  const storedBackground = setting(stored, BACKGROUND);
  const liveDiscord = (storedDiscord.value as string | null) ?? defaults.discordInviteUrl;
  const liveLinks = (storedLinks.value as CommunityLink[] | null) ?? [];
  const liveBackground = (storedBackground.value as BackgroundMedia | null) ?? { ...defaults.background, focalX: 50, focalY: 50, provenance: '' };

  const bg = values.background;
  const proposedMedia =
    bg.mode === 'default'
      ? { posterUrl: defaults.background.posterUrl, sources: sourcesOf(defaults.background), focal: { x: 50, y: 50 } }
      : {
          posterUrl: orNull(bg.posterUrl),
          sources: sourcesOf({ mp4Url: orNull(bg.mp4Url), webmUrl: orNull(bg.webmUrl) }),
          focal: { x: Number.isFinite(focal(bg.focalX)) ? focal(bg.focalX) : 50, y: Number.isFinite(focal(bg.focalY)) ? focal(bg.focalY) : 50 },
        };

  const setBg = (patch: Partial<BackgroundValues>) => setValues((previous) => ({ ...previous, background: { ...previous.background, ...patch } }));
  const setLinks = (links: LinkValues[]) => setValues((previous) => ({ ...previous, links }));
  const updateLink = (key: string, patch: Partial<LinkValues>) => setLinks(values.links.map((link) => (link.key === key ? { ...link, ...patch } : link)));
  const moveLink = (index: number, delta: -1 | 1) => {
    const next = [...values.links];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    setLinks(next);
  };

  const fail = (failure: Extract<ActionResult<unknown>, { ok: false }>) => {
    setErrors(failure.fieldErrors ?? {});
    if (failure.code === 'conflict') setNotice({ kind: 'warning', title: t('conflictTitle'), text: t('conflictBody'), conflict: true });
    else setNotice({ kind: 'error', text: actionError(failure.code) });
  };

  const save = async () => {
    if (Object.keys(liveErrors).length > 0) {
      setErrors(liveErrors);
      setNotice({ kind: 'error', text: actionError('validation') });
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-settings-form] [aria-invalid="true"]')?.focus());
      return;
    }
    const changes: SettingChange[] = changedKeys.map((key) => ({ key, expectedVersion: setting(stored, key).version, value: current[key] }));
    if (changes.length === 0) return;
    setPending('save');
    const result = await saveSettingsAction({ changes });
    setPending(null);
    if (!result.ok) {
      fail(result);
      return;
    }
    setStored(result.data);
    setValues(valuesFrom(result.data));
    setErrors({});
    setNotice({ kind: 'success', title: t('savedTitle'), text: t('savedBody') });
  };

  const reload = async () => {
    setPending('reload');
    const result = await loadSettingsAction();
    setPending(null);
    if (!result.ok) return fail(result);
    // Newer stored versions become the base; the entered values stay for review.
    setStored(result.data);
    setNotice({ kind: 'info', text: t('reloadedNotice') });
  };

  const live = (label: string, value: ReactNode, changed: boolean, testId: string) => (
    <div className={styles.liveValue} data-changed={changed || undefined} data-live={testId}>
      <span className={styles.liveLabel}>{changed ? t('liveChanged') : t('liveNow')}</span>
      <span>
        {label}: {value}
      </span>
    </div>
  );

  const updated = (item: AdminSetting) => (item.updatedAt ? t('lastSaved', { date: formatDate(item.updatedAt, uiLocale, 'dateTimeZone') }) : t('neverSaved'));

  return (
    <div className={styles.stack} data-settings-form="">
      {notice ? (
        <FeedbackNotice
          kind={notice.kind}
          title={notice.title}
          action={
            notice.conflict ? (
              <GameButton size="sm" intent="secondary" onClick={reload} pending={pending === 'reload'}>
                {t('reloadLatest')}
              </GameButton>
            ) : undefined
          }
        >
          {notice.text}
        </FeedbackNotice>
      ) : null}
      <div className={styles.settingsLayout}>
        <div className={styles.editorMain}>
          <fieldset className={styles.group} data-group="community">
            <legend>{t('groups.community')}</legend>
            <div className={styles.groupBody}>
              <p className={styles.groupIntro}>{t('communityIntro')}</p>
              {storedDiscord.invalid ? (
                <FeedbackNotice kind="warning" live={false}>
                  {t('storedInvalid')}
                </FeedbackNotice>
              ) : null}
              <TextField
                name="discordInviteUrl"
                type="url"
                label={t('fields.discordInviteUrl')}
                markOptional
                hint={defaults.discordInviteUrl ? t('hints.discordDefault', { url: defaults.discordInviteUrl }) : t('hints.discordNoDefault')}
                value={values.discordInviteUrl}
                maxLength={2048}
                onChange={(event) => setValues({ ...values, discordInviteUrl: event.target.value })}
                error={err(DISCORD)}
              />
              {live(t('fields.discordShort'), liveDiscord ?? t('none'), changedKeys.includes(DISCORD), 'discord')}
              <p className={styles.actionNote}>{updated(storedDiscord)}</p>

              <h3 className={styles.repeatHeading}>{t('linksTitle')}</h3>
              <p className={styles.groupIntro}>{t('linksIntro', { max: MAX_COMMUNITY_LINKS })}</p>
              <ol className={styles.repeatList}>
                {values.links.map((link, index) => (
                  <li key={link.key} className={styles.repeatItem}>
                    <fieldset>
                      <legend className={styles.repeatHeading}>{t('linkItem', { number: index + 1 })}</legend>
                      <div className={styles.grid}>
                        <Select
                          name={`link-${link.key}-kind`}
                          label={t('fields.linkKind')}
                          required
                          value={link.kind}
                          onChange={(event) => updateLink(link.key, { kind: event.target.value as CommunityLinkKind })}
                          options={COMMUNITY_LINK_KINDS.map((kind) => ({ value: kind, label: t(`linkKinds.${kind}`) }))}
                          error={err(`${LINKS}.${index}.kind`)}
                        />
                        <TextField name={`link-${link.key}-label`} label={t('fields.linkLabel')} required value={link.label} maxLength={60} onChange={(event) => updateLink(link.key, { label: event.target.value })} error={err(`${LINKS}.${index}.label`)} />
                        <TextField name={`link-${link.key}-url`} type="url" label={t('fields.linkUrl')} required hint={t('hints.https')} value={link.url} maxLength={2048} onChange={(event) => updateLink(link.key, { url: event.target.value })} error={err(`${LINKS}.${index}.url`)} />
                      </div>
                      <div className={styles.repeatButtons}>
                        <GameButton size="sm" intent="ghost" disabled={index === 0} onClick={() => moveLink(index, -1)} aria-label={t('linkUp', { number: index + 1 })}>
                          ↑ {tc('up')}
                        </GameButton>
                        <GameButton size="sm" intent="ghost" disabled={index === values.links.length - 1} onClick={() => moveLink(index, 1)} aria-label={t('linkDown', { number: index + 1 })}>
                          ↓ {tc('down')}
                        </GameButton>
                        <GameButton size="sm" intent="danger" onClick={() => setLinks(values.links.filter((item) => item.key !== link.key))} aria-label={t('linkRemove', { number: index + 1 })}>
                          {tc('remove')}
                        </GameButton>
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ol>
              <div className={styles.inlineActions}>
                <GameButton size="sm" intent="secondary" disabled={values.links.length >= MAX_COMMUNITY_LINKS} onClick={() => setLinks([...values.links, { key: linkKey(), kind: 'website', label: '', url: '' }])}>
                  + {t('linkAdd')}
                </GameButton>
                {err(LINKS) ? <span className={styles.errorText}>{err(LINKS)}</span> : null}
              </div>
              {live(t('linksTitle'), liveLinks.length ? liveLinks.map((link) => link.label).join(', ') : t('none'), changedKeys.includes(LINKS), 'links')}
            </div>
          </fieldset>

          <fieldset className={styles.group} data-group="background">
            <legend>{t('groups.background')}</legend>
            <div className={styles.groupBody}>
              <p className={styles.groupIntro}>{t('backgroundIntro')}</p>
              {storedBackground.invalid ? (
                <FeedbackNotice kind="warning" live={false}>
                  {t('storedInvalid')}
                </FeedbackNotice>
              ) : null}
              <RadioGroup
                name="backgroundMode"
                label={t('fields.backgroundMode')}
                value={bg.mode}
                onChange={(event) => setBg({ mode: event.target.value as BackgroundValues['mode'] })}
                options={[
                  { value: 'default', label: t('modeDefault'), hint: t('modeDefaultHint') },
                  { value: 'custom', label: t('modeCustom'), hint: t('modeCustomHint') },
                ]}
              />
              <div className={styles.grid}>
                <TextField name="posterUrl" label={t('fields.posterUrl')} markOptional hint={t('hints.mediaUrl')} value={bg.posterUrl} disabled={bg.mode === 'default'} maxLength={2048} onChange={(event) => setBg({ posterUrl: event.target.value })} error={err(`${BACKGROUND}.posterUrl`)} />
                <TextField name="webmUrl" label={t('fields.webmUrl')} markOptional hint={t('hints.mediaUrl')} value={bg.webmUrl} disabled={bg.mode === 'default'} maxLength={2048} onChange={(event) => setBg({ webmUrl: event.target.value })} error={err(`${BACKGROUND}.webmUrl`)} />
                <TextField name="mp4Url" label={t('fields.mp4Url')} markOptional hint={t('hints.mediaUrl')} value={bg.mp4Url} disabled={bg.mode === 'default'} maxLength={2048} onChange={(event) => setBg({ mp4Url: event.target.value })} error={err(`${BACKGROUND}.mp4Url`)} />
              </div>
              <p className={styles.actionNote} data-allowed-origins="">
                {allowedOrigins.length ? t('originsList', { origins: allowedOrigins.join(', ') }) : t('originsNone')}
              </p>
              <div className={`${styles.grid} ${styles.spacedTop}`}>
                <TextField name="focalX" label={t('fields.focalX')} inputMode="decimal" hint={t('hints.focal')} value={bg.focalX} disabled={bg.mode === 'default'} onChange={(event) => setBg({ focalX: event.target.value })} error={err(`${BACKGROUND}.focalX`)} />
                <TextField name="focalY" label={t('fields.focalY')} inputMode="decimal" hint={t('hints.focal')} value={bg.focalY} disabled={bg.mode === 'default'} onChange={(event) => setBg({ focalY: event.target.value })} error={err(`${BACKGROUND}.focalY`)} />
              </div>
              <TextArea
                name="provenance"
                label={t('fields.provenance')}
                hint={t('hints.provenance')}
                value={bg.provenance}
                disabled={bg.mode === 'default'}
                rows={3}
                maxLength={500}
                onChange={(event) => setBg({ provenance: event.target.value })}
                error={err(`${BACKGROUND}.provenance`)}
              />
              {live(
                t('backgroundShort'),
                [liveBackground.posterUrl, liveBackground.webmUrl, liveBackground.mp4Url].filter(Boolean).join(' · ') || t('fallbackScene'),
                changedKeys.includes(BACKGROUND),
                'background',
              )}
              <p className={styles.actionNote}>{updated(storedBackground)}</p>
            </div>
          </fieldset>
        </div>

        <aside className={styles.editorAside} aria-labelledby="settings-preview-title">
          <section className={styles.panel}>
            <h2 id="settings-preview-title" className={styles.panelTitle}>
              {t('preview.title')}
            </h2>
            <p className={styles.actionNote}>{t('preview.explainer')}</p>
            <BackgroundPreview posterUrl={proposedMedia.posterUrl} sources={proposedMedia.sources} focal={proposedMedia.focal} valid={backgroundValid} fallback={fallbackScene} />
          </section>
        </aside>
      </div>

      <p className={styles.actionNote} id="settings-live-note">
        {t('saveGoesLive')}
      </p>
      <FormActions status={pending === 'save' ? tc('saving') : dirty ? t('dirtyStatus', { count: changedKeys.length }) : tc('allSaved')}>
        {dirty ? (
          <GameButton intent="ghost" onClick={() => setValues(baseline)} disabled={pending !== null}>
            {tc('discard')}
          </GameButton>
        ) : null}
        <GameButton intent="primary" onClick={save} disabled={!dirty || pending !== null} pending={pending === 'save'} pendingLabel={tc('saving')} aria-describedby="settings-live-note" data-action="save-settings">
          {t('save')}
        </GameButton>
      </FormActions>
    </div>
  );
}
