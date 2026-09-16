// Requires auth.js to be loaded first (uses `sb` and `currentUser`)

const favoritedIds = new Set();
let favoritesLoaded = false;
const favoriteChangeListeners = [];

function onFavoritesChange(fn) {
  favoriteChangeListeners.push(fn);
}

function notifyFavoritesChange() {
  favoriteChangeListeners.forEach(fn => fn());
}

async function loadFavorites() {
  favoritedIds.clear();
  favoritesLoaded = false;
  if (!currentUser) {
    notifyFavoritesChange();
    return;
  }
  const { data, error } = await sb.from('favorites').select('archive_id').eq('user_id', currentUser.id);
  if (!error && data) {
    data.forEach(row => favoritedIds.add(row.archive_id));
  }
  favoritesLoaded = true;
  notifyFavoritesChange();
}

async function toggleFavorite(archiveId, title) {
  if (!currentUser) return { needsAuth: true };

  if (favoritedIds.has(archiveId)) {
    const { error } = await sb.from('favorites')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('archive_id', archiveId);
    if (!error) {
      favoritedIds.delete(archiveId);
      notifyFavoritesChange();
    }
    return { favorited: false, error };
  } else {
    const { error } = await sb.from('favorites')
      .insert({ user_id: currentUser.id, archive_id: archiveId, title });
    if (!error) {
      favoritedIds.add(archiveId);
      notifyFavoritesChange();
    }
    return { favorited: true, error };
  }
}

onAuthChange(() => {
  loadFavorites();
});
