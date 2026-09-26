import { cleanSession, emptyState } from '../core.mjs';
import { mockChrome } from './mock-chrome.mjs';

const tab = (title, url, rest = {}) => ({ title, url, ...rest });
const now = Date.now(), day = 86400000;
const library = emptyState();
library.sessions = [
  cleanSession({ title: 'Un peu d’inspiration', favorite: true, tags: ['Design', 'À explorer'], note: 'Des interfaces simples, des détails qui font la différence.', createdAt: now - 3600000, windows: [{ tabs: [
    tab('Minimal Gallery — A daily dose of design inspiration', 'https://minimal.gallery/'),
    tab('Godly — Astronomically good web design', 'https://godly.website/'),
    tab('The Brand Identity — Independent graphic design', 'https://the-brandidentity.com/'),
    tab('Are.na — A place to connect ideas', 'https://www.are.na/'),
    tab('Awwwards — The best of web design', 'https://www.awwwards.com/'),
    tab('Layers — Design community', 'https://layers.to/'),
  ] }] }),
  cleanSession({ title: 'Mon prochain week-end à Lisbonne', tags: ['Personnel'], createdAt: now - day, windows: [{ tabs: [
    tab('Lisbonne : explorer la ville à pied', 'https://www.visitlisboa.com/'),
    tab('Une adresse à garder — The Vintage Lisbon', 'https://www.thevintagelisbon.com/'),
    tab('La météo pour le week-end', 'https://www.meteoblue.com/'),
  ] }] }),
  cleanSession({ title: 'Boîte à outils · Développement', favorite: true, tags: ['Travail'], createdAt: now - day, windows: [{ tabs: [
    tab('MDN — JavaScript reference', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript'),
    tab('Chrome Extensions — Documentation', 'https://developer.chrome.com/docs/extensions/'),
    tab('GitHub — Where software is built', 'https://github.com/'),
    tab('Can I use — Browser support tables', 'https://caniuse.com/'),
  ] }] }),
  cleanSession({ title: 'Sauvegarde automatique', auto: true, createdAt: now - 600000, windows: [{ tabs: [tab('MDN Web Docs', 'https://developer.mozilla.org/')] }] }),
  cleanSession({ title: 'Recherche terminée', archived: true, createdAt: now - 7 * day, windows: [{ tabs: [tab('Wikipedia', 'https://fr.wikipedia.org/')] }] }),
];
const liveTabs = [
  tab('Figma — Projet Sessions / exploration', 'https://www.figma.com/', { pinned: true }),
  tab('Tablerone — All-in-one tab session manager', 'https://tabler.one/', { active: true }),
  tab('Chrome for Developers — Tabs API', 'https://developer.chrome.com/docs/extensions/reference/api/tabs'),
  tab('GitHub — Chrome Bookmarks Sorter', 'https://github.com/mondary/Chrome_BookmarksSorter'),
  tab('Lucide — Beautiful & consistent icons', 'https://lucide.dev/', { discarded: true }),
  tab('MDN — Web APIs', 'https://developer.mozilla.org/en-US/docs/Web/API'),
  tab('CSS Tricks — A guide to CSS Grid', 'https://css-tricks.com/'),
].map((t, i) => ({ id: i + 1, windowId: 1, active: false, pinned: false, groupId: -1, lastAccessed: now - 3600000, ...t }));
const fake = mockChrome({ storage: { library }, windows: [{ id: 1, focused: true, type: 'normal', tabs: liveTabs }] });
globalThis.chrome = fake.chrome;
const { dispatch } = await import('../sw.js');
export const request = (type, payload) => dispatch({ type, payload });
