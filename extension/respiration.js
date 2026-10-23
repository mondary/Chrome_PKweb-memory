/* File persistante Respiration. Les appels sont sérialisés par libSerial dans
   le worker. Aucun remplissage au démarrage : seuls fermeture, reprise et ajout
   explicites le déclenchent. Les captures de session restent indépendantes. */
"use strict";
(() => {
  const KEY = "bs.respiration";
  const BOOT = "bs.respiration.boot";
  // Lots système : « Onglets de la fenêtre » regroupe les pages non groupées ;
  // l'ancien titre « Pages ajoutées à la fenêtre » (une capsule par réduction)
  // est fusionné dedans — une seule provenance, un seul lot.
  const SYSTEM_TITLE = "Onglets de la fenêtre";
  const LEGACY_SYSTEM_TITLE = "Pages ajoutées à la fenêtre";
  const web = (tab) => /^https?:\/\//i.test(tab.pendingUrl || tab.url || "");
  const urlOf = (tab) => tab.pendingUrl || tab.url;
  const pending = (q) => q.entries.filter((e) => e.state === "pending");
  // Chrome peut réordonner les clés d'objet lors de la lecture du stockage.
  const canonical = (value) => JSON.stringify(value, (key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const nextEntry = (q, excludeId) => q.capsules.flatMap((c) => q.entries
    .filter((e) => e.capsuleId === c.id && e.state === "pending" && e.id !== excludeId).reverse())
    // Les pages mises « à revenir » au clavier passent après toute la réserve,
    // même si leur capsule est prioritaire. Ordre FIFO entre pages différées.
    .sort((a, b) => (a.returnOrder || 0) - (b.returnOrder || 0))[0];
  // Unifie les lots système d'anciennes files : plusieurs « Pages ajoutées à
  // la fenêtre » (et/ou « Onglets de la fenêtre ») deviennent un seul lot.
  function normalizeSystemCapsules(q) {
    const system = q.capsules.filter((c) => c.title === SYSTEM_TITLE || c.title === LEGACY_SYSTEM_TITLE);
    if (!system.length || (system.length === 1 && system[0].title === SYSTEM_TITLE)) return false;
    const keep = system.find((c) => c.title === SYSTEM_TITLE) || system[0];
    keep.title = SYSTEM_TITLE;
    for (const c of system) {
      if (c === keep) continue;
      for (const e of q.entries) if (e.capsuleId === c.id) e.capsuleId = keep.id;
      q.capsules.splice(q.capsules.indexOf(c), 1);
    }
    return true;
  }

  // Seule exception au budget : un média (vidéo ou audio) effectivement en
  // lecture, y compris muet ou dans une iframe. Aucun contenu de formulaire n'est lu.
  function inspectPage() {
    return [...document.querySelectorAll("audio,video")].some((m) => !m.paused && !m.ended) ? "media" : null;
  }

  function create({ chrome, saveSession, changed = () => {} }) {
    const closing = new Set();
    const ignored = new Set();
    let initialized = false;
    const read = async () => (await chrome.storage.local.get(KEY))[KEY] || null;
    async function write(q) {
      q.updatedAt = Date.now();
      await chrome.storage.local.set({ [KEY]: q });
      // Une fermeture n'est permise qu'après confirmation de la copie durable.
      const saved = await read();
      if (canonical(saved) !== canonical(q)) throw new Error("La file n’a pas pu être vérifiée. Aucun autre onglet ne sera fermé.");
      changed();
    }
    async function init() {
      if (initialized) return;
      const boot = (await chrome.storage.session.get(BOOT))[BOOT];
      const q = await read();
      if (q && normalizeSystemCapsules(q)) await write(q); // anciennes files : un seul lot système
      if (!boot && q && !q.stopped) {
        // Recharger l'extension efface storage.session, mais pas les ids Chrome.
        // Si la fenêtre d'origine est toujours là, la tournée reprend seule :
        // l'utilisateur ne doit pas cliquer « Reprendre » après chaque
        // rechargement de l'extension. Une pause explicitement demandée est
        // conservée (pausedBy === "user").
        const live = q.windowId != null ? await windowTabs(q.windowId) : null;
        const sameWindow = live?.some((tab) => q.entries.some((e) => e.state === "open"
          && e.tabId === tab.id && e.url === urlOf(tab)));
        const userPaused = q.pausedBy === "user";
        const keepPaused = userPaused || q.pausedBy === "error";
        if (sameWindow && !keepPaused) {
          await reconcile(q, live, true);
          q.paused = false;
          q.pausedBy = null;
          q.reason = "";
        } else {
          q.paused = true;
          q.pausedBy = userPaused ? "user" : q.pausedBy === "error" ? "error" : "restart";
          if (!sameWindow) {
            q.reason = "Chrome ou l’extension a redémarré. Reprenez la file dans la fenêtre de votre choix.";
            q.windowId = null;
            for (const e of q.entries) if (!["done", "outside"].includes(e.state)) { e.state = "pending"; e.tabId = null; delete e.discarded; }
          } else if (!q.reason) q.reason = "Pause conservée après rechargement de l’extension.";
        }
        await write(q);
      } else if (q?.entries.some((e) => ["opening", "parking"].includes(e.state))) {
        // Interruption entre une opération Chrome et sa confirmation persistée :
        // remettre les états au propre, puis reprendre tout seul si la fenêtre
        // d'origine est toujours identifiable. Une pause explicite reste.
        for (const e of q.entries) {
          if (e.state === "opening") { e.state = "pending"; e.tabId = null; }
          else if (e.state === "parking") {
            const tab = await chrome.tabs.get(e.tabId).catch(() => null);
            e.state = tab ? "open" : "pending"; e.tabId = tab?.id ?? null;
          }
        }
        const userPaused = q.pausedBy === "user";
        const live = q.windowId != null ? await windowTabs(q.windowId) : null;
        const sameWindow = live?.some((tab) => q.entries.some((e) => e.state === "open"
          && e.tabId === tab.id && e.url === urlOf(tab)));
        if (!userPaused && q.pausedBy !== "error" && sameWindow) {
          await reconcile(q, live, true);
          q.paused = false; q.pausedBy = null; q.reason = "";
        } else {
          q.paused = true;
          q.pausedBy = userPaused ? "user" : q.pausedBy === "error" ? "error" : "operation";
          q.reason = "Une opération a été interrompue. Reprendre vérifie les onglets déjà ouverts.";
        }
        await write(q);
      }
      await chrome.storage.session.set({ [BOOT]: true });
      initialized = true;
    }
    async function get() { await init(); return read(); }
    async function windowTabs(id) {
      if (closing.has(id)) return null;
      try {
        const win = await chrome.windows.get(id, { populate: true });
        return win.type === "normal" && !win.incognito ? win.tabs : null;
      } catch { return null; }
    }
    const isSuspend = (q) => q?.mode === "suspend";
    const loadedCount = (q, tabs) => isSuspend(q)
      ? tabs.filter((tab) => web(tab) && !tab.discarded).length
      : tabs.filter(web).length;
    async function keepReason(tab) {
      if (tab.incognito || !web(tab)) return "internal";
      if (tab.discarded) return null;
      try {
        const frames = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: inspectPage,
        });
        return frames.some((frame) => frame.result === "media") ? "media" : null;
      } catch { return null; } // L'échec d'injection n'est pas une exemption.
    }
    async function park(q, entry) {
      let tab;
      try { tab = await chrome.tabs.get(entry.tabId); } catch { return false; }
      if (tab.windowId !== q.windowId || urlOf(tab) !== entry.url) { entry.keepReason = "changed"; return false; }
      entry.keepReason = await keepReason(tab);
      if (entry.keepReason) return false;
      // Réévaluer l'identité après le probe sans exempter actif/épinglé.
      tab = await chrome.tabs.get(tab.id).catch(() => null);
      if (!tab || tab.windowId !== q.windowId || urlOf(tab) !== entry.url) { entry.keepReason = "changed"; return false; }
      // Mode natif Chrome : l'onglet reste dans la barre, seul son renderer
      // est libéré. Les onglets actifs, épinglés et audibles sont protégés.
      if (isSuspend(q)) {
        if (tab.discarded) { entry.discarded = true; return false; }
        if (tab.active || tab.pinned || tab.audible) {
          entry.keepReason = tab.active ? "active" : tab.pinned ? "pinned" : "media";
          await write(q); return false;
        }
        entry.state = "parking";
        await write(q);
        try {
          const result = await chrome.tabs.discard(tab.id);
          const after = result || await chrome.tabs.get(tab.id).catch(() => null);
          if (!after?.discarded) throw new Error("Chrome n’a pas suspendu l’onglet");
          entry.state = "open"; entry.tabId = tab.id; entry.discarded = true; delete entry.keepReason;
          await write(q); return true;
        } catch {
          entry.state = "open"; entry.tabId = tab.id; entry.keepReason = "refused";
          await write(q); return false;
        }
      }
      entry.state = "parking";
      await write(q);
      const current = await chrome.tabs.get(tab.id).catch(() => null);
      if (!current || current.windowId !== q.windowId || urlOf(current) !== entry.url) {
        entry.state = current ? "open" : "done"; entry.tabId = current?.id ?? null;
        await write(q);
        return false;
      }
      ignored.add(tab.id);
      try {
        await chrome.tabs.remove(tab.id);
        entry.state = "pending"; entry.tabId = null; delete entry.discarded; delete entry.keepReason;
        await write(q); return true;
      }
      catch {
        ignored.delete(tab.id);
        entry.state = "open"; entry.tabId = tab.id; entry.keepReason = "refused";
        await write(q); return false;
      }
    }
    async function reconcile(q, tabs, matchURLs = false) {
      const used = new Set();
      for (const e of q.entries) {
        if (["done", "outside"].includes(e.state)) continue;
        let tab = e.tabId != null && tabs.find((t) => t.id === e.tabId);
        if (!tab && matchURLs) tab = tabs.find((t) => !used.has(t.id) && web(t) && urlOf(t) === e.url);
        if (tab && !used.has(tab.id) && urlOf(tab) === e.url) {
          used.add(tab.id); e.state = "open"; e.tabId = tab.id; e.title = tab.title || e.title;
          e.discarded = !!tab.discarded;
        } else if (e.state === "open" || e.state === "opening") {
          // Un événement perdu n'est jamais assimilé à « traité ».
          e.state = "pending"; e.tabId = null; delete e.discarded;
        }
      }
    }
    async function fill(q, excludeId) {
      if (q.paused || q.stopped) return;
      let tabs = await windowTabs(q.windowId);
      if (!tabs) return suspend(q, "Fenêtre fermée. La file vous attend.");
      // Ne pas réconcilier ici les ids manquants : plusieurs ⌘W peuvent être
      // en vol. Leurs événements onRemoved les marqueront traités, jamais pending.
      let slots = Math.max(0, q.target - loadedCount(q, tabs));
      while (slots-- > 0) {
        const e = nextEntry(q, excludeId);
        if (!e) break;
        tabs = await windowTabs(q.windowId);
        if (!tabs) return suspend(q, "Fenêtre fermée. La file vous attend.");
        if (loadedCount(q, tabs) >= q.target) break;
        // Adopter une page rouverte manuellement au lieu de la dupliquer.
        const ids = new Set(q.entries.filter((item) => item.state === "open").map((item) => item.tabId));
        const existing = tabs.find((t) => !ids.has(t.id) && urlOf(t) === e.url);
        if (existing) {
          e.state = "open"; e.tabId = existing.id; e.discarded = !!existing.discarded;
          await write(q);
          if (!existing.discarded) slots++;
          continue;
        }
        e.state = "opening";
        await write(q);
        try {
          if (closing.has(q.windowId)) { e.state = "pending"; return suspend(q, "Fenêtre fermée. La file vous attend."); }
          const tab = await chrome.tabs.create({ windowId: q.windowId, url: e.url,
            active: false, index: tabs.filter((t) => t.pinned).length });
          e.tabId = tab.id; e.state = "open"; e.discarded = false;
          await write(q);
        } catch (error) {
          e.state = "pending"; e.tabId = null; q.paused = true; q.pausedBy = "error";
          q.reason = `Ouverture interrompue : ${error.message}. La page reste dans la file.`;
          await write(q); break;
        }
      }
    }
    async function suspend(q, reason) {
      q.paused = true; q.pausedBy = "window"; q.reason = reason; q.windowId = null;
      for (const e of q.entries) if (!["done", "outside"].includes(e.state)) { e.state = "pending"; e.tabId = null; delete e.discarded; }
      await write(q);
    }
    async function rememberTabs(q, ordered) {
      // Les pages manuelles font partie du même budget. Les sauvegarder AVANT
      // toute fermeture, même lorsqu'elles n'existaient pas au début de la tournée.
      const extra = ordered.filter((t) => !q.entries.some((e) => e.state === "open" && e.tabId === t.id));
      if (extra.length) {
        // Les pages ouvertes après le lancement rejoignent le lot « Onglets de
        // la fenêtre » — pas de capsule « Pages ajoutées » en double. La copie
        // de sécurité de ces pages reste créée avant toute fermeture, et le lot
        // remonte en tête : la page tout juste fermée revient la première.
        let c = q.capsules.find((cap) => cap.title === SYSTEM_TITLE);
        if (!c) { c = { id: crypto.randomUUID(), title: SYSTEM_TITLE, color: "grey" }; q.capsules.push(c); }
        const entries = extra.map((t) => ({ id: crypto.randomUUID(), capsuleId: c.id,
          url: urlOf(t), title: t.title || urlOf(t), state: "open", tabId: t.id, discarded: !!t.discarded }));
        await saveSession(LEGACY_SYSTEM_TITLE, entries);
        q.capsules = [c, ...q.capsules.filter((cap) => cap !== c)];
        q.entries.push(...entries);
      }
    }
    async function compact(q) {
      const tabs = await windowTabs(q.windowId);
      if (!tabs) throw new Error("Choisissez une fenêtre ouverte pour réduire la tournée.");
      await reconcile(q, tabs, true);
      const ordered = tabs.filter(web).sort((a, b) => a.index - b.index);
      await rememberTabs(q, ordered);
      const keep = new Set(ordered.slice(-q.target).map((tab) => tab.id));
      if (isSuspend(q)) {
        // Chrome ne suspend jamais l'onglet actif : on le garde, et on libère
        // une place parmi les N en suspendant le plus ancien onglet gardé.
        const active = ordered.find((tab) => tab.active);
        if (active && !keep.has(active.id)) {
          keep.add(active.id);
          const removable = ordered.filter((tab) => keep.has(tab.id) && tab.id !== active.id
            && !tab.audible && !tab.pinned).sort((a, b) =>
              (a.lastAccessed || 0) - (b.lastAccessed || 0) || a.index - b.index)[0];
          if (removable) keep.delete(removable.id);
        }
      }
      const wasPaused = q.paused;
      q.paused = true;
      q.reason = isSuspend(q) ? "Suspension des onglets au-delà de la cible…" : "Enregistrement et fermeture des onglets en trop…";
      await write(q);
      let evicted = 0;
      for (const tab of ordered) {
        if (isSuspend(q) && tab.discarded) continue;
        const e = q.entries.find((entry) => entry.state === "open" && entry.tabId === tab.id);
        if (!e) continue;
        delete e.keepReason;
        if (keep.has(tab.id)) continue;
        if (await park(q, e)) evicted++;
      }
      const remaining = await windowTabs(q.windowId);
      if (!remaining) return suspend(q, "Fenêtre fermée. La file vous attend.");
      const after = remaining.filter(web).length;
      const loadedAfter = isSuspend(q) ? remaining.filter((tab) => web(tab) && !tab.discarded).length : after;
      const playing = q.entries.filter((e) => e.state === "open" && e.keepReason === "media").length;
      // Les protections (actif, épinglé, lecture) peuvent dépasser la cible.
      const lastN = new Set(ordered.slice(-q.target).map((tab) => tab.id));
      const protectedOutside = isSuspend(q) ? remaining.filter((tab) => web(tab) && !tab.discarded
        && !lastN.has(tab.id) && (tab.active || tab.audible || tab.pinned)).length : 0;
      q.compaction = { before: ordered.length, after: isSuspend(q) ? loadedAfter : after,
        closed: isSuspend(q) ? 0 : evicted, discarded: isSuspend(q) ? evicted : 0, playing, at: Date.now() };
      q.paused = wasPaused;
      if (isSuspend(q)) {
        q.reason = loadedAfter > q.target + protectedOutside
          ? `Suspension incomplète : ${loadedAfter} onglets chargés. Une suspension a échoué ; réessayez.` : "";
        await write(q);
        return `${evicted} onglet(s) suspendu(s) · ${loadedAfter} chargés${playing ? ` dont ${playing} en lecture` : ""}.`;
      }
      q.reason = after > q.target + playing ? `Réduction incomplète : ${after} onglets ouverts. Une fermeture a échoué ; réessayez.`
        : playing ? `${q.target} derniers onglets + ${playing} lecture(s) en cours (vidéo ou audio). Elles seront fermées à l’arrêt si elles sont toujours en trop.` : "";
      await write(q);
      return `${evicted} onglet(s) fermé(s) et sauvegardé(s) · ${after} ouverts${playing ? ` dont ${playing} en lecture` : ""}.`;
    }
    async function select(q, id) {
      if (q.stopped || q.windowId == null) throw new Error("Reprenez la tournée dans une fenêtre avant de choisir une page.");
      const entry = q.entries.find((e) => e.id === id);
      if (!entry) throw new Error("Cette page n’est plus dans la tournée.");
      const tabs = await windowTabs(q.windowId);
      if (!tabs) throw new Error("La fenêtre de la tournée est fermée. Reprenez-la depuis Sessions.");
      const live = tabs.find((t) => t.id === entry.tabId && urlOf(t) === entry.url);
      if (live) {
        await chrome.tabs.update(live.id, { active: true });
        await chrome.windows.update(q.windowId, { focused: true });
        if (isSuspend(q)) await compact(q); // réveiller un suspendu en rend un autre disponible
        return { message: live.discarded ? "Onglet suspendu rechargé." : "Onglet activé." };
      }
      // Les pages encore ouvertes ont pu naviguer depuis le dernier événement.
      for (const tab of tabs.filter(web)) await applyUpdate(q, tab);
      if (entry.state === "open" && tabs.some((t) => t.id === entry.tabId)) {
        await write(q);
        await chrome.tabs.update(entry.tabId, { active: true });
        await chrome.windows.update(q.windowId, { focused: true });
        if (isSuspend(q)) await compact(q);
        return { message: "Onglet activé." };
      }
      await rememberTabs(q, tabs.filter(web));
      const previous = { state: entry.state === "open" ? "pending" : entry.state, tabId: null, paused: q.paused, pausedBy: q.pausedBy, reason: q.reason };
      q.paused = true; // un arrêt du worker en cours d’échange reste récupérable
      entry.state = "opening"; entry.tabId = null;
      await write(q);
      let opened;
      try {
        // Créer avant de fermer : un échec d’ouverture ne sacrifie aucune page,
        // et une cible de 1 ne ferme jamais la dernière fenêtre Chrome.
        opened = await chrome.tabs.create({ windowId: q.windowId, url: entry.url, active: false });
      } catch (error) {
        Object.assign(entry, { state: previous.state, tabId: previous.tabId });
        q.paused = previous.paused; q.pausedBy = previous.pausedBy; q.reason = previous.reason;
        await write(q);
        throw new Error(`Ouverture impossible : ${error.message}. Les onglets ouverts sont conservés.`);
      }
      entry.state = "open"; entry.tabId = opened.id; entry.discarded = false; delete entry.keepReason;
      await write(q);
      // Choix explicite : LRU, indépendant de l’ordre automatique des capsules.
      const candidates = tabs.filter(web).sort((a, b) =>
        Number(a.active) - Number(b.active) || (a.lastAccessed || 0) - (b.lastAccessed || 0) || a.index - b.index);
      await Promise.all(tabs.filter(web).map(async (tab) => {
        const e = q.entries.find((item) => item.tabId === tab.id && item.state === "open");
        if (!e) return;
        const reason = await keepReason(tab);
        if (reason) e.keepReason = reason; else delete e.keepReason;
      }));
      let exchanged = 0;
      for (const tab of candidates) {
        const current = await windowTabs(q.windowId);
        if (!current) { await suspend(q, "Fenêtre fermée. La file vous attend."); throw new Error(q.reason); }
        const playing = q.entries.filter((e) => e.state === "open" && e.keepReason === "media"
          && current.some((t) => t.id === e.tabId));
        if (loadedCount(q, current) <= q.target + playing.length) break;
        if (tab.discarded || playing.some((e) => e.tabId === tab.id)) continue;
        const candidate = q.entries.find((e) => e.state === "open" && e.tabId === tab.id);
        if (candidate && await park(q, candidate)) exchanged++;
      }
      const remaining = await windowTabs(q.windowId);
      if (!remaining) { await suspend(q, "Fenêtre fermée. La file vous attend."); throw new Error(q.reason); }
      const playing = q.entries.filter((e) => e.state === "open" && e.keepReason === "media"
        && remaining.some((t) => t.id === e.tabId)).length;
      const orderedRemaining = remaining.filter(web).sort((a, b) => a.index - b.index);
      const lastN = new Set(orderedRemaining.slice(-q.target).map((tab) => tab.id));
      const extraProtected = isSuspend(q) ? remaining.filter((tab) => {
        if (!web(tab) || tab.discarded || lastN.has(tab.id)) return false;
        if (tab.active || tab.audible || tab.pinned) return true;
        return q.entries.find((e) => e.state === "open" && e.tabId === tab.id)?.keepReason === "media";
      }).length : playing;
      if (loadedCount(q, remaining) > q.target + extraProtected) {
        // Si toutes les suspensions/fermetures sont refusées, annuler l’arrivée.
        let rolledBack = false;
        if (isSuspend(q)) { await chrome.tabs.remove(opened.id).catch(() => {}); rolledBack = true; }
        else rolledBack = await park(q, entry);
        if (rolledBack) { entry.state = previous.state; entry.tabId = previous.tabId; delete entry.discarded; }
        q.paused = true; q.pausedBy = "error";
        q.reason = rolledBack ? "Échange annulé : Chrome a refusé de libérer une place. La page reste retrouvable."
          : "Échange incomplet : Chrome a refusé une fermeture. Réduisez les onglets avant de reprendre.";
        await write(q);
        throw new Error(q.reason);
      }
      q.paused = previous.paused; q.pausedBy = previous.pausedBy; q.reason = previous.reason;
      await write(q);
      await chrome.tabs.update(opened.id, { active: true });
      await chrome.windows.update(q.windowId, { focused: true });
      return { message: exchanged ? `${exchanged} page(s) remise(s) en réserve · page choisie ouverte.` : "Page choisie ouverte." };
    }
    // ⌘⌥W « fermer à revenir » : l'onglet actif de la fenêtre de tournée part
    // en réserve (jamais « traité »), remis en fin de file, et
    // la page suivante entre en arrière-plan. En pause, l'onglet est rangé
    // sans relancer le remplissage — même sémantique que l'échange manuel.
    async function closeActive(q, payload = {}) {
      if (q.stopped) throw new Error("Aucune tournée en cours.");
      if (q.windowId == null) throw new Error("Reprenez la tournée dans une fenêtre avant de fermer à revenir.");
      const active = payload.tabId != null ? await chrome.tabs.get(payload.tabId).catch(() => null)
        : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
      if (!active?.active || active.incognito || active.windowId !== q.windowId || !web(active)
        || (payload.url && payload.url !== urlOf(active))) {
        return { message: "« À revenir » n'agit que sur l'onglet actif de la fenêtre de tournée." };
      }
      if (isSuspend(q)) {
        return { message: "Mode Suspendre : ⌘W ferme l’onglet dans Chrome ; les autres restent visibles et suspendus. « À revenir » ne s’applique qu’au mode Fermer." };
      }
      if ((await applyUpdate(q, active)).changed) await write(q);
      // Inclure aussi une page ajoutée manuellement avant le prochain tick.
      await rememberTabs(q, [active]);
      const entry = q.entries.find((e) => e.state === "open" && e.tabId === active.id);
      if (await keepReason(active) === "media") {
        entry.keepReason = "media";
        await write(q);
        return { message: "Lecture en cours : l’onglet reste ouvert." };
      }
      const tabs = await windowTabs(q.windowId);
      if (!tabs) throw new Error("La fenêtre de la tournée est fermée.");
      // Une page de la réserve a pu être rouverte manuellement avant son
      // événement onUpdated : l'adopter évite de la créer en double.
      for (const tab of tabs.filter(web)) await applyUpdate(q, tab);
      const next = !q.paused && tabs.filter(web).length <= q.target && nextEntry(q, entry.id);
      if (tabs.length === 1 && !next) return { message: "Aucune autre page à rappeler : le dernier onglet reste ouvert." };
      const previous = { paused: q.paused, pausedBy: q.pausedBy, reason: q.reason };
      q.paused = true; // comme l'échange manuel : un arrêt du worker reste récupérable
      await write(q);
      // Ouvrir avant de fermer préserve la fenêtre avec une cible de 1 et laisse
      // l'onglet courant intact si Chrome refuse l'ouverture du suivant.
      if (next) {
        next.state = "opening";
        await write(q);
        let opened;
        try {
          opened = await chrome.tabs.create({ windowId: q.windowId, url: next.url, active: false,
            index: tabs.filter((tab) => tab.pinned).length });
        } catch (error) {
          next.state = "pending"; next.tabId = null;
          q.paused = previous.paused; q.pausedBy = previous.pausedBy; q.reason = previous.reason;
          await write(q);
          throw new Error(`Ouverture impossible : ${error.message}. L’onglet courant reste ouvert.`);
        }
        next.state = "open"; next.tabId = opened.id;
        await write(q);
      }
      const ok = await park(q, entry);
      if (!ok) {
        const rolledBack = !next || await park(q, next);
        q.paused = previous.paused; q.pausedBy = previous.pausedBy; q.reason = previous.reason;
        if (!rolledBack) { q.paused = true; q.pausedBy = "error"; q.reason = "Fermeture refusée : vérifiez les onglets avant de reprendre."; }
        await write(q);
        const cause = entry.keepReason === "media" ? "une lecture est en cours (conservée)"
          : entry.keepReason === "changed" ? "la page vient de changer" : "Chrome a refusé la fermeture";
        if (entry.keepReason !== "media") delete entry.keepReason;
        return { message: `Fermeture à revenir annulée : ${cause}.` };
      }
      entry.returnOrder = Math.max(0, ...q.entries.map((e) => e.returnOrder || 0)) + 1;
      q.paused = previous.paused; q.pausedBy = previous.pausedBy; q.reason = previous.reason;
      await write(q);
      if (!previous.paused) await fill(q, entry.id);
      return { closed: true, message: `« À revenir » · ${pending(q).length} page(s) en réserve.` };
    }
    async function start(payload) {
      await init();
      const previous = await read();
      if (previous && !previous.stopped) throw new Error("Une tournée existe déjà. Reprenez-la ou terminez-la avant d’en créer une autre.");
      const target = Number(payload.target);
      if (!Number.isInteger(target) || target < 1 || target > 30) throw new Error("Choisissez entre 1 et 30 onglets.");
      const mode = payload.mode === "suspend" ? "suspend" : "close";
      const tabs = await windowTabs(payload.windowId);
      if (!tabs) throw new Error("Choisissez une fenêtre Chrome normale ouverte.");
      const webTabs = tabs.filter(web).sort((a, b) => a.index - b.index);
      if (!webTabs.length) throw new Error("Cette fenêtre ne contient aucun onglet web.");
      const groups = await chrome.tabGroups.query({ windowId: payload.windowId });
      const q = { version: 1, id: crypto.randomUUID(), windowId: payload.windowId, target, mode,
        paused: true, pausedBy: null, stopped: false, reason: "Préparation de la tournée", capsules: [], entries: [] };
      // Segments contigus : ne jamais mélanger l'ordre d'onglets non groupés.
      let capsule, lastGroup;
      for (const tab of webTabs) {
        if (!capsule || lastGroup !== tab.groupId) {
          const group = groups.find((g) => g.id === tab.groupId);
          capsule = { id: crypto.randomUUID(), title: group?.title || "Onglets de la fenêtre", color: group?.color || "grey" };
          q.capsules.unshift(capsule); lastGroup = tab.groupId;
        }
        q.entries.push({ id: crypto.randomUUID(), capsuleId: capsule.id, url: urlOf(tab), title: tab.title || urlOf(tab),
          state: "open", tabId: tab.id, discarded: !!tab.discarded, pinned: !!tab.pinned,
          group: tab.groupId === -1 ? "" : String(tab.groupId), groupTitle: capsule.title, groupColor: capsule.color });
      }
      // La copie de sécurité ordinaire précède toute fermeture et reste exportable.
      for (const c of q.capsules) {
        c.sessionId = await saveSession(c.title, q.entries.filter((e) => e.capsuleId === c.id));
      }
      await write(q);
      await compact(q);
      q.paused = false;
      await write(q);
      await fill(q);
      const remainingTabs = await windowTabs(q.windowId) || [];
      const remaining = remainingTabs.filter(web).length;
      if (mode === "suspend") {
        const loaded = remainingTabs.filter((tab) => web(tab) && !tab.discarded).length;
        return { message: `Respiration · ${remaining} onglets · ${loaded} chargés · ${remaining - loaded} suspendus.${q.reason ? ` ${q.reason}` : ""}` };
      }
      return { message: `Respiration · ${remaining} onglets ouverts · ${pending(q).length} pages fermées, à revenir.${q.reason ? ` ${q.reason}` : ""}` };
    }
    async function command(type, payload = {}) {
      if (type === "start") return start(payload);
      const q = await get();
      if (type === "status") return q;
      if (!q) throw new Error("Activez d’abord Respiration.");
      if (type === "select") return select(q, payload.id);
      if (type === "closeActive") return closeActive(q, payload);
      if (type === "compact") {
        if (q.windowId == null) q.windowId = payload.windowId;
        return { message: await compact(q) };
      } else if (type === "pause" || type === "stop") {
        q.paused = true; q.pausedBy = type === "stop" ? null : "user"; q.stopped = type === "stop";
        q.reason = type === "stop" ? "Tournée terminée. Les capsules restent dans vos sessions." : "Remplissage en pause";
      } else if (type === "resume") {
        const targetWindow = q.windowId ?? payload.windowId;
        const tabs = await windowTabs(targetWindow);
        if (!tabs) throw new Error("Choisissez une fenêtre ouverte pour reprendre.");
        q.windowId = targetWindow; q.paused = false; q.pausedBy = null; q.stopped = false; q.reason = "";
        await reconcile(q, tabs, true);
        await compact(q);
      } else if (type === "enqueue") {
        const session = payload.session;
        if (!session?.windows?.length) throw new Error("Session introuvable.");
        if (q.capsules.some((c) => c.sessionId === session.id)) throw new Error("Cette capsule fait déjà partie de la tournée.");
        const c = { id: crypto.randomUUID(), title: session.title, sessionId: session.id };
        q.capsules.push(c);
        for (const win of session.windows) for (const tab of win.tabs) {
          if (!web(tab)) continue;
          q.entries.push({ ...tab, id: crypto.randomUUID(), capsuleId: c.id, state: "pending", tabId: null });
        }
      } else if (type === "up" || type === "down") {
        const at = q.capsules.findIndex((c) => c.id === payload.id);
        const to = at + (type === "up" ? -1 : 1);
        if (at >= 0 && to >= 0 && to < q.capsules.length) [q.capsules[at], q.capsules[to]] = [q.capsules[to], q.capsules[at]];
      } else if (type === "next") {
        const current = q.capsules.find((c) => q.entries.some((e) => e.capsuleId === c.id && ["pending", "open"].includes(e.state)));
        if (!current || q.capsules.filter((c) => q.entries.some((e) => e.capsuleId === c.id && ["pending", "open"].includes(e.state))).length < 2)
          throw new Error("Ajoutez un autre lot de pages (un groupe ou une session) pour passer au suivant.");
        q.paused = true; await write(q);
        for (const e of q.entries) if (e.capsuleId === current.id && e.state === "open") await park(q, e);
        q.capsules = [...q.capsules.filter((c) => c.id !== current.id), current];
        q.paused = false; q.reason = "";
      } else throw new Error(`Action Respiration non prise en charge (${type}). Rechargez l’extension dans chrome://extensions, puis cette page.`);
      await write(q);
      if (["resume", "enqueue", "next"].includes(type)) await fill(q);
      return { message: type === "stop" ? q.reason : "Tournée mise à jour." };
    }
    function noticeRemoval(id, info) {
      if (info.isWindowClosing) closing.add(info.windowId);
      if (ignored.delete(id)) return false;
      return true;
    }
    async function removed(id, info) {
      const q = await get();
      if (!q || q.stopped || q.windowId !== info.windowId) return;
      if (info.isWindowClosing || closing.has(info.windowId)) return suspend(q, "Fenêtre fermée. La file vous attend.");
      const entry = q.entries.find((e) => e.state === "open" && e.tabId === id);
      if (entry) { entry.state = "done"; entry.tabId = null; delete entry.discarded; await write(q); }
      await fill(q);
    }
    async function detached(id, info) {
      const q = await get();
      if (!q || q.windowId !== info.oldWindowId) return;
      // Déplacer un onglet n'est pas le traiter, ni une raison d'en ouvrir un autre.
      q.paused = true; q.pausedBy = "error"; q.reason = "Onglet déplacé dans une autre fenêtre. Reprenez quand vous êtes prêt.";
      const e = q.entries.find((item) => item.tabId === id);
      if (e) { e.state = "outside"; e.tabId = null; delete e.discarded; }
      await write(q);
    }
    async function applyUpdate(q, tab) {
      if (!q || q.stopped || tab.windowId !== q.windowId || !web(tab)) return { changed: false };
      tab = await chrome.tabs.get(tab.id).catch(() => null);
      if (!tab || tab.windowId !== q.windowId || !web(tab)) return { changed: false };
      const url = urlOf(tab);
      let e = q.entries.find((item) => item.state === "open" && item.tabId === tab.id);
      if (!e) e = q.entries.find((item) => item.state === "pending" && item.url === url);
      if (!e) return { changed: false, unmatched: true };
      const title = tab.title || url;
      const discarded = !!tab.discarded;
      if (e.state === "open" && e.url === url && e.title === title && e.discarded === discarded) return { changed: false };
      e.state = "open"; e.tabId = tab.id; e.url = url; e.title = title; e.discarded = discarded;
      return { changed: true };
    }
    async function updated(tab) { return updatedMany([tab]); }
    // Une rafale d'ouvertures (restauration, Session Buddy…) ne doit pas écrire
    // la file une fois par onglet : un lot = une écriture. Le budget lui-même
    // reste tenu par tick(), jamais au milieu d'une restauration en cours.
    async function updatedMany(tabs) {
      const q = await get();
      let changed = false;
      for (const tab of tabs) if ((await applyUpdate(q, tab)).changed) changed = true;
      if (changed) await write(q);
    }
    async function tick() {
      const q = await get();
      if (!q || q.paused || q.stopped || q.windowId == null) return;
      const tabs = await windowTabs(q.windowId);
      if (tabs && loadedCount(q, tabs) > q.target) await compact(q);
    }
    async function externalClose(ids) {
      const q = await get();
      if (!q || q.stopped) return;
      const selected = q.entries.filter((e) => e.state === "open" && ids.includes(e.tabId));
      if (!selected.length) return;
      q.paused = true; q.pausedBy = "error"; q.reason = "Fermeture groupée : remplissage en pause.";
      for (const e of selected) { e.state = "pending"; e.tabId = null; delete e.discarded; }
      await write(q);
    }
    return { get, command, noticeRemoval, removed, detached, updated, updatedMany, externalClose, tick };
  }
  globalThis.PKRespiration = { KEY, create, nextEntry, pending, inspectPage, normalizeSystemCapsules };
})();
