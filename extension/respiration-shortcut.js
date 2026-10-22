/* ⌘⌥W est refusé dans manifest.commands, mais reste un événement clavier
   utilisable dans les pages web. Monde isolé, aucune lecture du contenu du site.
   Installé aussi dans les cadres pour fonctionner lorsqu'ils ont le focus. */
(() => {
  "use strict";
  // Une réinjection après rechargement ne doit jamais doubler la commande.
  globalThis.__pkRespirationShortcutCleanup?.();
  let busy = false;
  let notice, timer;

  function report(message) {
    clearTimeout(timer);
    notice?.remove();
    notice = document.createElement("div");
    notice.style.cssText = "position:fixed;bottom:20px;right:20px;max-width:calc(100vw - 40px);z-index:2147483647;pointer-events:none;";
    const root = notice.attachShadow({ mode: "closed" });
    const text = document.createElement("p");
    text.setAttribute("role", "status");
    text.style.cssText = "margin:0;padding:12px 16px;background:#18181b;color:#fff;border-radius:8px;font:14px/1.5 -apple-system,sans-serif;max-width:440px;";
    root.append(text);
    (document.body || document.documentElement).append(notice);
    text.textContent = `PK Web Memory · ${message}`;
    timer = setTimeout(() => notice?.remove(), 6000);
  }

  async function onKey(event) {
    // Les anciens content scripts peuvent survivre dans un onglet lors d'une
    // recharge d'extension. Ils doivent laisser passer la touche au nouveau.
    if (!chrome.runtime?.id) { globalThis.__pkRespirationShortcutCleanup?.(); return; }
    // Option peut changer key en « ∑ ». Le code virtuel Chrome conserve W=87,
    // y compris en AZERTY et dans une iframe où getLayoutMap est indisponible.
    const isW = event.key?.toLowerCase() === "w" || event.keyCode === 87 || (!event.keyCode && event.code === "KeyW");
    if (!event.isTrusted || event.isComposing || !event.metaKey || !event.altKey || event.ctrlKey || event.shiftKey || !isW) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || busy) return;
    busy = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "respiration-shortcut" });
      if (!response?.ok) report(response?.error || "Rechargez cette page pour activer ⌘⌥W.");
      else if (response.data?.closed !== true) report(response.data?.message || "Aucune page déplacée.");
    } catch {
      report("Rechargez cette page pour activer ⌘⌥W.");
    } finally { busy = false; }
  }
  window.addEventListener("keydown", onKey, true);
  globalThis.__pkRespirationShortcutCleanup = () => {
    window.removeEventListener("keydown", onKey, true);
    clearTimeout(timer);
    notice?.remove();
  };
})();
