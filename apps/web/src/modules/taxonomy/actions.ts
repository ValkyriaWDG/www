'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { ok, toActionError, type ActionResult } from '@/lib/result';
import { requireCapability } from '@/modules/access/server';
import {
  archiveTaxonomyTerm,
  deleteTaxonomyTerm,
  restoreTaxonomyTerm,
  saveTaxonomyTerm,
  type SaveTaxonomyTermInput,
  type TaxonomyTermDTO,
  type TaxonomyTermRefInput,
} from './admin';

/*
 * Taxonomy mutations. The actor is resolved from the session with write intent; the use
 * case validates the input again and authorizes the term's scope (manual category game or
 * platform-wide news taxonomy). Public pages read manual categories live and news filter
 * labels live, so the affected public lists are revalidated along with the admin lists.
 */

function revalidateTaxonomy(scope: SaveTaxonomyTermInput['scope'] | undefined) {
  revalidatePath('/[locale]/admin/taxonomy', 'layout');
  if (scope?.scope === 'manual-category') {
    revalidatePath('/[locale]/admin/manual', 'layout');
    revalidatePath('/[locale]/[game]/field-manual', 'layout');
    return;
  }
  revalidatePath('/[locale]/admin/news', 'layout');
  revalidatePath('/[locale]/news', 'layout');
  revalidatePath('/[locale]/[game]/news', 'layout');
}

export async function saveTaxonomyTermAction(input: SaveTaxonomyTermInput): Promise<ActionResult<TaxonomyTermDTO>> {
  try {
    const actor = await requireCapability('content.edit', 'write');
    const term = await saveTaxonomyTerm(getDb(), actor, input);
    revalidateTaxonomy(term.scope);
    return ok(term);
  } catch (error) {
    return toActionError(error, 'taxonomy.save');
  }
}

export async function archiveTaxonomyTermAction(input: TaxonomyTermRefInput): Promise<ActionResult<TaxonomyTermDTO>> {
  try {
    const actor = await requireCapability('content.edit', 'write');
    const term = await archiveTaxonomyTerm(getDb(), actor, input);
    revalidateTaxonomy(term.scope);
    return ok(term);
  } catch (error) {
    return toActionError(error, 'taxonomy.archive');
  }
}

export async function restoreTaxonomyTermAction(input: TaxonomyTermRefInput): Promise<ActionResult<TaxonomyTermDTO>> {
  try {
    const actor = await requireCapability('content.edit', 'write');
    const term = await restoreTaxonomyTerm(getDb(), actor, input);
    revalidateTaxonomy(term.scope);
    return ok(term);
  } catch (error) {
    return toActionError(error, 'taxonomy.restore');
  }
}

export async function deleteTaxonomyTermAction(input: TaxonomyTermRefInput): Promise<ActionResult<{ id: string; key: string }>> {
  try {
    const actor = await requireCapability('content.edit', 'write');
    const result = await deleteTaxonomyTerm(getDb(), actor, input);
    revalidateTaxonomy(input.scope);
    return ok(result);
  } catch (error) {
    return toActionError(error, 'taxonomy.delete');
  }
}
