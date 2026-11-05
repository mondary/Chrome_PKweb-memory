/* PK Web Memory — Pastille mémoire sur les onglets.
   Colore la favicon des onglets dont le heap JS dépasse un seuil : orange
   dès 150 Mo, rouge dès 300 Mo. Le heap représente environ le tiers de
   l'empreinte réelle du renderer — l'API chrome.processes, qui donnerait la
   RSS, reste interdite aux extensions du Web Store, on réutilise donc le
   même canal de mesure que l'onglet Ressources (performance.memory lu via
   chrome.scripting, aucune injection permanente). L'icône d'origine est
   restaurée dès que l'onglet redescend sous le seuil. Pages internes
   (chrome://, Web Store, PDF) non couvertes : Chrome y interdit l'injection. */
"use strict";
(() => {
  const MB = 1048576;
  const SPEC = { orange: 150 * MB, red: 300 * MB };
  const ALARM = "bs-ram-badge";
  const LEVELS_KEY = "bs.rambadge";

  // Injectée dans chaque onglet http(s). Autonome : aucune référence externe,
  // la fonction est sérialisée telle quelle par chrome.scripting.
  function pkRamBadgePaint(spec, mode) {
    try {
      var m = (typeof performance !== "undefined" && performance && performance.memory) || null;
      var used = m ? m.usedJSHeapSize : 0;
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
      var colors = { orange: "#f5a524", red: "#e5484d" };
      var canvas = document.createElement("canvas");
      canvas.width = 32; canvas.height = 32;
      var ctx = canvas.getContext && canvas.getContext("2d");
      if (!ctx || !canvas.toDataURL) return { level: "err", used: used };
      ctx.beginPath(); ctx.arc(16, 16, 14, 0, Math.PI * 2);
      ctx.fillStyle = colors[level]; ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = "#ffffff"; ctx.stroke();
      // Deux barres mémoire : silhouette lisible à 16 px dans le strip.
      ctx.fillStyle = "#151515";
      ctx.fillRect(12, 10, 3.2, 12); ctx.fillRect(17, 10, 3.2, 12);
      var href = canvas.toDataURL("image/png");
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

  const injectable = (tab) => tab.id != null
    && /^https?:/i.test(tab.url || tab.pendingUrl || "")
    && !tab.discarded && !tab.frozen;

  // Un passage sur tous les onglets injectables. mode "auto" : applique le
  // niveau mesuré ; mode "off" : nettoie et restaure les favicons d'origine.
  async function sweep(chromeApi, mode) {
    const tabs = await chromeApi.tabs.query({});
    const levels = {};
    await Promise.all(tabs.filter(injectable).map(async (tab) => {
      try {
        const [res] = await chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          func: pkRamBadgePaint,
          args: [SPEC, mode],
        });
        const r = res && res.result;
        if (r && (r.level === "orange" || r.level === "red")) {
          levels[tab.id] = { used: r.used, level: r.level, at: Date.now() };
        }
      } catch { /* page non injectable à cet instant */ }
    }));
    try { await chromeApi.storage.session.set({ [LEVELS_KEY]: levels }); } catch { /* session storage absent en test */ }
    return Object.keys(levels).length;
  }

  const tick = (chromeApi, enabled) => sweep(chromeApi, enabled === false ? "off" : "auto");
  const apply = tick;

  globalThis.PKRamBadge = { SPEC, ALARM, LEVELS_KEY, paint: pkRamBadgePaint, tick, apply };
})();
