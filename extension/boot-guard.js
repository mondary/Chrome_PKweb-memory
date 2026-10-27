/* Filet de sécurité chargé avant tous les autres scripts de la page.
   Si une erreur empêche Sessions de démarrer, elle est conservée dans le
   stockage local et un bouton de rechargement remplace le squelette muet.
   Script externe (pas inline) pour respecter la CSP des pages d'extension. */
(() => {
  const save = (entry) => {
    try { chrome.storage.local.set({ "bs.lastError": entry }); } catch { /* contexte invalidé */ }
  };
  addEventListener("error", (event) => save({
    kind: "error", message: event.message, source: event.filename,
    line: event.lineno, column: event.colno, stack: event.error?.stack || "", at: Date.now(),
  }));
  addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    save({
      kind: "rejection", message: String(reason?.message || reason || "Promesse rejetée"),
      stack: reason?.stack || "", at: Date.now(),
    });
  });
  setTimeout(() => {
    const host = document.getElementById("sessions-root");
    if (!host || document.getElementById("bss-boot-fallback")) return;
    const skeleton = host.querySelector(".tl-skel");
    const real = host.querySelector(".tl-session:not(.tl-skel), .tl-empty:not(.tl-skel)");
    if (!skeleton || real) return;
    const banner = document.createElement("p");
    banner.id = "bss-boot-fallback";
    banner.className = "tl-empty";
    banner.setAttribute("role", "alert");
    banner.innerHTML = `Sessions ne démarre pas. <button type="button" class="btn btn-ghost btn-sm">Recharger la page</button><span id="bss-boot-fallback-detail"></span>`;
    banner.querySelector("button").addEventListener("click", () => location.reload());
    host.prepend(banner);
    try {
      chrome.storage.local.get("bs.lastError").then((data) => {
        const error = data["bs.lastError"];
        const detail = document.getElementById("bss-boot-fallback-detail");
        if (error && detail) detail.textContent = ` · ${error.message || "erreur inconnue"}`;
      }).catch(() => {});
    } catch { /* contexte invalidé : le bouton reste utile */ }
  }, 6000);
})();
