// Shared across index.html and collections.html.
// Requires auth.js + favorites.js to be loaded first.

function coverUrl(identifier) {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

function detailsUrl(identifier) {
  return `https://archive.org/details/${encodeURIComponent(identifier)}`;
}

function embedUrl(identifier) {
  return `https://archive.org/embed/${encodeURIComponent(identifier)}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function cardHtml(doc) {
  const title = doc.title || doc.identifier;
  const year = doc.year ? `<span class="tag">${escapeHtml(doc.year)}</span>` : '';
  let subjects = doc.subject;
  if (subjects && !Array.isArray(subjects)) subjects = [subjects];
  const maxSubjects = year ? 1 : 2;
  const tagHtml = (subjects || []).slice(0, maxSubjects)
    .map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('');

  const isFav = favoritedIds.has(doc.identifier);

  return `
    <div class="card" role="button" tabindex="0" data-id="${escapeHtml(doc.identifier)}" data-title="${escapeHtml(title)}">
      <div class="card-cover">
        <img loading="lazy" src="${coverUrl(doc.identifier)}" alt="${escapeHtml(title)} cover" onerror="this.closest('.card').remove()">
        <button type="button" class="card-fav-btn${isFav ? ' active' : ''}" data-fav-id="${escapeHtml(doc.identifier)}" data-fav-title="${escapeHtml(title)}" aria-label="Favorite">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 21s-6.7-4.35-9.3-8.1C.9 10.2 1.6 6.6 4.6 5.1c2.3-1.1 4.7-.3 6 1.5l1.4 1.9 1.4-1.9c1.3-1.8 3.7-2.6 6-1.5 3 1.5 3.7 5.1 1.9 7.8C18.7 16.65 12 21 12 21Z"/></svg>
        </button>
        <div class="card-overlay">
          <div class="card-overlay-text">${escapeHtml(title)}</div>
        </div>
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(title)}</p>
        <div class="card-meta">${year}${tagHtml}</div>
      </div>
    </div>
  `;
}

function skeletonHtml() {
  return `<div class="card"><div class="card-cover skeleton"></div><div class="card-body"><div class="skeleton" style="height:12px;width:80%;border-radius:4px;margin-bottom:6px;"></div><div class="skeleton" style="height:10px;width:40%;border-radius:4px;"></div></div></div>`;
}

// Wires up card click (open reader) + favorite button click for any grid container
function attachCardInteractions(container) {
  container.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.card-fav-btn');
    if (favBtn) {
      e.stopPropagation();
      handleFavoriteClick(favBtn);
      return;
    }
    const card = e.target.closest('.card');
    if (!card) return;
    openReader(card.dataset.id, card.dataset.title);
  });

  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    openReader(card.dataset.id, card.dataset.title);
  });

  onFavoritesChange(() => {
    container.querySelectorAll('.card-fav-btn').forEach(btn => {
      btn.classList.toggle('active', favoritedIds.has(btn.dataset.favId));
    });
  });
}

// Favoriting and organizing into collections are one motion: clicking the
// heart favorites the magazine (if not already) and opens the collection
// picker so the user can immediately save it somewhere specific.
async function handleFavoriteClick(btn) {
  if (!currentUser) {
    openAuthModal();
    return;
  }
  const id = btn.dataset.favId;
  const title = btn.dataset.favTitle;
  // Routed through ensureFavorited (not favorites.js's toggleFavorite) so the
  // collections store's favoriteIdByArchiveId cache is populated immediately —
  // otherwise checking a collection right after would look up a stale/missing
  // favorite id and silently fail to link it.
  if (!favoritedIds.has(id)) {
    await ensureFavorited(id, title);
  }
  openCollectPopover(btn, id, title);
}

// Collection picker popover: a single reusable element, repositioned and
// re-rendered next to whichever card's favorite button was clicked.
const collectPopover = document.createElement('div');
collectPopover.className = 'collect-popover';
collectPopover.hidden = true;
document.body.appendChild(collectPopover);
let collectPopoverArchiveId = null;
let collectPopoverTitle = null;
let collectPopoverAnchor = null;

function renderCollectPopover() {
  const membership = getMembership(collectPopoverArchiveId);
  const list = userCollections.map(c => `
    <label class="collect-popover-row">
      <input type="checkbox" data-collection-id="${c.id}" ${membership.has(c.id) ? 'checked' : ''}>
      <span>${escapeHtml(c.name)}</span>
    </label>
  `).join('');

  collectPopover.innerHTML = `
    <div class="collect-popover-header">
      <span class="collect-popover-title">Save to collection</span>
      <button type="button" class="collect-popover-close" id="collectPopoverClose" aria-label="Close">&times;</button>
    </div>
    ${userCollections.length ? `<div class="collect-popover-list">${list}</div>` : `<p class="collect-popover-empty">You don't have any collections yet.</p>`}
    <form class="collect-popover-new" id="collectPopoverForm">
      <input type="text" id="collectPopoverInput" placeholder="New collection…" maxlength="60" autocomplete="off">
      <button type="submit" aria-label="Create collection">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </form>
    <div class="collect-popover-footer">
      <button type="button" class="collect-popover-remove" id="collectPopoverRemove">Remove from favorites</button>
      <button type="button" class="collect-popover-done" id="collectPopoverDone">Done</button>
    </div>
  `;

  collectPopover.querySelector('#collectPopoverClose').addEventListener('click', closeCollectPopover);
  collectPopover.querySelector('#collectPopoverDone').addEventListener('click', closeCollectPopover);

  collectPopover.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      await toggleCollectionMembership(collectPopoverArchiveId, collectPopoverTitle, cb.dataset.collectionId);
      cb.disabled = false;
    });
  });

  const form = collectPopover.querySelector('#collectPopoverForm');
  const input = collectPopover.querySelector('#collectPopoverInput');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    input.disabled = true;
    const { data, error } = await createCollection(name);
    if (!error && data) {
      await toggleCollectionMembership(collectPopoverArchiveId, collectPopoverTitle, data.id);
    }
    renderCollectPopover();
  });

  collectPopover.querySelector('#collectPopoverRemove').addEventListener('click', async () => {
    const archiveId = collectPopoverArchiveId;
    const result = await toggleFavorite(archiveId, collectPopoverTitle);
    if (!result.error) {
      delete favoriteIdByArchiveId[archiveId];
      delete membershipByArchiveId[archiveId];
      notifyCollectionsChange();
      closeCollectPopover();
    }
  });
}

function openCollectPopover(anchorEl, archiveId, title) {
  collectPopoverArchiveId = archiveId;
  collectPopoverTitle = title;
  collectPopoverAnchor = anchorEl;
  renderCollectPopover();
  collectPopover.hidden = false;
  positionCollectPopover();
}

function positionCollectPopover() {
  if (!collectPopoverAnchor) return;
  const rect = collectPopoverAnchor.getBoundingClientRect();
  const popRect = collectPopover.getBoundingClientRect();
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 8;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - popRect.width - 12;
  if (left > maxLeft) left = maxLeft;
  if (left < 12) left = 12;
  collectPopover.style.left = left + 'px';
  collectPopover.style.top = top + 'px';
}

function closeCollectPopover() {
  collectPopover.hidden = true;
  collectPopoverArchiveId = null;
  collectPopoverAnchor = null;
}

document.addEventListener('click', (e) => {
  if (!collectPopover.hidden && !collectPopover.contains(e.target) && !e.target.closest('.card-fav-btn')) {
    closeCollectPopover();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !collectPopover.hidden) closeCollectPopover();
});
onCollectionsChange(() => {
  if (!collectPopover.hidden) renderCollectPopover();
});

// Theme toggle
const themeToggle = document.getElementById('themeToggle');
const themeIconSun = document.getElementById('themeIconSun');
const themeIconMoon = document.getElementById('themeIconMoon');

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIconSun.hidden = true;
    themeIconMoon.hidden = false;
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeIconSun.hidden = false;
    themeIconMoon.hidden = true;
  }
}

let savedTheme = 'dark';
try {
  savedTheme = localStorage.getItem('zinebin-theme') || 'dark';
} catch (e) {}
applyTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem('zinebin-theme', next); } catch (e) {}
});

// Reader overlay
const readerOverlay = document.getElementById('readerOverlay');
const readerFrame = document.getElementById('readerFrame');
const readerTitle = document.getElementById('readerTitle');
const readerExternal = document.getElementById('readerExternal');
const readerClose = document.getElementById('readerClose');

function openReader(identifier, title) {
  readerTitle.textContent = title;
  readerExternal.href = detailsUrl(identifier);
  readerFrame.src = embedUrl(identifier);
  readerOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeReader() {
  readerOverlay.hidden = true;
  readerFrame.src = '';
  document.body.style.overflow = '';
}

readerClose.addEventListener('click', closeReader);
readerOverlay.addEventListener('click', (e) => {
  if (e.target === readerOverlay) closeReader();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !readerOverlay.hidden) closeReader();
});

// Auth UI (sign-in modal + account menu)
const signInBtn = document.getElementById('signInBtn');
const accountMenu = document.getElementById('accountMenu');
const accountTrigger = document.getElementById('accountTrigger');
const accountPanel = document.getElementById('accountPanel');
const accountAvatar = document.getElementById('accountAvatar');
const accountEmail = document.getElementById('accountEmail');
const signOutBtn = document.getElementById('signOutBtn');

const authOverlay = document.getElementById('authOverlay');
const authClose = document.getElementById('authClose');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const emailAuthForm = document.getElementById('emailAuthForm');
const authEmailInput = document.getElementById('authEmailInput');
const authNote = document.getElementById('authNote');

function openAuthModal() {
  authNote.textContent = '';
  authOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  authOverlay.hidden = true;
  document.body.style.overflow = '';
}

authClose.addEventListener('click', closeAuthModal);
authOverlay.addEventListener('click', (e) => {
  if (e.target === authOverlay) closeAuthModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !authOverlay.hidden) closeAuthModal();
});

signInBtn.addEventListener('click', openAuthModal);

googleSignInBtn.addEventListener('click', () => {
  signInWithGoogle();
});

emailAuthForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = authEmailInput.value.trim();
  if (!email) return;
  authNote.textContent = 'Sending link…';
  const { error } = await signInWithEmail(email);
  authNote.textContent = error
    ? 'Something went wrong. Please try again.'
    : `Check ${email} for a sign-in link.`;
});

accountTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  accountPanel.hidden = !accountPanel.hidden;
});

document.addEventListener('click', (e) => {
  if (!accountPanel.hidden && !accountMenu.contains(e.target)) {
    accountPanel.hidden = true;
  }
});

signOutBtn.addEventListener('click', () => {
  accountPanel.hidden = true;
  signOut();
});

onAuthChange((user) => {
  if (user) {
    signInBtn.hidden = true;
    accountMenu.hidden = false;
    const label = user.email || '';
    accountAvatar.textContent = label ? label[0] : '?';
    accountEmail.textContent = label;
    closeAuthModal();
  } else {
    signInBtn.hidden = false;
    accountMenu.hidden = true;
    accountPanel.hidden = true;
  }
});

// "My Collections" links (topnav, footer) require an account. When signed
// out, open the sign-in modal on the current page instead of navigating —
// same idea as clicking a favorite heart while signed out.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href="collections.html"]');
  if (!link || currentUser) return;
  e.preventDefault();
  openAuthModal();
});
