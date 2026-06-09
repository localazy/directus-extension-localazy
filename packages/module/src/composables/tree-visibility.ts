import { AppCollection, Field } from '@directus/types';
import { EnabledField } from '@localazy/directus-common';
import { FieldsUtilsService } from '@localazy/directus-common';

// Pure functions that translate the page-level lens state (ADR-0003) into the
// concrete set of nodes that should be visible in the Import & Export tree.
//
// CollectionItem.vue uses these to decide its own render output; Sync.vue uses
// the same functions to compute the scope-additive Select all / Deselect all
// targets. Same predicates on both sides keep the bulk-action arithmetic in
// lockstep with what the user is looking at.

export type VisibilityContext = {
  isActive: boolean;
  isMatch: (label: string) => boolean;
  allCollections: AppCollection[];
  getFieldsForCollection: (collectionName: string) => { translatableFields: Field[]; allFields: Field[] };
  showUntranslatableField: boolean;
  showUntranslatableCollections: boolean;
  isTranslatableCollection: (collection: AppCollection) => boolean;
};

export function getNestedCollections(collection: AppCollection, ctx: VisibilityContext): AppCollection[] {
  return ctx.allCollections.filter((c) => c.meta?.group === collection.collection);
}

// Field list a collection would render *before* the search lens narrows it,
// honouring the existing `Show untranslatable fields` toggle. Mirror of
// `renderedFields` in CollectionItem.vue.
export function renderedFieldsFor(collection: AppCollection, ctx: VisibilityContext): Field[] {
  const { allFields, translatableFields } = ctx.getFieldsForCollection(collection.collection);
  return ctx.showUntranslatableField ? allFields : translatableFields;
}

export function collectionNameMatches(collection: AppCollection, ctx: VisibilityContext): boolean {
  return ctx.isMatch(collection.name);
}

// Does this subtree contain anything the active lens should reveal? The
// recursion mirrors how CollectionItem.vue renders children; if the lens is
// inactive everything qualifies trivially.
export function subtreeHasMatch(collection: AppCollection, ctx: VisibilityContext): boolean {
  if (!ctx.isActive) return true;
  if (collectionNameMatches(collection, ctx)) return true;
  if (renderedFieldsFor(collection, ctx).some((f) => ctx.isMatch(f.name))) return true;
  return getNestedCollections(collection, ctx).some((child) => subtreeHasMatch(child, ctx));
}

// `inMatchedSubtree` carries the "an ancestor's name matched the lens"
// signal through the recursion. Inside such a subtree the lens is effectively
// off (Q3 / ADR-0003 — a collection-name match reveals every descendant in
// full, including nested collections and their fields).

// Should the collection appear in the tree right now? The pre-lens half is a
// straight port of CollectionItem.vue's `shouldRender`; the lens then prunes
// any branch that has nothing to reveal — unless an ancestor's name matched,
// in which case the lens is silenced for this subtree.
export function isCollectionShown(collection: AppCollection, ctx: VisibilityContext, inMatchedSubtree = false): boolean {
  const nested = getNestedCollections(collection, ctx);
  const baseShown = nested.length > 0 || ctx.isTranslatableCollection(collection) || ctx.showUntranslatableCollections;
  if (!baseShown) return false;
  if (inMatchedSubtree) return true;
  return subtreeHasMatch(collection, ctx);
}

// Which fields the collection renders right now. A collection-name match (or
// any ancestor's name match) shows every field unfiltered; otherwise only
// fields whose own names match the lens.
export function visibleFieldsForCollection(collection: AppCollection, ctx: VisibilityContext, inMatchedSubtree = false): Field[] {
  const rendered = renderedFieldsFor(collection, ctx);
  if (!ctx.isActive || inMatchedSubtree) return rendered;
  if (collectionNameMatches(collection, ctx)) return rendered;
  return rendered.filter((f) => ctx.isMatch(f.name));
}

// Translatable fields among the currently visible ones — the set the
// scope-additive Select all / per-collection checkbox operates on.
export function visibleTranslatableFieldsFor(collection: AppCollection, ctx: VisibilityContext, inMatchedSubtree = false): Field[] {
  return visibleFieldsForCollection(collection, ctx, inMatchedSubtree).filter(FieldsUtilsService.isTranslatableField);
}

// Are this collection's descendants inside a name-matched subtree? True iff an
// ancestor already flagged the subtree as matched, OR this collection's own
// name matches the active lens (in which case its children inherit the flag).
export function descendantsInMatchedSubtree(collection: AppCollection, ctx: VisibilityContext, inMatchedSubtree: boolean): boolean {
  if (inMatchedSubtree) return true;
  return ctx.isActive && collectionNameMatches(collection, ctx);
}

// Flattened {collection, fields[]} list of every visible translatable field in
// the tree rooted at `rootCollections`. Drives the page-level Select all
// union and the master-checkbox indeterminate state under an active lens.
export function buildVisibleTranslatableSelection(rootCollections: AppCollection[], ctx: VisibilityContext): EnabledField[] {
  const out: EnabledField[] = [];
  const walk = (collection: AppCollection, inMatchedSubtree: boolean): void => {
    if (!isCollectionShown(collection, ctx, inMatchedSubtree)) return;
    if (ctx.isTranslatableCollection(collection)) {
      const visible = visibleTranslatableFieldsFor(collection, ctx, inMatchedSubtree);
      if (visible.length > 0) out.push({ collection: collection.collection, fields: visible.map((f) => f.field) });
    }
    const childInSubtree = descendantsInMatchedSubtree(collection, ctx, inMatchedSubtree);
    for (const nested of getNestedCollections(collection, ctx)) walk(nested, childInSubtree);
  };
  for (const root of rootCollections) walk(root, false);
  return out;
}

// Union of two EnabledField lists, merged per collection. Used by `Select all`
// while a lens is active: existing selections in hidden parts of the tree
// must survive the click.
export function unionEnabledFields(a: EnabledField[], b: EnabledField[]): EnabledField[] {
  const map = new Map<string, Set<string>>();
  for (const entry of a) map.set(entry.collection, new Set(entry.fields));
  for (const entry of b) {
    const existing = map.get(entry.collection) ?? new Set<string>();
    for (const f of entry.fields) existing.add(f);
    map.set(entry.collection, existing);
  }
  return [...map.entries()].map(([collection, fields]) => ({ collection, fields: [...fields] }));
}

// Subtract `b` from `a` per-collection; drops collections that end up empty.
// Used by `Deselect all` while a lens is active.
export function subtractEnabledFields(a: EnabledField[], b: EnabledField[]): EnabledField[] {
  const subtract = new Map<string, Set<string>>();
  for (const entry of b) subtract.set(entry.collection, new Set(entry.fields));
  const out: EnabledField[] = [];
  for (const entry of a) {
    const drop = subtract.get(entry.collection);
    if (!drop) {
      out.push(entry);
      continue;
    }
    const remaining = entry.fields.filter((f) => !drop.has(f));
    if (remaining.length > 0) out.push({ collection: entry.collection, fields: remaining });
  }
  return out;
}
