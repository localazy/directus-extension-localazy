# Import & Export tree search is a transient lens; bulk actions scope to it additively

## Context

The Import & Export page (`Sync.vue`) renders a hierarchical tree of Directus collections and their fields, with checkboxes that drive `localazy_content_transfer_setup.enabled_fields`. Two pre-existing visibility toggles (`Show untranslatable fields`, `Show collections without translatable fields`) already narrow the tree. We are adding a text search box to filter the tree further.

The non-obvious design question isn't search itself — it's how search interacts with the bulk-action surface that already lives on this page. The page-level `Select all` / `Deselect all` (in `SyncOptionButtons.vue`) replaces `enabledFields` wholesale today. The per-collection checkbox in `CollectionItem.vue` is a similar "all-or-nothing" toggle scoped to that collection. Once a filter narrows the tree, the meaning of "all" becomes ambiguous: all of the schema, or all of the visible subset?

The obvious code-level reading is "Select all selects all" — keep the global behaviour, let filter be purely visual. The user-level reading is the opposite: "I just narrowed the tree to what I care about; the button labelled `Select all` should now mean `Select all of these`." Diverging on which reading is canonical is what makes this worth recording.

## Decision

1. **Search is a transient lens, not a stored filter.** Input resets on every visit to the page; no URL param, no store. The lens has no concept of "remembering what was hidden" — it recomputes from the current input on every keystroke.

2. **Filter composition is AND across all narrowing controls.** Search composes with both existing visibility toggles. A field hidden by `Show untranslatable fields=OFF` does not become visible because its name matches the search. The empty-state message explicitly mentions the toggles when one is OFF, so a zero-match user has the option of widening the candidate set before reformulating the query.

3. **Match propagation rule:** a node is shown if it matches _or_ any descendant matches; a node matched by its own name shows all its descendants in full (a collection-name match isn't allowed to also filter the fields inside, because the user's intent at that point is to look at the collection). The Translation strings row participates in the filter on equal footing with collection rows.

4. **Bulk actions scope to the lens, additively.** While a non-empty search input is active:
   - Page-level `Select all` adds every _visible_ translatable field to `enabledFields` without touching selections in hidden collections. Page-level `Deselect all` removes only visible fields.
   - The per-collection checkbox in `CollectionItem.vue` toggles only the _visible_ translatable fields of that collection. Its `model-value` and `indeterminate` state are computed against the visible subset.
   - When the input is empty, both bulk actions revert to their existing global / collection-scoped semantics.

   The additive rule is load-bearing — replacing wholesale would let a filtered `Select all` silently wipe selections in the hidden tree, which is the worst possible surprise from a button labelled `Select all`.

5. **Expansion state is owned by the lens while it's active.** Each keystroke recomputes which nodes are shown and auto-expands all of them, including ancestors of any deep match. Manual collapses during the filter don't survive the next recompute. On clear, the tree reverts to its pre-filter expansion state — the lens is removed and what was underneath is restored verbatim.

## Consequences

- `EnabledFieldsService` (the consumer of `enabledFields`) is unaffected — selection state remains a flat list of `{ collection, fields[] }`. The lens lives entirely in the view layer.
- The per-collection checkbox in `CollectionItem.vue` gains a "visible subset" notion that today's code doesn't have. Its `localSelections`, `someTranslatableFieldsChecked`, and `allTranslatableFieldsChecked` computeds need a filtered-fields input alongside the existing full-collection inputs. The structural test (`AutomationForm.structure.test.ts` is unrelated; we'll need new tests in `Sync.vue`'s neighbourhood covering visible-subset toggle semantics).
- The "filter as a lens" framing closes the door on a "saved filters" or "filter presets" feature in this page later. If that becomes a real need, it would have to be a stored-filter feature distinct from this transient search.
- The pre-filter expansion snapshot is held in component-local state — it dies on unmount, which is fine because the lens itself dies on unmount.
- A future user complaint of "I filtered, hit `Select all`, and it didn't select the rest of my collections" is the design working as intended; the answer is to clear the filter first. The button copy stays `Select all`, not `Select all visible`, because the latter is verbose for the 90% case where no filter is active.
