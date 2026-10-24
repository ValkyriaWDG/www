import { describe, expect, it } from 'vitest';
import { mergePublicPlayerRosterRows } from './logi-public-players';

describe('public match lineup composition', () => {
  const row = { href: '/members/approved', displayName: 'Approved Player', squad: 'Same squad label', slot: 0, reserve: false };
  it('shows an approved source/editorial counterpart once', () => {
    expect(mergePublicPlayerRosterRows([row], [row])).toEqual([row]);
  });
  it('preserves two distinct same-labelled squad positions without doubling their two-source representation', () => {
    expect(mergePublicPlayerRosterRows([row, row], [row, row])).toEqual([row, row]);
    expect(mergePublicPlayerRosterRows([row], [row, row])).toEqual([row, row]);
    expect(mergePublicPlayerRosterRows([row, row], [row])).toEqual([row, row]);
  });
  it('never joins different opaque players by a shared supplied name', () => {
    const other = { ...row, href: `/players/${'a'.repeat(64)}` };
    expect(mergePublicPlayerRosterRows([row], [other])).toEqual([row, other]);
  });
});
