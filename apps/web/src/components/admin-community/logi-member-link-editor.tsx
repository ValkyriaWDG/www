'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { FeedbackNotice, GameButton, SectionFrame } from '@/components/ui';
import type { GameRoute } from '@/modules/games/registry';
import type { LogiMemberCandidate } from '@/modules/integrations/logi-people-types';
import type { LogiMemberLinkView } from '@/modules/integrations/logi-member-link-schemas';
import { removeLogiMemberLinkAction, saveLogiMemberLinkAction } from '@/modules/integrations/logi-member-link-actions';
import { useActionError } from './use-messages';
import styles from '@/components/public/logi-people.module.css';

const subscribe = () => () => {};
export function LogiMemberLinkEditor({
  profileId,
  game,
  candidates,
  link,
}: {
  profileId: string;
  game: GameRoute;
  candidates: LogiMemberCandidate[];
  link: LogiMemberLinkView | null;
}) {
  const t = useTranslations('logiPeople');
  const errorText = useActionError();
  const router = useRouter();
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const key = (c: Pick<LogiMemberCandidate, 'scopeKey' | 'memberId' | 'identityId'>) => `${c.scopeKey}:${c.memberId}:${c.identityId}`;
  const [selected, setSelected] = useState(link && candidates.some((c) => key(c) === key(link)) ? key(link) : '');
  const [stats, setStats] = useState(link?.allowStats ?? false);
  const [roster, setRoster] = useState(link?.allowRoster ?? false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(remove: boolean) {
    if (!ready || busy) return;
    const candidate = candidates.find((c) => key(c) === selected);
    if (!remove && !candidate) return;
    setBusy(true);
    setNotice(null);
    try {
      const target = { profileId, game, expectedVersion: link?.version ?? 0 };
      const result = remove
        ? await removeLogiMemberLinkAction(target)
        : await saveLogiMemberLinkAction({
            ...target,
            scopeKey: candidate!.scopeKey,
            memberId: candidate!.memberId,
            identityId: candidate!.identityId,
            allowStats: stats,
            allowRoster: roster,
          });
      if (!result.ok) setNotice({ ok: false, text: errorText(result.code) });
      else {
        setNotice({ ok: true, text: t(remove ? 'removed' : 'saved') });
        router.refresh();
      }
    } catch {
      setNotice({ ok: false, text: errorText('unavailable') });
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionFrame title={t('association', { game: game === 'hll' ? 'Hell Let Loose' : 'Wardogs' })} titleId={`association-${game}`}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
        aria-busy={!ready || busy}
        data-logi-link-editor={game}
      >
        <p>{t(link ? 'linked' : 'unlinked')}</p>
        {link && !candidates.some((c) => key(c) === key(link)) ? <FeedbackNotice kind="warning">{t('staleLink')}</FeedbackNotice> : null}
        <fieldset disabled={!ready || busy}>
          <label>
            {t('chooseMember')}
            <select value={selected} onChange={(event) => setSelected(event.target.value)} required>
              <option value="">{t('chooseMember')}</option>
              {candidates.map((candidate) => (
                <option key={key(candidate)} value={key(candidate)}>
                  {candidate.displayName ?? t('unknown')} · {t(candidate.type)} · {t(candidate.status)} · {candidate.memberId}
                </option>
              ))}
            </select>
          </label>
          {!candidates.length ? <p>{t('noCandidates')}</p> : null}
          <label className={styles.check}>
            <input type="checkbox" checked={stats} onChange={(event) => setStats(event.target.checked)} />
            {t('allowStats')}
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={roster} onChange={(event) => setRoster(event.target.checked)} />
            {t('allowRoster')}
          </label>
          <div className={styles.actions}>
            <GameButton type="submit" intent="primary" disabled={!selected}>
              {t('save')}
            </GameButton>
            {link ? (
              <GameButton type="button" onClick={() => void submit(true)}>
                {t('remove')}
              </GameButton>
            ) : null}
          </div>
        </fieldset>
        {notice ? <FeedbackNotice kind={notice.ok ? 'success' : 'error'}>{notice.text}</FeedbackNotice> : null}
      </form>
    </SectionFrame>
  );
}
