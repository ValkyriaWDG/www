import styles from './home.module.css';

type DiscordCtaProps = {
  /** Validated invitation or `null` → explicit unavailable state (never a broken link). */
  url: string | null;
  label: string;
  sublabel: string;
  externalLabel: string;
  unavailableTitle: string;
  unavailableBody: string;
};

/** Primary home action modelled on reference 09's DEPLOY button: amber fill, outline, brackets and ▸ ◂ markers. */
export function DiscordCta({ url, label, sublabel, externalLabel, unavailableTitle, unavailableBody }: DiscordCtaProps) {
  const decoration = (
    <>
      <span className={styles.bracket} data-side="start" aria-hidden="true" />
      <span className={styles.marker} data-side="start" aria-hidden="true" />
      <span className={styles.marker} data-side="end" aria-hidden="true" />
      <span className={styles.bracket} data-side="end" aria-hidden="true" />
    </>
  );
  if (!url) {
    return (
      <div className={`${styles.cta} ${styles.ctaUnavailable}`} data-cta="discord-unavailable">
        {decoration}
        <span className={styles.ctaText}>
          <span className={styles.ctaLabel}>{unavailableTitle}</span>
          <span className={styles.ctaNote}>{unavailableBody}</span>
        </span>
      </div>
    );
  }
  return (
    <a href={url} className={styles.cta} data-cta="discord">
      {decoration}
      <span className={styles.ctaText}>
        <span className={styles.ctaLabel}>{label}</span>
        <span className={styles.ctaSub}>{sublabel}</span>
      </span>
      <span className="visually-hidden"> {externalLabel}</span>
    </a>
  );
}
