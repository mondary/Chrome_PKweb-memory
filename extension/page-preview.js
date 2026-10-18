"use strict";
(() => {
  // Un seul aperçu, chargé à la demande : aucune page de la file n’est réveillée.
  function bind({ previewSource, fallbackThumb }) {
    const card = document.createElement("div");
    card.id = "session-icon-preview";
    card.className = "session-icon-preview";
    card.setAttribute("popover", "manual");
    card.setAttribute("role", "tooltip");
    card.innerHTML = '<div class="session-icon-shot"></div><div class="session-icon-caption"><strong></strong><span></span></div>';
    document.body.append(card);
    const shot = card.querySelector(".session-icon-shot");
    let anchor = null, pointer = null, showTimer, hideTimer, imageTimer, generation = 0;
    const hide = () => {
      clearTimeout(showTimer); clearTimeout(hideTimer); clearTimeout(imageTimer);
      generation++;
      if (anchor) {
        const ids = (anchor.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== card.id);
        if (ids.length) anchor.setAttribute("aria-describedby", ids.join(" "));
        else anchor.removeAttribute("aria-describedby");
      }
      anchor = null;
      card.hidePopover();
      shot.replaceChildren();
    };
    const position = () => {
      if (!anchor?.isConnected) return hide();
      const rect = anchor.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, innerWidth - box.width - 8));
      const below = rect.bottom + 8;
      const top = below + box.height <= innerHeight - 8 ? below : Math.max(8, rect.top - box.height - 8);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    };
    const find = (target) => {
      if (!(target instanceof Element)) return null;
      const trigger = target.closest(".respiration-fav, [data-page-trigger]") || target.closest(".tl-fav[data-page-url]");
      const img = trigger?.matches("img") ? trigger : trigger?.querySelector(".tl-fav[data-page-url]");
      return img ? { trigger, img } : null;
    };
    const show = (item, immediate = false) => {
      clearTimeout(hideTimer);
      if (anchor === item.trigger) return;
      hide();
      anchor = item.trigger;
      const token = generation;
      const { pageUrl: url, pageTitle: title } = item.img.dataset;
      showTimer = setTimeout(async () => {
        if (token !== generation || !anchor?.isConnected) return;
        card.querySelector("strong").textContent = title;
        card.querySelector(".session-icon-caption > span").textContent = url;
        shot.textContent = "Chargement de la vignette…";
        anchor.setAttribute("aria-describedby", [anchor.getAttribute("aria-describedby"), card.id].filter(Boolean).join(" "));
        card.showPopover();
        position();
        const unavailable = () => {
          if (token !== generation) return;
          clearTimeout(imageTimer);
          shot.textContent = "Vignette indisponible pour cette page";
        };
        imageTimer = setTimeout(unavailable, 12000);
        try {
          const src = await previewSource(url) || fallbackThumb(url);
          if (token !== generation) return;
          if (!src) return unavailable();
          const img = new Image();
          img.alt = `Aperçu de ${title}`;
          img.onload = () => {
            if (token !== generation) return;
            clearTimeout(imageTimer);
            shot.replaceChildren(img);
          };
          img.onerror = unavailable;
          img.src = src;
        } catch { unavailable(); }
      }, immediate ? 0 : 180);
    };
    const leave = (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && (card.contains(next) || anchor?.contains(next))) return;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 160);
    };
    document.addEventListener("mousemove", (event) => { pointer = { x: event.clientX, y: event.clientY }; });
    document.addEventListener("mouseover", (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (card.contains(event.target)) { clearTimeout(hideTimer); return; }
      const item = find(event.target);
      if (item) show(item);
    });
    document.addEventListener("mouseout", (event) => {
      if (anchor?.contains(event.target) || card.contains(event.target)) leave(event);
    });
    document.addEventListener("focusin", (event) => {
      const item = find(event.target);
      if (item) show(item, true);
      else hide();
    });
    document.addEventListener("focusout", leave);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
    document.addEventListener("click", (event) => { if (!card.contains(event.target)) hide(); });
    document.addEventListener("scroll", (event) => { if (!card.contains(event.target)) hide(); }, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    // Les grilles sont recréées lors des mises à jour de la file.
    new MutationObserver(() => {
      if (!anchor || anchor.isConnected) return;
      const previous = find(anchor)?.img.dataset.pageUrl;
      const replacement = pointer && find(document.elementFromPoint(pointer.x, pointer.y));
      hide();
      if (replacement?.img.dataset.pageUrl === previous) show(replacement);
    }).observe(document.body, { childList: true, subtree: true });
  }

  globalThis.PKPagePreview = { bind };
})();
