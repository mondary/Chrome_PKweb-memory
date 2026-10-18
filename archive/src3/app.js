import { allTabs, tabCount, matches, exportText, webURL, emptyState } from './core.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const paths = {
  window: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  archive: '<path d="M4 8v12h16V8M9 12h6"/><rect x="3" y="3" width="18" height="5" rx="1"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  save: '<path d="M12 3v10m-4-4 4 4 4-4M4 12v8h16v-8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  open: '<path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
  moon: '<path d="M20 13A8 8 0 0 1 11 4a8.5 8.5 0 1 0 9 9Z"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  pin: '<path d="m9 3 8 0-1 6 3 3v2h-6v7m0-7H6v-2l3-3V3Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.layers}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.outerHTML = icon(el.dataset.icon));

const demo = new URLSearchParams(location.search).has('demo') && location.protocol !== 'chrome-extension:';
let demoRequest;
let library = emptyState(), windows = [], query = '', busy = false, highlightId = null;
const expanded = new Set();
const previewCache = new Map();
let dialogTrigger, lastUndo, toastTimer;

async function request(type, payload = {}) {
  if (demo) return demoRequest(type, payload);
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error || 'L’extension ne répond pas. Rechargez-la dans chrome://extensions.');
  return response.data;
}
function error(message) {
  const target = $('#dialog').open ? $('#dialog-error') : $('#error');
  target.textContent = message; target.hidden = false;
}
function toast(message, undo) {
  lastUndo = undo || null;
  $('#toast-text').textContent = message || '';
  $('#undo').hidden = !lastUndo;
  $('#toast').hidden = !message;
  clearTimeout(toastTimer);
  if (message) toastTimer = setTimeout(() => $('#toast').hidden = true, 7000);
}
async function run(action) {
  if (busy) return;
  busy = true;
  $('#error').hidden = true;
  if ($('#dialog-error')) $('#dialog-error').hidden = true;
  document.body.setAttribute('aria-busy', 'true');
  try { return await action(); } catch (err) { error(err.message); }
  finally { busy = false; document.body.removeAttribute('aria-busy'); }
}
function domain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function favicon(tab) {
  if (demo) return `<span class="letter-icon" aria-hidden="true">${esc(domain(tab.url).charAt(0).toUpperCase())}</span>`;
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', tab.url); url.searchParams.set('size', '32');
  return `<img class="favicon" src="${esc(url.href)}" width="14" height="14" alt="" loading="lazy">`;
}
const demoPreview = url => {
  const d = domain(url);
  const hue = [...d].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 137 % 360;
  const bar = width => `<rect x="26" y="96" width="${width}" height="16" rx="8" fill="hsl(${hue} 18% 78%)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="275"><rect width="100%" height="100%" fill="hsl(${hue} 32% 92%)"/><rect width="100%" height="58" fill="hsl(${hue} 24% 80%)"/><circle cx="30" cy="29" r="9" fill="hsl(${hue} 30% 65%)"/><rect x="48" y="22" width="120" height="14" rx="7" fill="hsl(${hue} 24% 70%)"/>${bar(180 + hue % 140)}${bar(290).replace('96', '124')}${bar(220).replace('96', '152')}<text x="26" y="236" font-family="monospace" font-size="20" fill="hsl(${hue} 32% 42%)">${d}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
async function previewSource(url) {
  if (demo) return demoPreview(url);
  if (previewCache.has(url)) return previewCache.get(url);
  const { src } = await request('preview', { url });
  previewCache.set(url, src);
  return src;
}
function setPreview(figure, url, caption) {
  if (!figure || figure.dataset.url === url) return;
  figure.dataset.url = url;
  const wanted = url;
  previewSource(url).then(src => {
    if (!figure.isConnected || figure.dataset.url !== wanted) return;
    const box = figure.querySelector('.preview-picture');
    if (src) box.innerHTML = `<img src="${esc(src)}" alt="">`;
    else box.innerHTML = `<span class="preview-message">${icon('image')}Pas encore de capture pour cette page.<br>Visitez-la, puis revenez la survoler.</span>`;
    figure.querySelector('figcaption').textContent = caption || domain(url);
  });
}
function liveSession(win, index) {
  return { ...win, id: `live:${win.id}`, title: `Fenêtre ${index + 1}`, windows: [win], tags: [], note: '' };
}
function stateIcons(tab) {
  return `${tab.pinned ? `<span class="tab-state" title="Épinglé">${icon('pin')}</span>` : ''}${tab.discarded ? `<span class="tab-state" title="En veille">${icon('moon')}</span>` : ''}`;
}
function row(tab, { live = false, sessionId = '', pos = '' } = {}) {
  const link = live
    ? `<button class="tab-link" data-action="focus" data-tab="${tab.id}" data-url="${esc(tab.url)}" title="${esc(tab.url)}">${favicon(tab)}<span class="truncate">${esc(tab.title)}</span></button>`
    : `<a class="tab-link" href="${esc(tab.url)}" target="_blank" rel="noopener noreferrer" data-url="${esc(tab.url)}" title="${esc(tab.url)}">${favicon(tab)}<span class="truncate">${esc(tab.title)}</span>${tab.note ? `<span class="tab-state" title="Note">${icon('edit')}</span>` : ''}</a>`;
  const meta = live
    ? `<span class="meta-cell">${stateIcons(tab)}</span>`
    : `<button class="icon-button note-btn" data-action="note" data-id="${esc(sessionId)}" data-pos="${pos}" aria-label="${tab.note ? 'Modifier la note' : 'Ajouter une note'}" title="${tab.note ? 'Modifier la note' : 'Ajouter une note'}">${icon('edit')}</button>`;
  const close = live
    ? `<button class="row-close" data-action="close-live" data-tab="${tab.id}" data-url="${esc(tab.url)}" aria-label="Fermer cet onglet" title="Fermer cet onglet">${icon('close')}</button>`
    : `<button class="row-close" data-action="remove-link" data-id="${esc(sessionId)}" data-pos="${pos}" data-url="${esc(tab.url)}" aria-label="Retirer ce lien de la session" title="Retirer ce lien">${icon('close')}</button>`;
  return `<div class="tab-row" data-url="${esc(tab.url)}" data-title="${esc(tab.title)}">${link}<span class="domain">${esc(domain(tab.url))}</span>${meta}${close}</div>`;
}
function tabList(session, { live, isOpen }) {
  const parts = [];
  session.windows.forEach((win, wi) => {
    if (session.windows.length > 1 && !live) parts.push(`<p class="window-label">Fenêtre ${wi + 1}</p>`);
    win.tabs.forEach((tab, ti) => parts.push(row(tab, { live, sessionId: session.id, pos: `${wi}:${ti}` })));
  });
  if (live) return parts.join('');
  const total = tabCount(session);
  if (!isOpen && total > 8) {
    const shown = parts.slice(0, 8).join('');
    return `${shown}<button class="expand" data-action="expand" data-id="${esc(session.id)}" aria-expanded="false">${icon('chevron')} Afficher les ${total} onglets</button>`;
  }
  return parts.join('');
}
function sessionBlock(session, { live = false } = {}) {
  const tabs = allTabs(session);
  const isOpen = live || expanded.has(session.id) || !!query || highlightId === session.id;
  const actions = live
    ? `<button data-action="sleep-window" data-id="${session.id}">${icon('moon')} Mettre en veille</button><button data-action="save-window" data-id="${session.windows[0].id}">${icon('save')} Enregistrer</button><button data-action="save-close" data-id="${session.windows[0].id}">${icon('save')} Enregistrer & fermer</button>`
    : `<button data-action="favorite" data-id="${session.id}" aria-pressed="${session.favorite}" aria-label="${session.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}" title="${session.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${icon('star')}</button><button data-action="edit" data-id="${session.id}">${icon('edit')} Modifier</button><button data-action="restore" data-id="${session.id}">${icon('open')} Tout rouvrir</button>`;
  const tools = !live && (isOpen || highlightId === session.id)
    ? `<div class="session-tools"><button data-action="dedupe" data-id="${session.id}">Retirer les doublons</button><button data-action="copy-urls" data-id="${session.id}">Copier les URL</button><button data-action="copy-md" data-id="${session.id}">Markdown</button><button data-action="archive" data-id="${session.id}">${icon('archive')} Archiver</button></div>` : '';
  const info = live
    ? `<p class="live-info">${session.ignored ? `${session.ignored} page(s) interne(s) exclue(s)` : 'Session en cours'} · ${tabs.filter(tab => tab.discarded).length} en veille${session.focused ? ' · fenêtre active' : ''}</p>` : '';
  return `<section class="session ${live ? 'live' : ''} ${highlightId === session.id ? 'highlight' : ''}" data-session="${esc(session.id)}">
    <div class="session-head"><div class="session-heading">${icon(live ? 'window' : session.auto ? 'clock' : 'layers')}<h3>${live ? `<span class="title-label">${esc(session.title)}</span>` : `<button data-action="toggle" data-id="${esc(session.id)}" aria-expanded="${isOpen}"><span class="title-label">${esc(session.title)}</span></button>`}<span class="session-count">${tabs.length}</span></h3></div><div class="session-actions">${actions}</div></div>
    <div class="session-body">
      <figure class="preview"><button class="preview-picture" data-action="highlight" data-id="${esc(session.id)}" aria-pressed="${highlightId === session.id}" aria-label="Agrandir l’aperçu et afficher les options" title="Agrandir l’aperçu"></button><figcaption></figcaption></figure>
      <div class="tab-list">${tabList(session, { live, isOpen })}${session.note && !live ? `<p class="session-note">${esc(session.note)}</p>` : ''}${tools}${info}</div>
    </div>
  </section>`;
}
function dateLabel(timestamp) {
  const date = new Date(timestamp), now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Aujourd’hui';
  now.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function dayHeading(label, total) {
  return `<h2 class="day-heading"><span>${esc(label)}</span><span class="rule"></span><span class="total">${total}</span></h2>`;
}
function render() {
  const liveWindows = query ? [] : windows.map(liveSession).filter(session => tabCount(session));
  const sessions = library.sessions.filter(session => !session.archived && !session.auto && matches(session, query))
    .sort((a, b) => b.createdAt - a.createdAt);
  let html = '';
  if (liveWindows.length) {
    html += dayHeading('En cours', `${liveWindows.length} fenêtre${liveWindows.length > 1 ? 's' : ''}`);
    html += liveWindows.map(session => sessionBlock(session, { live: true })).join('');
  }
  let previous;
  for (const session of sessions) {
    const day = dateLabel(session.createdAt);
    if (day !== previous) {
      const group = sessions.filter(s => dateLabel(s.createdAt) === day);
      html += dayHeading(day, `${group.length} session${group.length > 1 ? 's' : ''}`);
      previous = day;
    }
    html += sessionBlock(session);
  }
  $('#results').innerHTML = html || `<p class="empty"><strong>${query ? 'Aucun résultat' : 'Rien d’enregistré pour l’instant'}</strong>${query ? 'Essayez un titre, un domaine ou une note.' : 'Vos fenêtres ouvertes et vos prochaines sessions apparaîtront ici.'}</p>`;
  $('#results').setAttribute('aria-busy', 'false');
  if (highlightId) document.body.dataset.highlight = highlightId; else delete document.body.dataset.highlight;
  const theme = library.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : library.settings.theme;
  document.documentElement.dataset.theme = theme;
  $('#save-status').textContent = library.settings.autosave ? 'Sauvegarde automatique · toutes les 5 min' : 'Sauvegarde automatique désactivée';
  for (const figure of document.querySelectorAll('.preview')) {
    const block = figure.closest('.session');
    const first = block.querySelector('.tab-row');
    if (first) setPreview(figure, first.dataset.url, first.dataset.title);
  }
}
async function refresh() {
  const result = await request('get');
  library = result.library; windows = result.windows;
  render();
}
function sessionById(id) {
  const item = library.sessions.find(session => session.id === id);
  if (!item) throw new Error('Session introuvable. Actualisez la page.');
  return item;
}
function closeDialog() { $('#dialog').close(); }
function showDialog(title, content) {
  const dialog = $('#dialog');
  if (!dialog.open) dialogTrigger = document.activeElement;
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title" tabindex="-1">${esc(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="Fermer" title="Fermer">${icon('close')}</button></div><div id="dialog-error" class="error" role="alert" hidden></div>${content}`;
  if (!dialog.open) dialog.showModal();
  (dialog.querySelector('[autofocus]') || $('#dialog-title')).focus();
}
$('#dialog').addEventListener('close', () => { if (dialogTrigger?.isConnected) dialogTrigger.focus(); });
const formFooter = label => `<div class="dialog-footer"><button type="button" data-action="close-dialog">Annuler</button><button class="primary" type="submit">${label}</button></div>`;
function editDialog(session) {
  showDialog('Modifier la session', `<form id="edit-form"><div class="form-fields"><label class="field">Nom<input name="title" required maxlength="160" value="${esc(session.title)}" autofocus></label><label class="field">Tags<input name="tags" value="${esc(session.tags.join(', '))}" placeholder="Travail, Lecture"><small>Séparés par des virgules · 12 maximum</small></label><label class="field">Note<textarea name="note" maxlength="4000">${esc(session.note)}</textarea></label></div>${formFooter('Enregistrer')}</form>`);
  $('#edit-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    run(async () => {
      const result = await request('edit', { id: session.id, revision: session.updatedAt, changes: { title: data.get('title'), tags: data.get('tags').split(','), note: data.get('note') } });
      closeDialog(); await refresh(); toast(result.message);
    });
  });
}
function noteDialog(session, pos) {
  const [wi, ti] = pos.split(':').map(Number);
  const tab = session.windows[wi]?.tabs[ti];
  if (!tab) throw new Error('Ligne introuvable. Actualisez la page.');
  const next = structuredClone(session);
  showDialog('Note', `<p class="dialog-description">${esc(tab.title)}</p><form id="note-form"><label class="field">Votre note<textarea name="note" maxlength="4000" autofocus>${esc(tab.note || '')}</textarea></label>${formFooter('Enregistrer')}</form>`);
  $('#note-form').addEventListener('submit', event => {
    event.preventDefault();
    next.windows[wi].tabs[ti].note = new FormData(event.target).get('note');
    run(async () => {
      const result = await request('tabs', { id: session.id, revision: session.updatedAt, windows: next.windows });
      closeDialog(); await refresh(); toast(result.message);
    });
  });
}
function newDialog() {
  showDialog('Nouvelle session', `<form id="new-form"><div class="form-fields"><label class="field">Nom<input name="title" required maxlength="160" placeholder="Ma session" autofocus></label><label class="field">Liens<textarea name="urls" required placeholder="https://exemple.com" aria-describedby="urls-help"></textarea><small id="urls-help">Une URL http ou https par ligne.</small></label></div>${formFooter('Créer')}</form>`);
  $('#new-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    run(async () => {
      const urls = data.get('urls').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (urls.some(url => !webURL(url))) throw new Error('Chaque ligne doit être une URL http ou https valide.');
      const result = await request('create', { session: { title: data.get('title'), windows: [{ tabs: urls.map(url => ({ url, title: domain(url) })) }] } });
      closeDialog(); expanded.add(result.id); await refresh(); toast(result.message);
    });
  });
}
function settingsDialog() {
  const settings = library.settings;
  const archived = library.sessions.filter(session => session.archived);
  showDialog('Réglages & sauvegardes', `<form id="settings-form"><div class="form-fields"><label class="check-label"><input name="autosave" type="checkbox" ${settings.autosave ? 'checked' : ''}><span>Sauvegarde automatique<br><small>Toutes les 5 minutes · 20 versions distinctes · aucune fermeture d’onglet</small></span></label><label class="check-label"><input name="previews" type="checkbox" ${settings.previews ? 'checked' : ''}><span>Captures des pages visitées<br><small>Prises localement à l’affichage d’une page · conservées 30 jours sur cet appareil · jamais envoyées à un service externe</small></span></label><label class="field">Mettre en veille les onglets inactifs<select name="sleepMinutes">${[[0, 'Jamais'], [15, 'Après 15 minutes'], [30, 'Après 30 minutes'], [60, 'Après 1 heure']].map(([value, label]) => `<option value="${value}" ${settings.sleepMinutes === value ? 'selected' : ''}>${label}</option>`).join('')}</select><small>Onglets actifs, épinglés et audibles exclus. Enregistrez vos formulaires avant d’activer.</small></label><label class="field">Apparence<select name="theme">${[['light', 'Clair'], ['dark', 'Sombre'], ['system', 'Comme le système']].map(([value, label]) => `<option value="${value}" ${settings.theme === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>${formFooter('Enregistrer')}</form>
  <section class="settings-section"><h3>Sauvegardes</h3><p>Le stockage local dépend du navigateur : exportez régulièrement vos sessions, l’import ajoute sans écraser.</p><div class="session-tools" style="margin-left:0"><button data-action="export">${icon('download')} Exporter le JSON</button><button data-action="snapshot">Sauvegarder maintenant</button></div><label class="field" style="margin-top:16px">Importer une sauvegarde<input id="import-file" type="file" accept=".json,application/json"></label></section>
  <section class="settings-section"><details><summary>Copies archivées (${archived.length})</summary><p>Copies créées avant une modification ou un retrait, et sessions archivées.</p>${archived.map(item => `<div class="recovery-row"><span>${esc(item.title)} · ${new Date(item.createdAt).toLocaleDateString('fr-FR')}</span><button data-action="recover" data-id="${item.id}">Restaurer</button><button data-action="delete-archived" data-id="${item.id}">Supprimer</button></div>`).join('') || '<p>Aucune copie archivée.</p>'}</details></section>
  <section class="settings-section"><h3>Confidentialité</h3><p>Sans compte ni suivi. Les captures sont réalisées par le navigateur sur les pages que vous consultez et restent locales ; l’autorisation « lire et modifier vos données sur tous les sites » sert uniquement à cela. Fenêtres privées et pages internes jamais capturées.</p></section>`);
  $('#settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    run(async () => {
      const result = await request('settings', { settings: { autosave: data.has('autosave'), previews: data.has('previews'), sleepMinutes: Number(data.get('sleepMinutes')), theme: data.get('theme') } });
      closeDialog(); await refresh(); toast(result.message);
    });
  });
  $('#import-file').addEventListener('change', event => run(async () => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error('Le fichier dépasse 10 Mo.');
    let backup; try { backup = JSON.parse(await file.text()); } catch { throw new Error('Le fichier n’est pas un JSON valide.'); }
    const result = await request('import', { backup });
    closeDialog(); await refresh(); toast(result.message);
  }));
}
function downloadBackup() {
  const value = { format: 'pk-sessions', schema: 1, exportedAt: new Date().toISOString(), sessions: library.sessions };
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `sessions-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('Export préparé. Conservez le fichier hors du navigateur.');
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === 'close-dialog') { closeDialog(); return; }
  run(async () => {
    if (action === 'settings') return settingsDialog();
    if (action === 'new') return newDialog();
    if (action === 'export') { await refresh(); return downloadBackup(); }
    if (action === 'save-all') {
      const result = await request('save', { close: false });
      expanded.add(result.id); await refresh(); toast(result.message); return;
    }
    if (action === 'save-window' || action === 'save-close') {
      const result = await request('save', { windowId: Number(id), close: action === 'save-close' });
      expanded.add(result.id); await refresh(); toast(result.message); return;
    }
    if (action === 'expand' || action === 'toggle') {
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      render(); return;
    }
    if (action === 'highlight') { highlightId = highlightId === id ? null : id; render(); return; }
    if (action === 'edit') return editDialog(sessionById(id));
    if (action === 'note') return noteDialog(sessionById(id), target.dataset.pos);
    if (action === 'focus') { await request('focus', { id: Number(target.dataset.tab) }); return; }
    if (action === 'close-live') {
      const result = await request('close-tab', { tabId: Number(target.dataset.tab), expectedURL: target.dataset.url });
      await refresh(); toast(result.message, result.undo); return;
    }
    if (action === 'remove-link') {
      const session = sessionById(id);
      const result = await request('remove-tab', { id, revision: session.updatedAt, position: target.dataset.pos, expectedURL: target.dataset.url });
      await refresh(); toast(result.message, result.undo); return;
    }
    if (action === 'recover') { const result = await request('archive', { id, archived: false }); await refresh(); toast(result.message); settingsDialog(); return; }
    if (action === 'delete-archived') { const result = await request('delete', { id }); await refresh(); toast(result.message); settingsDialog(); return; }
    if (action === 'copy-urls' || action === 'copy-md') {
      await navigator.clipboard.writeText(exportText(sessionById(id), action === 'copy-md'));
      toast('URL copiées.'); return;
    }
    let result;
    if (['favorite', 'archive', 'restore', 'dedupe', 'snapshot'].includes(action)) {
      result = await request(action, { id });
    } else return;
    await refresh();
    toast(result.message);
  });
});
$('#undo').addEventListener('click', () => run(async () => {
  if (!lastUndo) return;
  const result = await request(lastUndo.type, lastUndo.payload);
  lastUndo = null; $('#undo').hidden = true;
  await refresh(); toast(result.message);
}));
const previewFromEvent = event => {
  const rowEl = event.target.closest('.tab-row');
  if (!rowEl) return;
  const figure = rowEl.closest('.session-body')?.querySelector('.preview');
  setPreview(figure, rowEl.dataset.url, rowEl.dataset.title);
};
$('#results').addEventListener('mouseover', previewFromEvent);
$('#results').addEventListener('focusin', previewFromEvent);
$('#search').addEventListener('input', event => { query = event.target.value; render(); });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); $('#search').focus(); $('#search').select();
  }
  if (event.key === 'Escape' && !$('#dialog').open) {
    if (query) { $('#search').value = query = ''; render(); }
    else if (highlightId) { highlightId = null; render(); }
  }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
let refreshTimer;
const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (!busy) run(refresh); }, 300); };
async function init() {
  if (demo) {
    demoRequest = (await import('./tests/demo.mjs')).request;
    $('#demo-banner').hidden = false;
  } else {    if (!globalThis.chrome?.runtime?.id) throw new Error('Chargez src3 dans chrome://extensions, ou ajoutez ?demo à l’URL pour un aperçu fictif.');
    $('#version').textContent = chrome.runtime.getManifest().version_name;
    chrome.storage.onChanged.addListener(scheduleRefresh);
    for (const name of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onAttached', 'onDetached', 'onActivated']) chrome.tabs[name].addListener(scheduleRefresh);
    chrome.windows.onFocusChanged.addListener(scheduleRefresh);
  }
  await refresh();
  if (demo) {
    const params = new URLSearchParams(location.search);
    if (params.has('expand')) { for (const session of library.sessions) expanded.add(session.id); render(); }
    if (params.has('highlight')) {
      const target = library.sessions.find(session => !session.archived && !session.auto);
      if (target) { expanded.add(target.id); highlightId = target.id; render(); }
    }
  }
}
run(init);
