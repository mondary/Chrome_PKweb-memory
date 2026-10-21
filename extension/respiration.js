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
  const nextEntry = (q) => q.capsules.flatMap((c) => q.entries
    .filter((e) => e.capsuleId === c.id && e.state === "pending").reverse())[0];
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
      if (!boot && q) {
        // Recharger l'extension efface storage.session, mais pas les ids Chrome.
        // Retrouver la fenêtre d'origine évite de reprendre la file dans la
        // fenêtre du dashboard en laissant les 90 onglets ailleurs.
        const live = q.windowId != null ? await windowTabs(q.windowId) : null;
        const sameWindow = live?.some((tab) => q.entries.some((e) => e.state === "open"
          && e.tabId === tab.id && e.url === urlOf(tab)));
        q.paused = true;
        q.reason = sameWindow ? "Extension rechargée. Reprendre réduira les onglets dans la fenêtre d’origine."
          : "Chrome ou l’extension a redémarré. Reprenez la file dans la fenêtre de votre choix.";
        if (!sameWindow) {
          q.windowId = null;
          for (const e of q.entries) if (!["done", "outside"].includes(e.state)) { e.state = "pending"; e.tabId = null; }
        }
        await write(q);
      } else if (q?.entries.some((e) => ["opening", "parking"].includes(e.state))) {
        // Interruption entre une opération Chrome et sa confirmation persistée.
        q.paused = true;
        q.reason = "Une opération a été interrompue. Reprendre vérifie les onglets déjà ouverts.";
        for (const e of q.entries) {
          if (e.state === "opening") { e.state = "pending"; e.tabId = null; }
          else if (e.state === "parking") {
            const tab = await chrome.tabs.get(e.tabId).catch(() => null);
            e.state = tab ? "open" : "pending"; e.tabId = tab?.id ?? null;
          }
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
        entry.state = "pending"; entry.tabId = null; delete entry.keepReason;
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
        } else if (e.state === "open" || e.state === "opening") {
          // Un événement perdu n'est jamais assimilé à « traité ».
          e.state = "pending"; e.tabId = null;
        }
      }
    }
    async function fill(q) {
      if (q.paused || q.stopped) return;
      let tabs = await windowTabs(q.windowId);
      if (!tabs) return suspend(q, "Fenêtre fermée. La file vous attend.");
      // Ne pas réconcilier ici les ids manquants : plusieurs ⌘W peuvent être
      // en vol. Leurs événements onRemoved les marqueront traités, jamais pending.
      let slots = Math.max(0, q.target - tabs.filter(web).length);
      while (slots-- > 0) {
        const e = nextEntry(q);
        if (!e) break;
        tabs = await windowTabs(q.windowId);
        if (!tabs) return suspend(q, "Fenêtre fermée. La file vous attend.");
        if (tabs.filter(web).length >= q.target) break;
        // Adopter une page rouverte manuellement au lieu de la dupliquer.
        const ids = new Set(q.entries.filter((item) => item.state === "open").map((item) => item.tabId));
        const existing = tabs.find((t) => !ids.has(t.id) && urlOf(t) === e.url);
        if (existing) { e.state = "open"; e.tabId = existing.id; await write(q); slots++; continue; }
        e.state = "opening";
        await write(q);
        try {
          if (closing.has(q.windowId)) { e.state = "pending"; return suspend(q, "Fenêtre fermée. La file vous attend."); }
          const tab = await chrome.tabs.create({ windowId: q.windowId, url: e.url,
            active: false, index: tabs.filter((t) => t.pinned).length });
          e.tabId = tab.id; e.state = "open";
          await write(q);
        } catch (error) {
          e.state = "pending"; e.tabId = null; q.paused = true;
          q.reason = `Ouverture interrompue : ${error.message}. La page reste dans la file.`;
          await write(q); break;
        }
      }
    }
    async function suspend(q, reason) {
      q.paused = true; q.reason = reason; q.windowId = null;
      for (const e of q.entries) if (!["done", "outside"].includes(e.state)) { e.state = "pending"; e.tabId = null; }
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
          url: urlOf(t), title: t.title || urlOf(t), state: "open", tabId: t.id }));
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
      const wasPaused = q.paused;
      q.paused = true;
      q.reason = "Enregistrement et fermeture des onglets en trop…";
      await write(q);
      let closed = 0;
      for (const tab of ordered) {
        const e = q.entries.find((entry) => entry.state === "open" && entry.tabId === tab.id);
        if (!e) continue;
        delete e.keepReason;
        if (keep.has(tab.id)) continue;
        if (await park(q, e)) closed++;
      }
      const remaining = await windowTabs(q.windowId);
      if (!remaining) return suspend(q, "Fenêtre fermée. La file vous attend.");
      const after = remaining.filter(web).length;
      const playing = q.entries.filter((e) => e.state === "open" && e.keepReason === "media").length;
      q.compaction = { before: ordered.length, after, closed, playing, at: Date.now() };
      q.paused = wasPaused;
      q.reason = after > q.target + playing ? `Réduction incomplète : ${after} onglets ouverts. Une fermeture a échoué ; réessayez.`
        : playing ? `${q.target} derniers onglets + ${playing} lecture(s) en cours (vidéo ou audio). Elles seront fermées à l’arrêt si elles sont toujours en trop.` : "";
      await write(q);
      return `${closed} onglet(s) fermé(s) et sauvegardé(s) · ${after} ouverts${playing ? ` dont ${playing} en lecture` : ""}.`;
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
        return { message: "Onglet activé." };
      }
      // Les pages encore ouvertes ont pu naviguer depuis le dernier événement.
      for (const tab of tabs.filter(web)) await applyUpdate(q, tab);
      if (entry.state === "open" && tabs.some((t) => t.id === entry.tabId)) {
        await write(q);
        await chrome.tabs.update(entry.tabId, { active: true });
        await chrome.windows.update(q.windowId, { focused: true });
        return { message: "Onglet activé." };
      }
      await rememberTabs(q, tabs.filter(web));
      const previous = { state: entry.state === "open" ? "pending" : entry.state, tabId: null, paused: q.paused, reason: q.reason };
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
        q.paused = previous.paused; q.reason = previous.reason;
        await write(q);
        throw new Error(`Ouverture impossible : ${error.message}. Les onglets ouverts sont conservés.`);
      }
      entry.state = "open"; entry.tabId = opened.id; delete entry.keepReason;
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
        if (current.filter(web).length <= q.target + playing.length) break;
        if (playing.some((e) => e.tabId === tab.id)) continue;
        const candidate = q.entries.find((e) => e.state === "open" && e.tabId === tab.id);
        if (candidate && await park(q, candidate)) exchanged++;
      }
      const remaining = await windowTabs(q.windowId);
      if (!remaining) { await suspend(q, "Fenêtre fermée. La file vous attend."); throw new Error(q.reason); }
      const playing = q.entries.filter((e) => e.state === "open" && e.keepReason === "media"
        && remaining.some((t) => t.id === e.tabId)).length;
      if (remaining.filter(web).length > q.target + playing) {
        // Si toutes les fermetures sont refusées, annuler l’arrivée si possible.
        const rolledBack = await park(q, entry);
        if (rolledBack) { entry.state = previous.state; entry.tabId = previous.tabId; }
        q.paused = true;
        q.reason = rolledBack ? "Échange annulé : Chrome a refusé de libérer une place. La page reste retrouvable."
          : "Échange incomplet : Chrome a refusé une fermeture. Réduisez les onglets avant de reprendre.";
        await write(q);
        throw new Error(q.reason);
      }
      q.paused = previous.paused; q.reason = previous.reason;
      await write(q);
      await chrome.tabs.update(opened.id, { active: true });
      await chrome.windows.update(q.windowId, { focused: true });
      return { message: exchanged ? `${exchanged} page(s) remise(s) en réserve · page choisie ouverte.` : "Page choisie ouverte." };
    }
    // ⌘⌥W « fermer à revenir » : l'onglet actif de la fenêtre de tournée part
    // en réserve (jamais « traité »), remis en fin de file de sa capsule, et
    // la page suivante entre en arrière-plan. En pause, l'onglet est rangé
    // sans relancer le remplissage — même sémantique que l'échange manuel.
    async function closeActive(q) {
      if (q.stopped) throw new Error("Aucune tournée en cours.");
      if (q.windowId == null) throw new Error("Reprenez la tournée dans une fenêtre avant de fermer à revenir.");
      const active = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
      if (!active || active.windowId !== q.windowId || !web(active)) {
        return { message: "« À revenir » n'agit que sur l'onglet actif de la fenêtre de tournée." };
      }
      if ((await applyUpdate(q, active)).changed) await write(q);
      const entry = q.entries.find((e) => e.state === "open" && e.tabId === active.id);
      if (!entry) return { message: "L'onglet actif n'est pas une page de la tournée." };
      const previous = { paused: q.paused, reason: q.reason };
      q.paused = true; // comme l'échange manuel : un arrêt du worker reste récupérable
      await write(q);
      const ok = await park(q, entry);
      if (!ok) {
        q.paused = previous.paused; q.reason = previous.reason;
        await write(q);
        const cause = entry.keepReason === "media" ? "une lecture est en cours (conservée)"
          : entry.keepReason === "changed" ? "la page vient de changer" : "Chrome a refusé la fermeture";
        if (entry.keepReason !== "media") delete entry.keepReason;
        return { message: `Fermeture à revenir annulée : ${cause}.` };
      }
      // Fin de file dans sa capsule (nextEntry lit les pendus à l'envers) :
      // la page fermée sera la dernière rappelée de son lot.
      q.entries.splice(q.entries.indexOf(entry), 1);
      q.entries.unshift(entry);
      q.paused = previous.paused; q.reason = previous.reason;
      await write(q);
      if (!previous.paused) await fill(q);
      return { message: `« À revenir » · ${pending(q).length} page(s) en réserve.` };
    }
    async function start(payload) {
      await init();
      const previous = await read();
      if (previous && !previous.stopped) throw new Error("Une tournée existe déjà. Reprenez-la ou terminez-la avant d’en créer une autre.");
      const target = Number(payload.target);
      if (!Number.isInteger(target) || target < 1 || target > 30) throw new Error("Choisissez entre 1 et 30 onglets.");
      const tabs = await windowTabs(payload.windowId);
      if (!tabs) throw new Error("Choisissez une fenêtre Chrome normale ouverte.");
      const webTabs = tabs.filter(web).sort((a, b) => a.index - b.index);
      if (!webTabs.length) throw new Error("Cette fenêtre ne contient aucun onglet web.");
      const groups = await chrome.tabGroups.query({ windowId: payload.windowId });
      const q = { version: 1, id: crypto.randomUUID(), windowId: payload.windowId, target,
        paused: true, stopped: false, reason: "Préparation de la tournée", capsules: [], entries: [] };
      // Segments contigus : ne jamais mélanger l'ordre d'onglets non groupés.
      let capsule, lastGroup;
      for (const tab of webTabs) {
        if (!capsule || lastGroup !== tab.groupId) {
          const group = groups.find((g) => g.id === tab.groupId);
          capsule = { id: crypto.randomUUID(), title: group?.title || "Onglets de la fenêtre", color: group?.color || "grey" };
          q.capsules.unshift(capsule); lastGroup = tab.groupId;
        }
        q.entries.push({ id: crypto.randomUUID(), capsuleId: capsule.id, url: urlOf(tab), title: tab.title || urlOf(tab),
          state: "open", tabId: tab.id, pinned: !!tab.pinned, group: tab.groupId === -1 ? "" : String(tab.groupId),
          groupTitle: capsule.title, groupColor: capsule.color });
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
      const remaining = (await windowTabs(q.windowId) || []).filter(web).length;
      return { message: `Respiration · ${remaining} onglets ouverts · ${pending(q).length} pages fermées, à revenir.${q.reason ? ` ${q.reason}` : ""}` };
    }
    async function command(type, payload = {}) {
      if (type === "start") return start(payload);
      const q = await get();
      if (type === "status") return q;
      if (!q) throw new Error("Activez d’abord Respiration.");
      if (type === "select") return select(q, payload.id);
      if (type === "closeActive") return closeActive(q);
      if (type === "compact") {
        if (q.windowId == null) q.windowId = payload.windowId;
        return { message: await compact(q) };
      } else if (type === "pause" || type === "stop") {
        q.paused = true; q.stopped = type === "stop";
        q.reason = type === "stop" ? "Tournée terminée. Les capsules restent dans vos sessions." : "Remplissage en pause";
      } else if (type === "resume") {
        const targetWindow = q.windowId ?? payload.windowId;
        const tabs = await windowTabs(targetWindow);
        if (!tabs) throw new Error("Choisissez une fenêtre ouverte pour reprendre.");
        q.windowId = targetWindow; q.paused = false; q.stopped = false; q.reason = "";
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
      if (entry) { entry.state = "done"; entry.tabId = null; await write(q); }
      await fill(q);
    }
    async function detached(id, info) {
      const q = await get();
      if (!q || q.windowId !== info.oldWindowId) return;
      // Déplacer un onglet n'est pas le traiter, ni une raison d'en ouvrir un autre.
      q.paused = true; q.reason = "Onglet déplacé dans une autre fenêtre. Reprenez quand vous êtes prêt.";
      const e = q.entries.find((item) => item.tabId === id);
      if (e) { e.state = "outside"; e.tabId = null; }
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
      if (e.state === "open" && e.url === url && e.title === title) return { changed: false };
      e.state = "open"; e.tabId = tab.id; e.url = url; e.title = title;
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
      if (tabs && tabs.filter(web).length > q.target) await compact(q);
    }
    async function externalClose(ids) {
      const q = await get();
      if (!q || q.stopped) return;
      const selected = q.entries.filter((e) => e.state === "open" && ids.includes(e.tabId));
      if (!selected.length) return;
      q.paused = true; q.reason = "Fermeture groupée : remplissage en pause.";
      for (const e of selected) { e.state = "pending"; e.tabId = null; }
      await write(q);
    }
    return { get, command, noticeRemoval, removed, detached, updated, updatedMany, externalClose, tick };
  }
  globalThis.PKRespiration = { KEY, create, nextEntry, pending, inspectPage, normalizeSystemCapsules };
})();
