/* PK Web Memory — vitrine : révélation au défilement + agrandissement des captures.
   Sans JS, tout le contenu reste visible (classe .js posée dans <head>) et les
   captures s'ouvrent dans un nouvel onglet via leur lien ordinaire. */
(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- révélation au défilement ---------- */
  const reveals = document.querySelectorAll(".reveal");
  if (reduced || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  }

  /* ---------- captures agrandies (dialog natif) ---------- */
  const shots = document.querySelectorAll("a.shot[href]");
  if (!shots.length || typeof HTMLDialogElement !== "function") return;

  const dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.setAttribute("aria-label", "Capture d'écran agrandie");
  dlg.innerHTML =
    '<div class="lightbox-card">' +
    '<button type="button" class="lightbox-close" aria-label="Fermer l\'agrandissement">✕</button>' +
    "<img alt=\"\">" +
    '<p class="lightbox-cap"></p>' +
    "</div>";
  document.body.appendChild(dlg);

  const img = dlg.querySelector("img");
  const cap = dlg.querySelector(".lightbox-cap");
  const card = dlg.querySelector(".lightbox-card");
  const closeBtn = dlg.querySelector(".lightbox-close");
  const localizeDialog = (language) => {
    dlg.setAttribute("aria-label", language === "en" ? "Enlarged screenshot" : "Capture d'écran agrandie");
    closeBtn.setAttribute("aria-label", language === "en" ? "Close enlarged screenshot" : "Fermer l'agrandissement");
  };
  localizeDialog(document.documentElement.lang);
  window.addEventListener("pk-web-memory-language-change", (event) => localizeDialog(event.detail.language));
  let opener = null;

  function close() {
    if (dlg.open) dlg.close();
  }

  dlg.addEventListener("close", () => {
    img.src = "";
    if (opener) { opener.focus(); opener = null; }
  });
  closeBtn.addEventListener("click", close);
  /* Échap est géré nativement (événement cancel → close). Clic hors de la carte : ferme. */
  dlg.addEventListener("click", (event) => {
    if (!card.contains(event.target)) close();
  });

  shots.forEach((link) => {
    link.addEventListener("click", (event) => {
      const source = link.querySelector("img");
      if (!source) return; // repli naturel : le lien s'ouvre dans un nouvel onglet
      event.preventDefault();
      opener = link;
      img.src = link.href;
      img.alt = source.alt;
      cap.textContent = link.dataset.caption || "";
      dlg.showModal();
    });
  });
})();
