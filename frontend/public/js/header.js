'use strict';

const HEADER_CSS = `
  .site-header { background-color: #ffffff; padding: 0.75rem 2rem; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; position: sticky; top: 0; z-index: 1000; }
  .header-left { flex: 1; display: flex; align-items: center; gap: 1rem; justify-content: flex-start; }
  .header-left h1 { font-size: 1.4rem; margin: 0; }
  .header-left h1 a { color: #333; text-decoration: none; }
  .header-center { flex: 0 0 400px; position: relative; }
  .search-input { width: 100%; padding: 0.5rem 1.2rem; border: 1px solid #e0e0e0; border-radius: 20px; font-size: 0.9rem; outline: none; transition: all 0.2s; background-color: #f8f9fa; }
  .search-input:focus { border-color: #aaa; background-color: #fff; }
  .header-right { flex: 1; display: flex; align-items: center; gap: 1rem; justify-content: flex-end; }
  .header-user-link { display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: #333; font-weight: 500; font-size: 0.9rem; }
  .header-avatar { width: 32px; height: 32px; border-radius: 50%; background: #eee; object-fit: cover; }
  #searchResults { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e0e0e0; border-radius: 8px; margin-top: 0.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 400px; overflow-y: auto; display: none; }
  .search-group-title { font-size: 0.75rem; color: #999; text-transform: uppercase; padding: 0.75rem 1rem 0.25rem; letter-spacing: 0.05em; }
  .search-item { padding: 0.75rem 1rem; display: flex; align-items: center; gap: 0.75rem; cursor: pointer; transition: background 0.2s; }
  .search-item:hover { background: #f5f5f5; }
  .search-item-title { font-size: 0.9rem; font-weight: 500; color: #333; }
  .search-item-meta { font-size: 0.8rem; color: #777; }
`;

function headerSafe(text) {
  const purifier = globalThis.DOMPurify;
  return purifier ? purifier.sanitize(text) : text;
}

function headerInjectStyles() {
  if (document.getElementById('shared-header-styles')) return;
  const style = document.createElement('style');
  style.id = 'shared-header-styles';
  style.textContent = HEADER_CSS;
  document.head.appendChild(style);
}

function headerCreateUserItem(u) {
  const el = document.createElement('div');
  el.className = 'search-item';
  el.innerHTML = `
    <img src="${u.avatar || '/img/default-avatar.png'}" style="width: 24px; height: 24px; border-radius: 50%;">
    <div class="search-item-title">${headerSafe(u.username)}</div>
  `;
  el.onclick = () => (globalThis.location.href = `/profile.html?username=${u.username}`);
  return el;
}

function headerCreatePostItem(p) {
  const el = document.createElement('div');
  el.className = 'search-item';
  const author = p.user?.username || 'Unknown';
  el.innerHTML = `
    <div style="display: flex; flex-direction: column;">
      <div class="search-item-title">${headerSafe(p.title)}</div>
      <div class="search-item-meta">by ${headerSafe(author)}</div>
    </div>
  `;
  el.onclick = () => (globalThis.location.href = `/post.html?id=${p.id}`);
  return el;
}

function headerRenderSection(items, box, title, factory) {
  if (items.length === 0) return 0;
  const t = document.createElement('div');
  t.className = 'search-group-title';
  t.textContent = title;
  box.appendChild(t);
  items.forEach((i) => box.appendChild(factory(i)));
  return items.length;
}

function headerProcessSearch(data) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  box.innerHTML = '';
  const uCount = headerRenderSection(data.users || [], box, 'People', headerCreateUserItem);
  const pCount = headerRenderSection(data.posts || [], box, 'Content', headerCreatePostItem);
  if (uCount + pCount === 0) {
    box.innerHTML = '<div style="padding: 1rem; font-size: 0.9rem; color: #999; text-align: center;">No results found</div>';
  }
  box.style.display = 'block';
}

let headerSearchTimer = null;

function headerOnInput(e) {
  const q = e.target.value.trim();
  const box = document.getElementById('searchResults');
  if (headerSearchTimer) clearTimeout(headerSearchTimer);
  if (q.length < 2) {
    if (box) box.style.display = 'none';
    return;
  }
  headerSearchTimer = setTimeout(() => {
    AuthClient.request(`/api/content/search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => headerProcessSearch(d))
      .catch(() => { if (box) box.style.display = 'none'; });
  }, 300);
}

const AppHeader = {
  init() {
    headerInjectStyles();
    this.render();
    this.bind();
    this.update();
  },
  render() {
    const html = `
      <header class="site-header">
        <div class="header-left">
          <h1><a href="/dashboard.html">42 LMS</a></h1>
          <span style="color: #e0e0e0; font-size: 1.2rem;">|</span>
          <a href="/my-content.html" style="color: #333; text-decoration: none; font-weight: 500; font-size: 0.9rem;">My Content</a>
        </div>
        <div class="header-center">
          <input type="text" id="commonSearchInput" class="search-input" placeholder="Search...">
          <div id="searchResults"></div>
        </div>
        <div class="header-right">
          <a href="/profile.html" class="header-user-link">
            <span id="headerUsername">Loading...</span>
            <img id="headerAvatar" class="header-avatar" src="" alt="">
          </a>
        </div>
      </header>
    `;
    const container = document.getElementById('header-container');
    if (container) container.innerHTML = html;
    else document.body.insertAdjacentHTML('afterbegin', html);
  },
  bind() {
    const input = document.getElementById('commonSearchInput');
    const box = document.getElementById('searchResults');
    if (input) input.addEventListener('input', headerOnInput);
    document.addEventListener('click', (e) => {
      if (input && !input.contains(e.target) && box && !box.contains(e.target)) {
        box.style.display = 'none';
      }
    });
  },
  update() {
    AuthClient.loadUserProfile((u) => {
      const n = document.getElementById('headerUsername');
      const a = document.getElementById('headerAvatar');
      if (n) n.textContent = u.username;
      if (a) a.src = u.avatar || '/img/default-avatar.png';
    });
  }
};

(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppHeader.init());
  } else {
    AppHeader.init();
  }
})();
