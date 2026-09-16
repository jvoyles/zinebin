// Shared collections data, used by the homepage "add to collection" popover
// and the My Collections page. Requires auth.js + favorites.js first.

let userCollections = []; // [{id, name}]
let favoriteIdByArchiveId = {}; // archive_id -> favorites row id (only present once favorited)
let membershipByArchiveId = {}; // archive_id -> Set(collection_id)
const collectionsChangeListeners = [];

function onCollectionsChange(fn) {
  collectionsChangeListeners.push(fn);
}

function notifyCollectionsChange() {
  collectionsChangeListeners.forEach(fn => fn());
}

function getMembership(archiveId) {
  return membershipByArchiveId[archiveId] || new Set();
}

async function loadUserCollections() {
  if (!currentUser) {
    userCollections = [];
    favoriteIdByArchiveId = {};
    membershipByArchiveId = {};
    notifyCollectionsChange();
    return;
  }

  const [{ data: cols }, { data: favs }, { data: items }] = await Promise.all([
    sb.from('collections').select('*').eq('user_id', currentUser.id).order('created_at'),
    sb.from('favorites').select('*').eq('user_id', currentUser.id),
    sb.from('collection_items').select('collection_id, favorite_id'),
  ]);

  userCollections = cols || [];

  favoriteIdByArchiveId = {};
  const archiveIdByFavoriteId = {};
  (favs || []).forEach(f => {
    favoriteIdByArchiveId[f.archive_id] = f.id;
    archiveIdByFavoriteId[f.id] = f.archive_id;
  });

  membershipByArchiveId = {};
  (items || []).forEach(row => {
    const archiveId = archiveIdByFavoriteId[row.favorite_id];
    if (!archiveId) return;
    if (!membershipByArchiveId[archiveId]) membershipByArchiveId[archiveId] = new Set();
    membershipByArchiveId[archiveId].add(row.collection_id);
  });

  notifyCollectionsChange();
}

async function createCollection(name) {
  const { data, error } = await sb.from('collections').insert({ user_id: currentUser.id, name }).select().single();
  if (!error) await loadUserCollections();
  return { data, error };
}

async function deleteCollection(collectionId) {
  const { error } = await sb.from('collections').delete().eq('id', collectionId);
  if (!error) await loadUserCollections();
  return { error };
}

// Ensures a favorites row exists for this magazine, favoriting it if needed
// (adding to a collection implies favoriting — collection_items references
// the favorites row, not the archive id directly).
//
// The homepage heart button can create a favorites row via favorites.js's
// own toggleFavorite() before this module ever hears about it, so our local
// favoriteIdByArchiveId cache can be stale. If the insert here fails because
// the row already exists (unique constraint on user_id+archive_id), fetch
// the existing row instead of giving up silently.
async function ensureFavorited(archiveId, title) {
  if (favoriteIdByArchiveId[archiveId]) return favoriteIdByArchiveId[archiveId];

  const { data, error } = await sb.from('favorites')
    .insert({ user_id: currentUser.id, archive_id: archiveId, title })
    .select()
    .single();

  if (!error) {
    favoriteIdByArchiveId[archiveId] = data.id;
    if (!favoritedIds.has(archiveId)) {
      favoritedIds.add(archiveId);
      notifyFavoritesChange();
    }
    return data.id;
  }

  const { data: existing, error: fetchError } = await sb.from('favorites')
    .select('id')
    .eq('user_id', currentUser.id)
    .eq('archive_id', archiveId)
    .single();
  if (fetchError || !existing) return null;

  favoriteIdByArchiveId[archiveId] = existing.id;
  if (!favoritedIds.has(archiveId)) {
    favoritedIds.add(archiveId);
    notifyFavoritesChange();
  }
  return existing.id;
}

async function toggleCollectionMembership(archiveId, title, collectionId) {
  if (!currentUser) return { needsAuth: true };

  const favId = await ensureFavorited(archiveId, title);
  if (!favId) return { error: true };

  const has = getMembership(archiveId).has(collectionId);
  if (has) {
    await sb.from('collection_items').delete().eq('collection_id', collectionId).eq('favorite_id', favId);
    membershipByArchiveId[archiveId].delete(collectionId);
  } else {
    await sb.from('collection_items').insert({ collection_id: collectionId, favorite_id: favId });
    if (!membershipByArchiveId[archiveId]) membershipByArchiveId[archiveId] = new Set();
    membershipByArchiveId[archiveId].add(collectionId);
  }
  notifyCollectionsChange();
  return {};
}

onAuthChange(() => {
  loadUserCollections();
});
