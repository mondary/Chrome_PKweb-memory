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
    async function compact(q) {
      const tabs = await windowTabs(q.windowId);
      if (!tabs) throw new Error("Choisissez une fenêtre ouverte pour réduire la tournée.");
      await reconcile(q, tabs, true);
      const ordered = tabs.filter(web).sort((a, b) => a.index - b.index);
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
      if (!q) throw new Error("Activez d’abord Respiration.");
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
