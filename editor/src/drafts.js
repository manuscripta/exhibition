// Exhibition drafts are kept in the curator's browser (IndexedDB) until they
// are downloaded and published. Nothing is sent to a server.
import { createStore, del, get, keys, set } from "idb-keyval";

const store = createStore("manuscripta-exhibition-editor", "drafts");

/** @typedef {{ id: string, manifest: object, updated: string, fileName?: string }} Draft */

export function newDraftId() {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {Promise<Draft[]>} newest first */
export async function listDrafts() {
  const ids = await keys(store);
  const drafts = await Promise.all(ids.map((id) => get(id, store)));
  return drafts.filter(Boolean).sort((a, b) => b.updated.localeCompare(a.updated));
}

/** @returns {Promise<Draft | undefined>} */
export function getDraft(id) {
  return get(id, store);
}

export async function saveDraft(id, manifest, extra = {}) {
  const existing = (await get(id, store)) || {};
  const draft = { ...existing, ...extra, id, manifest, updated: new Date().toISOString() };
  await set(id, draft, store);
  return draft;
}

export function deleteDraft(id) {
  return del(id, store);
}
