import { z } from 'zod';

export const logiMemberLinkTargetSchema = z.strictObject({
  profileId: z.uuid(),
  game: z.enum(['hll', 'wardogs']),
  expectedVersion: z.number().int().min(0),
});
export const logiMemberLinkInputSchema = logiMemberLinkTargetSchema.extend({
  scopeKey: z.string().regex(/^[a-f0-9]{64}$/),
  memberId: z.string().min(1).max(160),
  identityId: z.string().min(1).max(160),
  allowStats: z.boolean(),
  allowRoster: z.boolean(),
});
export type LogiMemberLinkInput = z.infer<typeof logiMemberLinkInputSchema>;
export type LogiMemberLinkTarget = z.infer<typeof logiMemberLinkTargetSchema>;
export type LogiMemberLinkView = {
  profileId: string;
  game: 'hll' | 'wardogs';
  version: number;
  memberId: string;
  identityId: string;
  scopeKey: string;
  allowStats: boolean;
  allowRoster: boolean;
};
