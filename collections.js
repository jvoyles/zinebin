const signedOutState = document.getElementById('signedOutState');
const collectionsMain = document.getElementById('collectionsMain');
const signInBtnInline = document.getElementById('signInBtnInline');
const allFavoritesBtn = document.getElementById('allFavoritesBtn');
const allFavCount = document.getElementById('allFavCount');
const collectionsListEl = document.getElementById('collectionsList');
const newCollectionBtn = document.getElementById('newCollectionBtn');
const activeCollectionName = document.getElementById('activeCollectionName');
const deleteCollectionBtn = document.getElementById('deleteCollectionBtn');
const favGrid = document.getElementById('favGrid');
const favEmpty = document.getElementById('favEmpty');

let userFavorites = []; // full favorite rows ({id, archive_id, title}), for this page's grid
let activeCollectionId = null; // null = All Favorites

signInBtnInline.addEventListener('click', openAuthModal);

// This page requires an account: if someone dismisses the sign-in modal
// without signing in, send them back to the homepage instead of leaving
// them stranded on an empty gated page.
function backToHomeIfSignedOut() {
  if (!currentUser) window.location.href = 'index.html';
}
authClose.addEventListener('click', backToHomeIfSignedOut);
authOverlay.addEventListener('click', (e) => {
  if (e.target === authOverlay) backToHomeIfSignedOut();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!newCollectionOverlay.hidden) { closeNewCollectionModal(); return; }
  if (!deleteCollectionOverlay.hidden) { closeDeleteCollectionModal(); return; }
  backToHomeIfSignedOut();
});

async function loadFavoritesList() {
  const { data } = await sb.from('favorites')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  userFavorites = data || [];
}

function collectionCounts() {
  const counts = {};
  userCollections.forEach(c => { counts[c.id] = 0; });
  userFavorites.forEach(f => {
    getMembership(f.archive_id).forEach(cid => { counts[cid] = (counts[cid] || 0) + 1; });
  });
  return counts;
}

function renderSidebar() {
  allFavCount.textContent = userFavorites.length;
  allFavoritesBtn.classList.toggle('active', activeCollectionId === null);

  const counts = collectionCounts();
  collectionsListEl.innerHTML = userCollections.map(c => `
    <button type="button" class="collection-item${c.id === activeCollectionId ? ' active' : ''}" data-collection-id="${c.id}">
      <span>${escapeHtml(c.name)}</span>
      <span class="collection-count">${counts[c.id] || 0}</span>
    </button>
  `).join('');
}

function renderContent() {
  let docs;
  if (activeCollectionId === null) {
    activeCollectionName.textContent = 'All Favorites';
    deleteCollectionBtn.hidden = true;
    docs = userFavorites;
  } else {
    const col = userCollections.find(c => c.id === activeCollectionId);
    activeCollectionName.textContent = col ? col.name : '';
    deleteCollectionBtn.hidden = false;
    docs = userFavorites.filter(f => getMembership(f.archive_id).has(activeCollectionId));
  }
  favGrid.innerHTML = docs.map(f => cardHtml({ identifier: f.archive_id, title: f.title })).join('');
  favEmpty.hidden = docs.length > 0;
}

function renderAll() {
  renderSidebar();
  renderContent();
}

allFavoritesBtn.addEventListener('click', () => {
  activeCollectionId = null;
  renderAll();
});

collectionsListEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.collection-item');
  if (!btn) return;
  activeCollectionId = btn.dataset.collectionId;
  renderAll();
});

// New collection modal
const newCollectionOverlay = document.getElementById('newCollectionOverlay');
const newCollectionForm = document.getElementById('newCollectionForm');
const newCollectionInput = document.getElementById('newCollectionInput');
const newCollectionClose = document.getElementById('newCollectionClose');
const newCollectionCancel = document.getElementById('newCollectionCancel');
const newCollectionError = document.getElementById('newCollectionError');
const newCollectionSubmit = document.getElementById('newCollectionSubmit');

function openNewCollectionModal() {
  newCollectionInput.value = '';
  newCollectionError.textContent = '';
  revealOverlay(newCollectionOverlay);
  newCollectionInput.focus();
}
function closeNewCollectionModal() {
  dismissOverlay(newCollectionOverlay, 200);
}

newCollectionBtn.addEventListener('click', openNewCollectionModal);
newCollectionClose.addEventListener('click', closeNewCollectionModal);
newCollectionCancel.addEventListener('click', closeNewCollectionModal);
newCollectionOverlay.addEventListener('click', (e) => {
  if (e.target === newCollectionOverlay) closeNewCollectionModal();
});

newCollectionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newCollectionInput.value.trim();
  if (!name) return;
  newCollectionError.textContent = '';
  newCollectionSubmit.disabled = true;
  newCollectionSubmit.textContent = 'Creating…';
  const { error } = await createCollection(name);
  newCollectionSubmit.disabled = false;
  newCollectionSubmit.textContent = 'Create';
  if (!error) { closeNewCollectionModal(); return; }
  newCollectionError.textContent = "Couldn't create the collection. Try again.";
});

// Delete collection modal
const deleteCollectionOverlay = document.getElementById('deleteCollectionOverlay');
const deleteCollectionMessage = document.getElementById('deleteCollectionMessage');
const deleteCollectionClose = document.getElementById('deleteCollectionClose');
const deleteCollectionCancel = document.getElementById('deleteCollectionCancel');
const deleteCollectionConfirm = document.getElementById('deleteCollectionConfirm');
const deleteCollectionError = document.getElementById('deleteCollectionError');

function closeDeleteCollectionModal() {
  dismissOverlay(deleteCollectionOverlay, 200);
}

deleteCollectionBtn.addEventListener('click', () => {
  if (!activeCollectionId) return;
  const col = userCollections.find(c => c.id === activeCollectionId);
  deleteCollectionMessage.textContent = `"${col ? col.name : 'This collection'}" will be deleted. Magazines stay in your favorites.`;
  deleteCollectionError.textContent = '';
  revealOverlay(deleteCollectionOverlay);
});
deleteCollectionClose.addEventListener('click', closeDeleteCollectionModal);
deleteCollectionCancel.addEventListener('click', closeDeleteCollectionModal);
deleteCollectionOverlay.addEventListener('click', (e) => {
  if (e.target === deleteCollectionOverlay) closeDeleteCollectionModal();
});

deleteCollectionConfirm.addEventListener('click', async () => {
  if (!activeCollectionId) return;
  deleteCollectionError.textContent = '';
  deleteCollectionConfirm.disabled = true;
  deleteCollectionConfirm.textContent = 'Deleting…';
  const { error } = await deleteCollection(activeCollectionId);
  deleteCollectionConfirm.disabled = false;
  deleteCollectionConfirm.textContent = 'Delete';
  if (!error) { closeDeleteCollectionModal(); activeCollectionId = null; return; }
  deleteCollectionError.textContent = "Couldn't delete the collection. Try again.";
});

attachCardInteractions(favGrid);

onFavoritesChange(() => {
  if (!currentUser) return;
  loadFavoritesList().then(renderAll);
});

onCollectionsChange(() => {
  if (!currentUser) return;
  renderAll();
});

onAuthChange((user) => {
  if (user) {
    signedOutState.hidden = true;
    collectionsMain.hidden = false;
    loadFavoritesList().then(renderAll);
  } else {
    signedOutState.hidden = false;
    collectionsMain.hidden = true;
    openAuthModal();
  }
});

initAuth();
