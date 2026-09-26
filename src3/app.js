import { allTabs, tabCount, matches, exportText, webURL, emptyState } from './core.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const paths = {
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  archive: '<path d="M4 8v12h16V8M9 12h6"/><rect x="3" y="3" width="18" height="5" rx="1"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  save: '<path d="M12 3v10m-4-4 4 4 4-4M4 12v8h16v-8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',
  open: '<path d="M14 3h7v7m0-7L11 13M10 4H4v16h16v-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
  moon: '<path d="M20 13A8 8 0 0 1 11 4a8.5 8.5 0 1 0 9 9Z"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  pin: '<path d="m9 3 8 0-1 6 3 3v2h-6v7m0-7H6v-2l3-3V3Z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.layers}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.outerHTML = icon(el.dataset.icon));
const demo = new URLSearchParams(location.search).has('demo') && location.protocol !== 'chrome-extension:';
let demoRequest;
let library = emptyState(), windows = [], filter = 'all', query = '', busy = false, detailSnapshot;
let compact = localStorage.getItem('sessions-density') === 'compact';
let dialogTrigger;
const titles = { all: 'Toutes les sessions', live: 'Onglets ouverts', favorites: 'Mes favoris', auto: 'Sauvegardes auto', archive: 'Archives' };

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
let toastTimer;
function toast(message) {
  if (!message) return;
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 6500);
}
async function run(action) {
  if (busy) return;
  busy = true;
  $('#error').hidden = true;
  if ($('#dialog-error')) $('#dialog-error').hidden = true;
  document.body.setAttribute('aria-busy', 'true');
  try { await action(); } catch (err) { error(err.message); }
  finally { busy = false; document.body.removeAttribute('aria-busy'); }
}
function domain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
function favicon(tab) {
  if (demo) return `<span class="letter-icon" aria-hidden="true">${esc(domain(tab.url).charAt(0).toUpperCase())}</span>`;
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', tab.url); url.searchParams.set('size', '32');
  return `<img class="favicon" src="${esc(url.href)}" width="19" height="19" alt="" loading="lazy">`;
}
function button(action, name, glyph, id = '', extra = '') {
  return `<button class="icon-button" data-action="${action}" data-id="${esc(id)}" aria-label="${esc(name)}" title="${esc(name)}" ${extra}>${icon(glyph)}</button>`;
}
function row(tab, liveTab = false) {
  const title = `<span class="truncate">${esc(tab.title)}</span>`;
  const link = liveTab
    ? `<button class="tab-link" data-action="focus" data-tab="${tab.id}" title="${esc(tab.url)}">${favicon(tab)}${title}</button>`
    : `<a class="tab-link" href="${esc(tab.url)}" target="_blank" rel="noopener noreferrer" title="${esc(tab.url)}">${favicon(tab)}${title}</a>`;
  return `<div class="tab-row">${link}<span class="domain">${esc(domain(tab.url))}</span>${tab.pinned ? '<span title="Épinglé">⌖</span>' : ''}${tab.discarded ? '<span title="En veille">☾</span>' : ''}</div>`;
}
function card(session, liveWindow = false) {
  const tabs = allTabs(session);
  const id = session.id;
  const meta = `${tabs.length} onglet${tabs.length > 1 ? 's' : ''}${session.windows.length > 1 ? ` · ${session.windows.length} fenêtres` : ''}`;
  return `<article class="session-card ${liveWindow ? 'live' : ''}">
    <div class="card-head"><div class="card-title"><span class="session-symbol">${icon(liveWindow ? 'window' : session.auto ? 'clock' : 'layers')}</span><div><h3><button class="title-button" data-action="${liveWindow ? 'live-detail' : 'detail'}" data-id="${esc(id)}">${esc(session.title)}</button></h3><div class="card-meta"><span>${meta}</span>${session.tags.map(tag => `<button class="tag" data-action="tag" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}${liveWindow && session.focused ? '<span class="chip">Fenêtre active</span>' : ''}</div></div></div>
    <div class="card-actions">${liveWindow ? button('save-window', 'Enregistrer cette fenêtre', 'save', id) : `${button('favorite', session.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris', 'star', id, `aria-pressed="${session.favorite}"`)}${button('edit', 'Modifier le titre, les tags et la note', 'edit', id)}${button('archive', session.archived ? 'Sortir des archives' : 'Archiver la session', 'archive', id)}<button class="open-button" data-action="restore" data-id="${esc(id)}">${icon('open')} Tout rouvrir</button>`}</div></div>
    <div class="card-body"><div class="tab-mosaic" aria-hidden="true">${tabs.slice(0, 9).map(favicon).join('')}${tabs.length > 9 ? `<span class="chip">+${tabs.length - 9}</span>` : ''}</div><div class="tab-preview">${tabs.slice(0, 4).map(tab => row(tab, liveWindow)).join('')}<button class="more-tabs" data-action="${liveWindow ? 'live-detail' : 'detail'}" data-id="${esc(id)}">${tabs.length > 4 ? `Voir les ${tabs.length} onglets` : 'Ouvrir le détail'} →</button></div></div>
    ${session.note ? `<p class="session-note">${esc(session.note)}</p>` : ''}
    ${liveWindow ? `<div class="live-footer"><span>${session.ignored ? `${session.ignored} page(s) interne(s) exclue(s)` : 'Vos onglets, en direct'} · ${tabs.filter(tab => tab.discarded).length} en veille</span><div class="actions"><button data-action="sleep-window" data-id="${id}">${icon('moon')} Mettre en veille</button><button data-action="save-close" data-id="${id}">${icon('save')} Enregistrer & fermer</button></div></div>` : ''}
  </article>`;
}
function liveSession(win, index) {
  return { ...win, title: `Fenêtre ${index + 1}`, windows: [win], tags: [], note: '' };
}
function section(label, count, liveSection = false) {
  return `<h2 class="section-label ${liveSection ? 'live-label' : ''}">${liveSection ? '<span class="status-dot"></span>' : ''}${esc(label)}<span class="rule"></span><span class="section-count">${count}</span></h2>`;
}
function dateLabel(timestamp) {
  const date = new Date(timestamp), now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Aujourd’hui';
  now.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function renderNav() {
  const sessions = library.sessions.filter(session => !session.archived);
  const counts = { all: sessions.filter(s => !s.auto).length, live: windows.reduce((n, w) => n + w.tabs.length, 0), favorites: sessions.filter(s => s.favorite).length, auto: sessions.filter(s => s.auto).length, archive: library.sessions.filter(s => s.archived).length };
  const icons = { all: 'layers', live: 'window', favorites: 'star', auto: 'clock', archive: 'archive' };
  $('#navigation').innerHTML = Object.entries(titles).map(([key, title]) => `<button data-action="filter" data-filter="${key}" class="${filter === key ? 'active' : ''}" ${filter === key ? 'aria-current="page"' : ''}>${icon(icons[key])}${title}<span class="nav-count">${counts[key]}</span></button>`).join('');
  $('#favorites').innerHTML = sessions.filter(s => s.favorite).map(s => `<button data-action="detail" data-id="${s.id}">${icon('layers')}<span class="truncate">${esc(s.title)}</span></button>`).join('') || '<small>Étoilez une session pour<br>la retrouver ici.</small>';
  const tags = [...new Set(sessions.flatMap(s => s.tags))].sort((a, b) => a.localeCompare(b));
  $('#tags').innerHTML = tags.map(tag => `<button class="${filter === `tag:${tag}` ? 'active' : ''}" data-action="tag" data-tag="${esc(tag)}"><span class="tag-dot"></span><span class="truncate">${esc(tag)}</span><span class="nav-count">${sessions.filter(s => s.tags.includes(tag)).length}</span></button>`).join('') || '<small>Ajoutez des tags à vos collections.</small>';
}
function render() {
  renderNav();
  $('#breadcrumb').textContent = titles[filter] || filter.slice(4);
  $('#page-title').innerHTML = filter === 'all' ? 'Votre navigation,<br>l’esprit libre.' : esc(titles[filter] || `# ${filter.slice(4)}`);
  const descriptions = { live: 'Enregistrez une fenêtre ou mettez ses onglets en veille.', favorites: 'Vos espaces de travail, toujours à portée de main.', auto: 'Un instantané toutes les 5 minutes · 20 versions distinctes conservées.', archive: 'Vos sessions archivées restent disponibles et restaurables.' };
  $('#subtitle').textContent = descriptions[filter] || 'Retrouvez vos onglets. Reprenez là où vous en étiez.';
  const liveWindows = ['all', 'live'].includes(filter) ? windows.map(liveSession).filter(s => tabCount(s) && matches(s, query)) : [];
  const sessions = library.sessions.filter(s => {
    if (!matches(s, query) || filter === 'live') return false;
    if (filter === 'archive') return s.archived;
    if (s.archived) return false;
    if (filter === 'auto') return s.auto;
    if (filter === 'favorites') return s.favorite;
    if (filter.startsWith('tag:')) return s.tags.includes(filter.slice(4));
    return !s.auto;
  }).sort((a, b) => b.createdAt - a.createdAt);
  let html = liveWindows.length ? section('EN CE MOMENT', `${liveWindows.length} fenêtre(s)`, true) + liveWindows.map(s => card(s, true)).join('') : '';
  let previous;
  for (const session of sessions) {
    const day = dateLabel(session.createdAt);
    if (day !== previous) { html += section(day, `${sessions.filter(s => dateLabel(s.createdAt) === day).length} session(s)`); previous = day; }
    html += card(session);
  }
  $('#results').innerHTML = html || `<div class="empty"><strong>${query ? 'Aucun résultat' : 'Un peu d’espace pour vos idées.'}</strong>${query ? 'Essayez un titre, un domaine, un tag ou une note.' : filter === 'auto' ? 'Les prochaines sauvegardes apparaîtront ici. Activez la sauvegarde automatique dans les réglages.' : filter === 'archive' ? 'Les sessions que vous archivez apparaîtront ici.' : 'Enregistrez vos onglets ou créez une collection de liens.'}${!query && ['all', 'favorites'].includes(filter) ? '<br><button data-action="save-all">Enregistrer mes onglets</button>' : ''}</div>`;
  $('#results').classList.toggle('compact', compact);
  $('#results').setAttribute('aria-busy', 'false');
  $('#density').setAttribute('aria-pressed', String(compact));
  $('#density').setAttribute('aria-label', compact ? 'Activer la vue détaillée' : 'Activer la vue compacte');
  document.querySelectorAll('[data-action=favorite]').forEach(el => el.classList.toggle('selected', el.getAttribute('aria-pressed') === 'true'));
  const theme = library.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : library.settings.theme;
  document.documentElement.dataset.theme = theme;
}
async function refresh() {
  const result = await request('get'); library = result.library; windows = result.windows; render();
}
function sessionById(id) {
  const item = library.sessions.find(s => s.id === id);
  if (!item) throw new Error('Session introuvable.');
  return item;
}
function closeDialog() { $('#dialog').close(); }
function showDialog(title, content) {
  const dialog = $('#dialog');
  if (!dialog.open) dialogTrigger = document.activeElement;
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title" tabindex="-1">${esc(title)}</h2>${button('close-dialog', 'Fermer', 'close')}</div><div id="dialog-error" class="error" role="alert" hidden></div>${content}`;
  if (!dialog.open) dialog.showModal();
  (dialog.querySelector('[autofocus]') || $('#dialog-title')).focus();
}
$('#dialog').addEventListener('close', () => { if (dialogTrigger?.isConnected) dialogTrigger.focus(); else $('#search').focus(); });
function formFooter(label) { return `<div class="dialog-footer"><button type="button" data-action="close-dialog">Annuler</button><button class="primary" type="submit">${label}</button></div>`; }
function saveDialog(windowId, close = false, tabIds) {
  const selected = windows.filter(win => windowId == null || win.id === windowId).flatMap(win => win.tabs).filter(tab => !tabIds || tabIds.includes(tab.id));
  if (!selected.length) throw new Error('Aucun onglet web à enregistrer. Les pages internes ne sont pas incluses.');
  showDialog('Enregistrer vos onglets', `<p class="dialog-description">${selected.length} onglet(s) web. Les fenêtres, groupes et onglets épinglés seront conservés dans la session.</p><form id="save-form"><div class="form-fields"><label class="field">Nom de la session<input name="title" maxlength="160" required autofocus value="Session du ${new Date().toLocaleDateString('fr-FR')}"></label><label class="check-label"><input name="close" type="checkbox" ${close ? 'checked' : ''}><span>Fermer les onglets après l’enregistrement<br><small>Les onglets épinglés et ceux dont l’URL a changé restent ouverts.</small></span></label></div>${formFooter('Enregistrer la session')}</form>`);
  $('#save-form').addEventListener('submit', event => {
    event.preventDefault(); const form = new FormData(event.target);
    run(async () => {
      const result = await request('save', { title: form.get('title'), windowId, tabIds, close: form.has('close') });
      closeDialog(); filter = 'all'; await refresh(); toast(result.message);
    });
  });
}
function editDialog(session) {
  showDialog('Modifier la session', `<form id="edit-form"><div class="form-fields"><label class="field">Nom<input name="title" required maxlength="160" value="${esc(session.title)}" autofocus></label><label class="field">Tags<input name="tags" value="${esc(session.tags.join(', '))}" placeholder="Travail, Lecture, Inspiration"><small>Séparés par des virgules · 12 tags maximum</small></label><label class="field">Note<textarea name="note" maxlength="4000" placeholder="Une idée, un contexte pour plus tard…">${esc(session.note)}</textarea></label></div>${formFooter('Enregistrer les modifications')}</form>`);
  $('#edit-form').addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(event.target);
    run(async () => {
      const result = await request('edit', { id: session.id, revision: session.updatedAt, changes: { title: data.get('title'), tags: data.get('tags').split(','), note: data.get('note') } });
      closeDialog(); await refresh(); toast(result.message);
    });
  });
}
function newDialog() {
  showDialog('Nouvelle collection', `<p class="dialog-description">Rassemblez quelques liens, même sans les ouvrir.</p><form id="new-form"><div class="form-fields"><label class="field">Nom<input name="title" required maxlength="160" placeholder="Ma prochaine idée" autofocus></label><label class="field">Liens<textarea name="urls" required placeholder="https://exemple.com&#10;https://autre-site.com" aria-describedby="urls-help"></textarea><small id="urls-help">Une URL http ou https par ligne.</small></label></div>${formFooter('Créer la collection')}</form>`);
  $('#new-form').addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(event.target);
    run(async () => {
      const urls = data.get('urls').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!urls.length || urls.some(url => !webURL(url))) throw new Error('Chaque ligne doit être une URL http ou https valide.');
      const result = await request('create', { session: { title: data.get('title'), windows: [{ tabs: urls.map(url => ({ url, title: domain(url) })) }] } });
      closeDialog(); filter = 'all'; await refresh(); toast(result.message);
    });
  });
}
function detail(session, isLive = false) {
  detailSnapshot = structuredClone(session);
  const targets = library.sessions.filter(s => s.id !== session.id && !s.auto && !s.archived);
  showDialog(session.title, `<p class="dialog-description">${tabCount(session)} onglet(s) · ${session.windows.length} fenêtre(s)${isLive ? ' · sélectionnez les onglets à enregistrer' : ''}</p>
    <div class="detail-toolbar">${isLive ? `<button data-action="detail-save">${icon('save')} Enregistrer la sélection</button>` : `<button data-action="restore" data-id="${session.id}">${icon('open')} Tout rouvrir</button><button data-action="edit" data-id="${session.id}">${icon('edit')} Modifier</button><button data-action="dedupe" data-id="${session.id}">Retirer les doublons exacts</button>`}<button data-action="copy-urls">${icon('copy')} Copier les URL</button><button data-action="copy-md">Markdown</button></div>
    <div class="detail-selection"><label><input type="checkbox" id="select-all" checked> Tout sélectionner</label>${!isLive && targets.length ? `<select id="move-target" aria-label="Collection de destination"><option value="">Déplacer vers…</option>${targets.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select><button data-action="move">Déplacer</button>` : ''}${!isLive ? '<button class="danger" data-action="remove-selected">Retirer la sélection</button>' : ''}</div>
    ${session.windows.map((win, wi) => `<p class="detail-window">Fenêtre ${wi + 1}</p>${win.tabs.map((tab, ti) => `<div class="detail-row"><input class="tab-check" type="checkbox" value="${wi}:${ti}" aria-label="Sélectionner ${esc(tab.title)}" checked><div>${row(tab, isLive)}${tab.note ? `<p class="tab-note">${esc(tab.note)}</p>` : ''}</div>${!isLive ? button('tab-note', 'Modifier la note de cet onglet', 'edit', `${wi}:${ti}`) : ''}</div>`).join('')}`).join('')}
    ${session.note ? `<p class="session-note">${esc(session.note)}</p>` : ''}`);
  $('#select-all').addEventListener('change', event => document.querySelectorAll('.tab-check').forEach(box => box.checked = event.target.checked));
  document.querySelectorAll('.tab-check').forEach(box => box.addEventListener('change', () => {
    const boxes = [...document.querySelectorAll('.tab-check')];
    $('#select-all').checked = boxes.every(b => b.checked);
    $('#select-all').indeterminate = boxes.some(b => b.checked) && !boxes.every(b => b.checked);
  }));
}
const selectedPositions = () => [...document.querySelectorAll('.tab-check:checked')].map(box => box.value);
function selectedSession() {
  const positions = new Set(selectedPositions());
  const selected = { ...detailSnapshot, windows: detailSnapshot.windows.map((win, wi) => ({ tabs: win.tabs.filter((tab, ti) => positions.has(`${wi}:${ti}`)) })).filter(win => win.tabs.length) };
  if (!selected.windows.length) throw new Error('Sélectionnez au moins un onglet.');
  return selected;
}
function noteDialog(position) {
  const session = structuredClone(detailSnapshot), [wi, ti] = position.split(':').map(Number);
  showDialog('Note de l’onglet', `<p class="dialog-description">${esc(session.windows[wi].tabs[ti].title)}</p><form id="note-form"><label class="field">Votre note<textarea name="note" maxlength="4000" autofocus>${esc(session.windows[wi].tabs[ti].note || '')}</textarea></label>${formFooter('Enregistrer la note')}</form>`);
  $('#note-form').addEventListener('submit', event => {
    event.preventDefault(); const note = new FormData(event.target).get('note');
    run(async () => {
      session.windows[wi].tabs[ti].note = note;
      const result = await request('tabs', { id: session.id, revision: session.updatedAt, windows: session.windows });
      await refresh(); detail(sessionById(session.id)); toast(result.message);
    });
  });
}
function downloadBackup() {
  const value = { format: 'pk-sessions', schema: 1, exportedAt: new Date().toISOString(), sessions: library.sessions };
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `sessions-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('Export préparé. Conservez le fichier hors du navigateur.');
}
function settingsDialog() {
  const settings = library.settings;
  showDialog('Réglages & sauvegardes', `<form id="settings-form"><div class="form-fields"><label class="check-label"><input name="autosave" type="checkbox" ${settings.autosave ? 'checked' : ''}><span>Sauvegarder automatiquement les onglets<br><small>Toutes les 5 minutes · 20 versions distinctes · aucune fermeture</small></span></label><label class="field">Mettre en veille les onglets inactifs<select name="sleepMinutes">${[[0, 'Jamais — uniquement à ma demande'], [15, 'Après 15 minutes'], [30, 'Après 30 minutes'], [60, 'Après 1 heure']].map(([value, label]) => `<option value="${value}" ${settings.sleepMinutes === value ? 'selected' : ''}>${label}</option>`).join('')}</select><small>Les onglets actifs, épinglés et audibles sont exclus. Sauvegardez vos formulaires avant d’activer la mise en veille.</small></label><label class="field">Apparence<select name="theme">${[['light', 'Clair'], ['dark', 'Sombre'], ['system', 'Comme le système']].map(([value, label]) => `<option value="${value}" ${settings.theme === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>${formFooter('Enregistrer les réglages')}</form>
    <section class="settings-section"><h3>Vos données, à l’abri</h3><p>Une sauvegarde locale ne remplace pas un fichier externe. Exportez régulièrement vos sessions : désinstaller l’extension efface son stockage. L’import ajoute les sessions, sans écraser les données présentes.</p><div class="actions"><button data-action="export">${icon('download')} Exporter le JSON</button><button data-action="snapshot">Sauvegarder maintenant</button></div><label class="field" style="margin-top:16px">Importer une sauvegarde Sessions<input id="import-file" type="file" accept=".json,application/json"><small>JSON Sessions uniquement · maximum 10 Mo · l’import natif Tablerone n’est pas pris en charge.</small></label></section>
    <section class="settings-section"><h3>Simple. Local. Personnel.</h3><p>Pas de compte, de suivi ou de synchronisation cloud. Les onglets privés et pages internes ne sont pas enregistrés. Les icônes proviennent du cache de Chrome. Les collections sont indépendantes des favoris Chrome.</p><p><strong>Raccourcis :</strong> ⌘ / Ctrl K pour rechercher · ⌘ / Ctrl ⇧ Y pour ouvrir Sessions (modifiable dans chrome://extensions/shortcuts).</p></section>`);
  $('#settings-form').addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(event.target);
    run(async () => {
      const result = await request('settings', { settings: { autosave: data.has('autosave'), sleepMinutes: Number(data.get('sleepMinutes')), theme: data.get('theme') } });
      closeDialog(); await refresh(); toast(result.message);
    });
  });
  $('#import-file').addEventListener('change', event => run(async () => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error('Le fichier dépasse 10 Mo.');
    let backup; try { backup = JSON.parse(await file.text()); } catch { throw new Error('Le fichier n’est pas un JSON valide.'); }
    const result = await request('import', { backup });
    closeDialog(); filter = 'all'; await refresh(); toast(result.message);
  }));
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === 'close-dialog') { closeDialog(); return; }
  run(async () => {
    if (action === 'filter' || action === 'tag') { filter = action === 'tag' ? `tag:${target.dataset.tag}` : target.dataset.filter; render(); return; }
    if (action === 'density') { compact = !compact; localStorage.setItem('sessions-density', compact ? 'compact' : 'full'); render(); return; }
    if (action === 'settings') return settingsDialog();
    if (action === 'new') return newDialog();
    if (action === 'export') { await refresh(); return downloadBackup(); }
    if (action === 'save-all') return saveDialog();
    if (action === 'save-window' || action === 'save-close') return saveDialog(Number(id), action === 'save-close');
    if (action === 'detail') return detail(sessionById(id));
    if (action === 'live-detail') { const i = windows.findIndex(win => win.id === Number(id)); return detail(liveSession(windows[i], i), true); }
    if (action === 'edit') return editDialog(sessionById(id));
    if (action === 'tab-note') return noteDialog(id);
    if (action === 'detail-save') return saveDialog(null, false, allTabs(selectedSession()).map(tab => tab.id));
    if (action === 'copy-urls' || action === 'copy-md') {
      await navigator.clipboard.writeText(exportText(selectedSession(), action === 'copy-md'));
      toast('Sélection copiée.'); return;
    }
    if (action === 'remove-selected') {
      const source = detailSnapshot, selected = new Set(selectedPositions());
      if (!selected.size) throw new Error('Sélectionnez au moins un onglet.');
      const remaining = source.windows.map((win, wi) => ({ tabs: win.tabs.filter((tab, ti) => !selected.has(`${wi}:${ti}`)) })).filter(win => win.tabs.length);
      const result = await request(remaining.length ? 'tabs' : 'archive', { id: source.id, revision: source.updatedAt, windows: remaining, archived: true });
      closeDialog(); await refresh(); toast(remaining.length ? 'Sélection retirée. Une copie précédente est disponible dans les archives.' : result.message); return;
    }
    if (action === 'move') {
      const result = await request('move', { id: detailSnapshot.id, revision: detailSnapshot.updatedAt, target: $('#move-target').value, positions: selectedPositions() });
      closeDialog(); await refresh(); toast(result.message); return;
    }
    let result;
    if (action === 'focus') result = await request('focus', { id: Number(target.dataset.tab) });
    else if (action === 'sleep-window') result = await request('sleep', { tabIds: windows.find(win => win.id === Number(id)).tabs.map(tab => tab.id) });
    else if (['favorite', 'archive', 'restore', 'dedupe', 'snapshot'].includes(action)) {
      result = await request(action, { id });
      if (action === 'archive' && $('#dialog').open) closeDialog();
    } else return;
    await refresh();
    if (action === 'dedupe' && $('#dialog').open) detail(sessionById(id));
    toast(result.message);
  });
});
$('#search').addEventListener('input', event => { query = event.target.value; render(); });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); if ($('#dialog').open) closeDialog(); $('#search').focus(); $('#search').select();
  }
  if (event.key === 'Escape' && !$('#dialog').open && query) { $('#search').value = query = ''; render(); }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
let refreshTimer;
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (!busy) run(refresh); }, 300); }
async function init() {
  if (demo) {
    demoRequest = (await import('./tests/demo.mjs')).request;
    $('#demo-banner').hidden = false; $('.brand').href = '?demo'; $('#version').textContent = 'APERÇU';
  } else {
    if (!globalThis.chrome?.runtime?.id) throw new Error('Chargez src2 dans chrome://extensions, ou ajoutez ?demo à l’URL pour un aperçu fictif.');
    $('#version').textContent = chrome.runtime.getManifest().version_name;
    chrome.storage.onChanged.addListener(scheduleRefresh);
    for (const event of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onAttached', 'onDetached', 'onActivated']) chrome.tabs[event].addListener(scheduleRefresh);
    chrome.windows.onFocusChanged.addListener(scheduleRefresh);
  }
  await refresh();
}
run(init);
