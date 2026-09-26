import { FeedbackNotice } from '@/components/ui/panels';
import { GameButton } from '@/components/ui/game-button';

/**
 * Read failure of a public list: the page chrome and context stay, the message is
 * specific and the retry reloads the same URL (filters included). No technical details.
 */
export function ListLoadError({ message, retryLabel, retryHref }: { message: string; retryLabel: string; retryHref: string }) {
  return (
    <div data-list-error="">
      <FeedbackNotice
        kind="error"
        title={message}
        action={
          <GameButton href={retryHref} intent="secondary" size="sm">
            {retryLabel}
          </GameButton>
        }
      />
    </div>
  );
}
