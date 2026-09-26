'use client';

import type { MatchOutcome } from '@valkyria/db/schema';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { FieldError, Select, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { errorsBelow, type FieldErrors } from './errors';
import { emptyRound, MAX_ROUND_ROWS, type RoundValues } from './match-form';
import { useFieldError } from './use-messages';
import styles from './admin-community.module.css';

const OUTCOMES: MatchOutcome[] = ['win', 'loss', 'draw', 'unknown'];

type RoundsEditorProps = {
  rounds: RoundValues[];
  onChange: (rounds: RoundValues[]) => void;
  errors: FieldErrors;
  disabled?: boolean;
};

/**
 * Optional maps/rounds: add, remove and reorder with buttons (no drag-only interaction).
 * After a move, focus follows the moved round's button so keyboard users keep context.
 */
export function RoundsEditor({ rounds, onChange, errors, disabled }: RoundsEditorProps) {
  const t = useTranslations('adminCommunity.rounds');
  const tOutcome = useTranslations('adminCommunity.common.outcome');
  const fieldError = useFieldError();
  const listRef = useRef<HTMLOListElement>(null);

  const update = (index: number, patch: Partial<RoundValues>) => onChange(rounds.map((round, position) => (position === index ? { ...round, ...patch } : round)));
  const focusLater = (selector: string) => requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(selector)?.focus());
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rounds.length) return;
    const next = [...rounds];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
    focusLater(`[data-round-key="${item!.key}"] [data-round-move="${delta < 0 ? 'up' : 'down'}"]:not([disabled])`);
  };
  const remove = (index: number) => {
    onChange(rounds.filter((_, position) => position !== index));
    focusLater(rounds.length > 1 ? `[data-round-index="${Math.max(0, index - 1)}"] input` : '[data-round-add]');
  };
  const add = () => {
    const round = emptyRound();
    onChange([...rounds, round]);
    focusLater(`[data-round-key="${round.key}"] input`);
  };
  const listError = errors.rounds;

  return (
    <div data-rounds-editor="">
      <p className={styles.groupIntro}>{t('intro')}</p>
      <ol ref={listRef} className={styles.repeatList} aria-label={t('listLabel')} hidden={rounds.length === 0}>
        {rounds.map((round, index) => {
          const number = index + 1;
          const prefix = `rounds.${index}`;
          return (
            <li key={round.key} className={styles.repeatItem} data-round-key={round.key} data-round-index={index}>
              <fieldset className={styles.roundFieldset}>
                <legend className={styles.repeatHeading}>{t('roundTitle', { number })}</legend>
                <div className={styles.roundGrid}>
                  <TextField
                    name={`round-${round.key}-map`}
                    label={t('mapName')}
                    value={round.mapName}
                    maxLength={80}
                    disabled={disabled}
                    onChange={(event) => update(index, { mapName: event.target.value })}
                    error={fieldError(errorsBelow(errors, `${prefix}.mapName`))}
                  />
                  <TextField
                    name={`round-${round.key}-mode`}
                    label={t('mode')}
                    value={round.mode}
                    maxLength={60}
                    disabled={disabled}
                    onChange={(event) => update(index, { mode: event.target.value })}
                    error={fieldError(errorsBelow(errors, `${prefix}.mode`))}
                  />
                  <TextField
                    name={`round-${round.key}-side`}
                    label={t('side')}
                    value={round.side}
                    maxLength={60}
                    disabled={disabled}
                    onChange={(event) => update(index, { side: event.target.value })}
                    error={fieldError(errorsBelow(errors, `${prefix}.side`))}
                  />
                  <TextField
                    name={`round-${round.key}-score-valkyria`}
                    label={t('scoreValkyria')}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={round.scoreValkyria}
                    disabled={disabled}
                    onChange={(event) => update(index, { scoreValkyria: event.target.value })}
                    error={fieldError(errorsBelow(errors, `${prefix}.scoreValkyria`))}
                  />
                  <TextField
                    name={`round-${round.key}-score-opponent`}
                    label={t('scoreOpponent')}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={round.scoreOpponent}
                    disabled={disabled}
                    onChange={(event) => update(index, { scoreOpponent: event.target.value })}
                    error={fieldError(errorsBelow(errors, `${prefix}.scoreOpponent`))}
                  />
                  <Select
                    name={`round-${round.key}-outcome`}
                    label={t('outcome')}
                    value={round.outcome}
                    disabled={disabled}
                    onChange={(event) => update(index, { outcome: event.target.value as RoundValues['outcome'] })}
                    options={[{ value: '', label: t('outcomeNone') }, ...OUTCOMES.map((value) => ({ value, label: tOutcome(value) }))]}
                    error={fieldError(errorsBelow(errors, `${prefix}.outcome`) ?? errorsBelow(errors, `${prefix}.ordinal`))}
                  />
                </div>
                <div className={styles.repeatButtons}>
                  <GameButton size="sm" intent="secondary" data-round-move="up" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={t('moveUp', { number })}>
                    ↑ {t('up')}
                  </GameButton>
                  <GameButton size="sm" intent="secondary" data-round-move="down" disabled={disabled || index === rounds.length - 1} onClick={() => move(index, 1)} aria-label={t('moveDown', { number })}>
                    ↓ {t('down')}
                  </GameButton>
                  <GameButton size="sm" intent="danger" disabled={disabled} onClick={() => remove(index)} aria-label={t('remove', { number })} data-round-remove="">
                    {t('removeShort')}
                  </GameButton>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <FieldError id="rounds-error">{listError ? fieldError(listError) : undefined}</FieldError>
      <div className={styles.inlineActions}>
        <GameButton size="sm" intent="secondary" onClick={add} disabled={disabled || rounds.length >= MAX_ROUND_ROWS} data-round-add="">
          + {t('add')}
        </GameButton>
        <span className={styles.actionNote} role="status">
          {t('count', { count: rounds.length })}
        </span>
      </div>
    </div>
  );
}
