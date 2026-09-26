import type { AssetScope } from '@valkyria/db';
import type { Capability } from '@/modules/access/capabilities';

/** Capability that manages (and privately previews) assets of a media scope. */
export function scopeCapability(scope: AssetScope): Capability {
  return scope === 'editorial' ? 'media.editorial.manage' : 'media.match.manage';
}
