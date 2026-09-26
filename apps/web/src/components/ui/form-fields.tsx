import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { ErrorIcon } from './icons';
import styles from './forms.module.css';

type FieldBase = {
  name: string;
  label: ReactNode;
  /** Defaults to `field-<name>`; must be unique on the page. */
  id?: string;
  hint?: ReactNode;
  /** Localized, specific error message; associates via aria-describedby and aria-invalid. */
  error?: string | null;
  required?: boolean;
  /** Show "(optional)" for non-required fields in dense forms. */
  markOptional?: boolean;
};

function ids(name: string, id?: string) {
  const base = id ?? `field-${name}`;
  return { id: base, hintId: `${base}-hint`, errorId: `${base}-error` };
}

function describedBy(hint: ReactNode, error: string | null | undefined, hintId: string, errorId: string) {
  return [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
}

/** Persistent label with visible required/optional text (not color or asterisk alone). */
function FieldLabel({ htmlFor, required, markOptional, children }: { htmlFor: string; required?: boolean; markOptional?: boolean; children: ReactNode }) {
  const t = useTranslations('common.forms');
  return (
    <label htmlFor={htmlFor} className={styles.label}>
      {children}
      {required ? <span className={styles.requirement}> {t('required')}</span> : markOptional ? <span className={styles.requirement}> {t('optional')}</span> : null}
    </label>
  );
}

/** Inline field error: icon + visually hidden "Error:" prefix + message. */
export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  const t = useTranslations('common.forms');
  if (!children) return null;
  return (
    <p id={id} className={styles.error}>
      <ErrorIcon size={16} />
      <span>
        <span className="visually-hidden">{t('errorPrefix')} </span>
        {children}
      </span>
    </p>
  );
}

function Hint({ id, children }: { id: string; children?: ReactNode }) {
  return children ? (
    <p id={id} className={styles.hint}>
      {children}
    </p>
  ) : null;
}

/** Single-line text input with label, hint and error. */
export function TextField({ name, label, id, hint, error, required, markOptional, className, ...input }: FieldBase & Omit<ComponentProps<'input'>, 'name' | 'id'>) {
  const f = ids(name, id);
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <FieldLabel htmlFor={f.id} required={required} markOptional={markOptional}>
        {label}
      </FieldLabel>
      <Hint id={f.hintId}>{hint}</Hint>
      <input id={f.id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, f.hintId, f.errorId)} className={styles.control} {...input} />
      <FieldError id={f.errorId}>{error}</FieldError>
    </div>
  );
}

/** Multi-line text input. */
export function TextArea({ name, label, id, hint, error, required, markOptional, className, rows = 5, ...textarea }: FieldBase & Omit<ComponentProps<'textarea'>, 'name' | 'id'>) {
  const f = ids(name, id);
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <FieldLabel htmlFor={f.id} required={required} markOptional={markOptional}>
        {label}
      </FieldLabel>
      <Hint id={f.hintId}>{hint}</Hint>
      <textarea id={f.id} name={name} rows={rows} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, f.hintId, f.errorId)} className={`${styles.control} ${styles.textarea}`} {...textarea} />
      <FieldError id={f.errorId}>{error}</FieldError>
    </div>
  );
}

/** Native select with square styling. */
export function Select({ name, label, id, hint, error, required, markOptional, className, options, ...select }: FieldBase & Omit<ComponentProps<'select'>, 'name' | 'id' | 'children'> & { options: { value: string; label: string; disabled?: boolean }[] }) {
  const f = ids(name, id);
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <FieldLabel htmlFor={f.id} required={required} markOptional={markOptional}>
        {label}
      </FieldLabel>
      <Hint id={f.hintId}>{hint}</Hint>
      <select id={f.id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, f.hintId, f.errorId)} className={`${styles.control} ${styles.select}`} {...select}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={f.errorId}>{error}</FieldError>
    </div>
  );
}

/** Checkbox with the label beside the control (44 px row). */
export function Checkbox({ name, label, id, hint, error, required, className, ...input }: Omit<FieldBase, 'markOptional'> & Omit<ComponentProps<'input'>, 'name' | 'id' | 'type'>) {
  const f = ids(name, id);
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <div className={styles.choice}>
        <input id={f.id} type="checkbox" name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(hint, error, f.hintId, f.errorId)} className={styles.checkbox} {...input} />
        <FieldLabel htmlFor={f.id} required={required}>
          {label}
        </FieldLabel>
      </div>
      <Hint id={f.hintId}>{hint}</Hint>
      <FieldError id={f.errorId}>{error}</FieldError>
    </div>
  );
}

/** Radio options grouped by a fieldset/legend. */
export function RadioGroup({
  name,
  label,
  id,
  hint,
  error,
  required,
  markOptional,
  options,
  value,
  defaultValue,
  onChange,
  disabled,
}: FieldBase & {
  options: { value: string; label: ReactNode; hint?: ReactNode }[];
  value?: string;
  defaultValue?: string;
  onChange?: ComponentProps<'input'>['onChange'];
  disabled?: boolean;
}) {
  const t = useTranslations('common.forms');
  const f = ids(name, id);
  return (
    <fieldset className={styles.fieldset} aria-describedby={describedBy(hint, error, f.hintId, f.errorId)} aria-invalid={error ? true : undefined} disabled={disabled}>
      <legend className={styles.label}>
        {label}
        {required ? <span className={styles.requirement}> {t('required')}</span> : markOptional ? <span className={styles.requirement}> {t('optional')}</span> : null}
      </legend>
      <Hint id={f.hintId}>{hint}</Hint>
      {options.map((option) => {
        const optionId = `${f.id}-${option.value}`;
        const controlled = value !== undefined ? { checked: value === option.value, onChange } : { defaultChecked: defaultValue === option.value, onChange };
        return (
          <div key={option.value} className={styles.choice}>
            <input id={optionId} type="radio" name={name} value={option.value} required={required} className={styles.radio} {...controlled} />
            <label htmlFor={optionId} className={styles.choiceLabel}>
              {option.label}
              {option.hint ? <span className={styles.hint}>{option.hint}</span> : null}
            </label>
          </div>
        );
      })}
      <FieldError id={f.errorId}>{error}</FieldError>
    </fieldset>
  );
}

/**
 * Local date + time input with the display time zone stated explicitly (event start times
 * and publication schedules are entered in Europe/Prague and stored as instants).
 */
export function DateTimeField({ name, label, id, hint, error, required, markOptional, className, timeZone = 'Europe/Prague', ...input }: FieldBase & Omit<ComponentProps<'input'>, 'name' | 'id' | 'type'> & { timeZone?: string }) {
  const t = useTranslations('common.forms');
  const f = ids(name, id);
  const zoneHint = (
    <>
      {hint ? <>{hint} </> : null}
      {t('timeZone', { zone: timeZone })}
    </>
  );
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <FieldLabel htmlFor={f.id} required={required} markOptional={markOptional}>
        {label}
      </FieldLabel>
      <Hint id={f.hintId}>{zoneHint}</Hint>
      <input id={f.id} type="datetime-local" name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(zoneHint, error, f.hintId, f.errorId)} className={styles.control} {...input} />
      <FieldError id={f.errorId}>{error}</FieldError>
    </div>
  );
}

/**
 * Form action row that stays reachable on long forms (sticky to the viewport bottom) with
 * a polite save-state region; the page reserves scroll padding so focus is not obscured.
 */
export function FormActions({ children, status, sticky = true }: { children: ReactNode; status?: ReactNode; sticky?: boolean }) {
  return (
    <div className={styles.actions} data-sticky-actions={sticky || undefined}>
      <p className={styles.status} role="status">
        {status}
      </p>
      <div className={styles.actionButtons}>{children}</div>
    </div>
  );
}
