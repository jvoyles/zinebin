const ROWS_PER_PAGE = 36;

const state = {
  term: "",
  categories: new Set(),
  page: 1,
  loading: false,
  done: false,
};

const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const loadMoreBtn = document.getElementById("loadMore");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
const chipbar = document.getElementById("chipbar");

function buildQuery() {
  const parts = ['collection:(magazine_rack)', 'mediatype:(texts)'];
  if (state.term.trim()) {
    const escaped = state.term.trim().replace(/"/g, '\\"');
    parts.push(`title:(${escaped})`);
  }
  if (state.categories.size) {
    const catQuery = [...state.categories].map(c => `subject:(${c})`).join(' OR ');
    parts.push(`(${catQuery})`);
  }
  return parts.join(' AND ');
}

function buildUrl() {
  const q = encodeURIComponent(buildQuery());
  const fields = ['identifier', 'title', 'year', 'subject', 'creator', 'downloads']
    .map(f => `fl[]=${f}`).join('&');
  const sort = state.term.trim() ? '' : `&sort[]=downloads+desc`;
  return `https://archive.org/advancedsearch.php?q=${q}&${fields}${sort}&rows=${ROWS_PER_PAGE}&page=${state.page}&output=json`;
}

async function loadPage(reset) {
  if (state.loading || state.done) return;
  state.loading = true;
  loadMoreBtn.hidden = true;
  statusEl.textContent = '';

  const skeletons = [];
  for (let i = 0; i < 12; i++) skeletons.push(skeletonHtml());
  const skelWrap = document.createElement('div');
  skelWrap.className = 'grid';
  skelWrap.id = 'skelWrap';
  skelWrap.innerHTML = skeletons.join('');
  skelWrap.style.marginTop = reset ? '0' : '18px';
  grid.after(skelWrap);

  try {
    const res = await fetch(buildUrl());
    const data = await res.json();
    const docs = (data.response && data.response.docs) || [];

    skelWrap.remove();

    if (reset) grid.innerHTML = '';

    if (docs.length === 0 && state.page === 1) {
      statusEl.textContent = 'No magazines found. Try a different search or category.';
      state.done = true;
      state.loading = false;
      return;
    }

    grid.insertAdjacentHTML('beforeend', docs.map(cardHtml).join(''));

    if (docs.length < ROWS_PER_PAGE) {
      state.done = true;
      loadMoreBtn.hidden = true;
      statusEl.textContent = "That's everything for this view.";
    } else {
      loadMoreBtn.hidden = false;
    }
  } catch (err) {
    skelWrap.remove();
    statusEl.textContent = 'Something went wrong loading magazines. Please try again.';
    console.error(err);
  }

  state.loading = false;
}

function resetAndLoad() {
  state.page = 1;
  state.done = false;
  loadPage(true);
}

let debounceTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  searchClear.hidden = !searchInput.value;
  debounceTimer = setTimeout(() => {
    state.term = searchInput.value;
    resetAndLoad();
  }, 400);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.hidden = true;
  state.term = '';
  resetAndLoad();
});

const categoryDropdown = document.getElementById('categoryDropdown');
const categoryTrigger = document.getElementById('categoryTrigger');
const categoryPanel = document.getElementById('categoryPanel');
const categoryLabel = document.getElementById('categoryLabel');
const categoryCount = document.getElementById('categoryCount');

function toggleCategoryPanel(force) {
  const open = force !== undefined ? force : categoryPanel.hidden;
  if (open) revealOverlay(categoryPanel);
  else dismissOverlay(categoryPanel, 160);
  categoryDropdown.classList.toggle('open', open);
  categoryTrigger.setAttribute('aria-expanded', String(open));
}

categoryTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCategoryPanel();
});

document.addEventListener('click', (e) => {
  if (!categoryPanel.hidden && !categoryDropdown.contains(e.target)) {
    toggleCategoryPanel(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !categoryPanel.hidden) toggleCategoryPanel(false);
});

function updateCategoryLabel() {
  const n = state.categories.size;
  categoryLabel.textContent = 'Industry';
  categoryTrigger.classList.toggle('has-active', n > 0);
  categoryCount.hidden = n === 0;
  categoryCount.textContent = String(n);
}

chipbar.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const cat = chip.dataset.cat || '';

  if (cat === '') {
    state.categories.clear();
  } else if (state.categories.has(cat)) {
    state.categories.delete(cat);
  } else {
    state.categories.add(cat);
  }

  const allChip = chipbar.querySelector('.chip[data-cat=""]');
  allChip.classList.toggle('active', state.categories.size === 0);
  chipbar.querySelectorAll('.chip[data-cat]:not([data-cat=""])').forEach(c => {
    c.classList.toggle('active', state.categories.has(c.dataset.cat));
  });

  updateCategoryLabel();
  resetAndLoad();
});

loadMoreBtn.addEventListener('click', () => {
  state.page += 1;
  loadPage(false);
});

attachCardInteractions(grid);

// Pre-fill search when arriving via a shared/search-engine link (?q=...)
const qParam = new URLSearchParams(window.location.search).get('q');
if (qParam) {
  searchInput.value = qParam;
  searchClear.hidden = !qParam;
  state.term = qParam;
}

// Pre-select an industry filter when arriving via a footer category link
const industryParam = new URLSearchParams(window.location.search).get('industry');
if (industryParam) {
  const chip = chipbar.querySelector(`.chip[data-cat="${CSS.escape(industryParam)}"]`);
  if (chip) {
    state.categories.add(industryParam);
    chipbar.querySelector('.chip[data-cat=""]').classList.remove('active');
    chip.classList.add('active');
    updateCategoryLabel();
  }
}

resetAndLoad();
initAuth();
