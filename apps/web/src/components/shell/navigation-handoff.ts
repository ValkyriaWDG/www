/**
 * Document handoff hooks: a few links (the language switch) leave through a full page
 * load that should still behave like in-app navigation for decorative state such as the
 * selected HLL clip. Modules register a callback that writes a short-lived handoff; the
 * link runs them right before the browser navigates. Callbacks must never throw.
 */
type Handoff = () => void;
const handoffs = new Set<Handoff>();

export function registerNavigationHandoff(handoff: Handoff): () => void {
  handoffs.add(handoff);
  return () => handoffs.delete(handoff);
}

export function runNavigationHandoffs(): void {
  for (const handoff of handoffs) {
    try {
      handoff();
    } catch {
      // Decorative state only; navigation proceeds regardless.
    }
  }
}
