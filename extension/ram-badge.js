/* PK Web Memory — Pastille mémoire sur les onglets.
   Un petit badge coloré se superpose EN COIN de la favicon d'origine :
   orange dès 150 Mo de heap JS, rouge dès 300 Mo (heap ≈ ⅓ de l'empreinte
   réelle du renderer — chrome.processes, qui donnerait la RSS, reste
   interdit aux extensions du Web Store).

   La composition icône + badge se fait dans le service worker : le contexte
   extension, couvert par les permissions http/https, peut décoder et
   redessiner une favicon cross-origin sans taint canvas — impossible depuis
   la page elle-même. L'image composée est ensuite appliquée dans l'onglet
   par une injection minime, avec repli sur un badge seul si la favicon
   d'origine ne peut être récupérée. Mesure par performance.memory, même
   canal que l'onglet Ressources, aucune injection permanente. Pages
   internes (chrome://, Web Store, PDF) non couvertes. */
"use strict";
(() => {
  const MB = 1048576;
  const SPEC = { orange: 150 * MB, red: 300 * MB };
  const ALARM = "bs-ram-badge";
  const LEVELS_KEY = "bs.rambadge";
  const DOT_COLORS = { orange: "#f5a524", red: "#e5484d" };
  // Favicons composées en cache pour la durée de vie du worker : la mesure
  // revient toutes les 30 s, inutile de re-décoder la même icône.
  const composeCache = new Map();
  const COMPOSE_CACHE_MAX = 120;

  /* ---- Injections (autonomes, sérialisées par chrome.scripting) ---- */

  // Étape 1 : mesure seule, aucune écriture dans la page.
  function pkRamBadgeMeasure(spec) {
    try {
      var m = (typeof performance !== "undefined" && performance && performance.memory) || null;
      var used = m ? m.usedJSHeapSize : 0;
      return { level: used >= spec.red ? "red" : used >= spec.orange ? "orange" : "ok", used: used };
    } catch (e) {
      return { level: "err", used: 0 };
    }
  }

  // Étape 2 : application. `badge` = { spec, colors, urls } — urls contient
  // les images composées par le SW quand elles existent ; sans urls, repli
  // sur un badge seul (favicon d'origine indisponible). Niveau "ok" ou mode
  // "off" : retire la pastille et restaure la favicon d'origine.
  function pkRamBadgePaint(badge, mode) {
    try {
      var m = (typeof performance !== "undefined" && performance && performance.memory) || null;
      var used = m ? m.usedJSHeapSize : 0;
      var spec = (badge && badge.spec) || { orange: 150 * 1048576, red: 300 * 1048576 };
      var level = mode === "off" ? "ok" : (used >= spec.red ? "red" : used >= spec.orange ? "orange" : "ok");
      var head = document.head || document.documentElement;
      if (!head) return { level: level, used: used };
      var mine = head.querySelector("link[data-pkwm-ram]");
      var hidden = head.querySelectorAll("link[data-pkwm-ram-off]");
      var i, el;
      if (level === "ok") {
        if (mine && mine.parentNode) mine.parentNode.removeChild(mine);
        for (i = 0; i < hidden.length; i++) {
          el = hidden[i];
          el.setAttribute("rel", el.getAttribute("data-pkwm-ram-off") || "icon");
          el.removeAttribute("data-pkwm-ram-off");
        }
        return { level: level, used: used };
      }
      var href = badge && badge.urls && badge.urls[level];
      if (!href) {
        var canvas = document.createElement("canvas");
        canvas.width = 32; canvas.height = 32;
        var ctx = canvas.getContext && canvas.getContext("2d");
        if (!ctx || !canvas.toDataURL) return { level: "err", used: used };
        ctx.beginPath(); ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fillStyle = (badge && badge.colors && badge.colors[level]) || "#e5484d";
        ctx.fill();
        ctx.lineWidth = 3.5; ctx.strokeStyle = "#ffffff"; ctx.stroke();
        href = canvas.toDataURL("image/png");
      }
      if (!mine) {
        mine = document.createElement("link");
        mine.setAttribute("rel", "icon");
        mine.setAttribute("type", "image/png");
        mine.setAttribute("data-pkwm-ram", "1");
        head.appendChild(mine);
      }
      mine.setAttribute("href", href);
      var icons = head.querySelectorAll('link[rel~="icon"]');
      for (i = 0; i < icons.length; i++) {
        el = icons[i];
        if (el === mine) continue;
        if (!el.hasAttribute("data-pkwm-ram-off")) {
          el.setAttribute("data-pkwm-ram-off", el.getAttribute("rel") || "icon");
          el.setAttribute("rel", "pkwm-ram-hidden");
        }
      }
      return { level: level, used: used };
    } catch (e) {
      return { level: "err", used: 0 };
    }
  }

  /* ---- Composition (service worker) ---- */

  const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ""; } };
  const cacheKeyOf = (tab) => `${tab.favIconUrl || ""}|${hostOf(tab.url || "")}`;

  // Icône d'origine pleine taille + badge rond en bas à droite.
  async function renderComposed(bitmap, level, deps) {
    const S = 64;
    const canvas = new deps.OffscreenCanvas(S, S);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S - 13, S - 13, 11, 0, Math.PI * 2);
    ctx.fillStyle = DOT_COLORS[level];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return await new Promise((resolve, reject) => {
      const reader = new deps.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("FileReader"));
      reader.readAsDataURL(blob);
    });
  }

  // Récupère la favicon d'origine (déclarée par l'onglet, puis service S2 en
  // repli — le SW passe outre le CORS grâce aux permissions http/https) et
  // renvoie { orange: dataURL, red: dataURL }, ou null si rien n'est
  // décodable : le peintre in-page affichera alors le badge seul.
  async function composeBadge(favUrl, pageUrl, deps) {
    const d = deps || globalThis;
    const sources = [];
    if (favUrl && /^(https?|data):/i.test(favUrl)) sources.push(favUrl);
    const host = hostOf(pageUrl || "");
    if (host) sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
    for (const src of sources) {
      try {
        const blob = await (await d.fetch(src)).blob();
        const bitmap = await d.createImageBitmap(blob);
        const out = {};
        for (const level of ["orange", "red"]) out[level] = await renderComposed(bitmap, level, d);
        if (bitmap.close) bitmap.close();
        return out;
      } catch { /* source suivante */ }
    }
    return null;
  }

  async function badgeFor(tab) {
    const key = cacheKeyOf(tab);
    if (composeCache.has(key)) return composeCache.get(key);
    const composed = await composeBadge(tab.favIconUrl, tab.url);
    composeCache.set(key, composed);
    if (composeCache.size > COMPOSE_CACHE_MAX) {
      composeCache.delete(composeCache.keys().next().value);
    }
    return composed;
  }

  const injectable = (tab) => tab.id != null
    && /^https?:/i.test(tab.url || tab.pendingUrl || "")
    && !tab.discarded && !tab.frozen;

  // Un passage : mesure partout, composition et application sur les onglets
  // chauds, nettoyage des autres (retour sous le seuil, réglage désactivé).
  async function sweep(chromeApi, mode) {
    const tabs = await chromeApi.tabs.query({});
    const targets = tabs.filter(injectable);
    const levels = {};
    await Promise.all(targets.map(async (tab) => {
      if (mode !== "auto") return;
      try {
        const [res] = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: pkRamBadgeMeasure,
          args: [SPEC],
        });
        const r = res && res.result;
        if (r && (r.level === "orange" || r.level === "red")) {
          levels[tab.id] = { used: r.used, level: r.level, at: Date.now() };
        }
      } catch { /* page non injectable à cet instant */ }
    }));
    await Promise.all(targets.map(async (tab) => {
      try {
        const badge = { spec: SPEC, colors: DOT_COLORS, urls: null };
        if (mode === "auto" && levels[tab.id]) {
          const composed = await badgeFor(tab);
          if (composed) badge.urls = composed;
        }
        const [res] = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: pkRamBadgePaint,
          args: [badge, mode],
        });
        void res;
      } catch { /* page non injectable à cet instant */ }
    }));
    try { await chromeApi.storage.session.set({ [LEVELS_KEY]: levels }); } catch { /* session storage absent en test */ }
    return Object.keys(levels).length;
  }

  const tick = (chromeApi, enabled) => sweep(chromeApi, enabled === false ? "off" : "auto");
  const apply = tick;

  globalThis.PKRamBadge = { SPEC, ALARM, LEVELS_KEY, DOT_COLORS, paint: pkRamBadgePaint,
    measure: pkRamBadgeMeasure, composeBadge, cacheKeyOf, tick, apply };
})();
