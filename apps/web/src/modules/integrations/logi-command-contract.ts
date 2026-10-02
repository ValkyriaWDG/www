import { z } from 'zod';
import { logiGameSchema, logiIdSchema, logiRevisionSchema } from './logi/contracts';

const instant = z.iso.datetime();
export const logiEditableEventSchema = z.strictObject({
  kind: z.enum(['match', 'training']), name: z.string().trim().min(1).max(160),
  matchType: z.string().max(80).optional(), description: z.string().max(2000).optional(), map: z.string().max(200).optional(), side: z.string().max(200).optional(),
  registrationStart: instant.optional(), registrationEnd: instant, meetingStart: instant, gameStart: instant, gameEnd: instant,
}).refine((event) => (!event.registrationStart || Date.parse(event.registrationStart) <= Date.parse(event.registrationEnd)) && Date.parse(event.registrationEnd) <= Date.parse(event.meetingStart) && Date.parse(event.meetingStart) <= Date.parse(event.gameStart) && Date.parse(event.gameStart) < Date.parse(event.gameEnd));
export const logiEventCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), event: logiEditableEventSchema }),
  z.strictObject({ operation: z.literal('update'), eventId: logiIdSchema, expectedRevision: logiRevisionSchema, event: logiEditableEventSchema }),
  z.strictObject({ operation: z.literal('cancel'), eventId: logiIdSchema, expectedRevision: logiRevisionSchema }),
]);
const identity = { eventId: logiIdSchema, guildId: logiIdSchema, gameId: logiGameSchema, revision: logiRevisionSchema };
export const logiCommandReceiptSchema = z.strictObject({ ...identity, operation: z.enum(['create', 'update', 'cancel']), receiptId: logiIdSchema, replayed: z.boolean() });
export const logiEventEditorSchema = z.strictObject({ ...identity, event: logiEditableEventSchema, canEdit: z.boolean(), canCancel: z.boolean() });
export type LogiEventCommand = z.infer<typeof logiEventCommandSchema>;
export type LogiCommandReceipt = z.infer<typeof logiCommandReceiptSchema>;
export type LogiEventEditor = z.infer<typeof logiEventEditorSchema>;
export type LogiEditableEvent = z.infer<typeof logiEditableEventSchema>;
export const logiCommandInputSchema = z.strictObject({ requestId: z.uuid(), game: z.enum(['hll', 'wardogs']), command: logiEventCommandSchema });
export type LogiCommandInput = z.infer<typeof logiCommandInputSchema>;
export type LogiCommandOutcome = { state: 'confirmed'; receipt: LogiCommandReceipt } | { state: 'pending'; code: string; requestId: string } | { state: 'rejected'; code: string; requestId: string };
