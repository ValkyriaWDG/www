/** Non-deliverable domain (RFC 6761 `.invalid`) for provider-ID aliases. */
export const ALIAS_EMAIL_DOMAIN = 'accounts.invalid';

export type DiscordProfileInput = {
  id: string;
  username?: string | null;
  global_name?: string | null;
  email?: string | null;
};

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Better Auth requires an email-shaped identifier; Discord is requested with the
 * `identify` scope only, so no real address exists (and one is never stored even if a
 * provider response contained it). The alias `discord-<subject>@accounts.invalid` is
 * unique per Discord subject, marked unverified, and is never a contact, recovery or
 * account-linking key.
 */
export function discordAliasEmail(discordUserId: string): string {
  if (!/^[0-9]{5,25}$/.test(discordUserId)) throw new Error('Invalid Discord subject.');
  return `discord-${discordUserId}@${ALIAS_EMAIL_DOMAIN}`;
}

export function isAliasEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALIAS_EMAIL_DOMAIN}`);
}

/** Display name from `global_name`, then `username`; bounded and free of control characters. */
export function discordDisplayName(profile: DiscordProfileInput): string {
  for (const candidate of [profile.global_name, profile.username]) {
    const cleaned = (candidate ?? '').replace(CONTROL, '').trim().slice(0, 80);
    if (cleaned) return cleaned;
  }
  return 'Discord user';
}

/** `mapProfileToUser` for the Discord provider: overrides e-mail, verification and avatar. */
export function mapDiscordProfileToUser(profile: DiscordProfileInput) {
  return {
    email: discordAliasEmail(profile.id),
    emailVerified: false,
    name: discordDisplayName(profile),
    // Avatars are not copied; public member media goes through the approved asset pipeline.
    image: undefined,
  };
}
