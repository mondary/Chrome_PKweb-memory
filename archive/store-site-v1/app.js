(() => {
  const previews = {
    recherche: {
      image: 'screenshots/02-recherche.png',
      alt: 'Palette de recherche globale avec résultats par favicon et miniatures',
      index: '02',
      caption: 'Retrouvez favoris, historique et onglets ouverts depuis une seule palette.',
      label: 'Recherche globale',
    },
    historique: {
      image: 'screenshots/03-historique.png',
      alt: 'Vue réelle de l’historique de navigation, avec calendrier et timeline',
      index: '03',
      caption: 'Parcourez les jours et retrouvez le chemin d’une page à l’autre.',
      label: 'Historique de navigation',
    },
    favoris: {
      image: 'screenshots/01-inventaire.png',
      alt: 'Vue réelle de l’inventaire des favoris avec des données de démonstration',
      index: '01',
      caption: 'Voyez vos dossiers, domaines et favoris dans une même vue.',
      label: 'Inventaire des favoris',
    },
    galerie: {
      image: 'screenshots/04-galerie.png',
      alt: 'Vue réelle de la galerie visuelle des favoris',
      index: '04',
      caption: 'Reconnaissez un site d’un regard et filtrez votre collection.',
      label: 'Galerie des favoris',
    },
    doublons: {
      image: 'screenshots/05-doublons.png',
      alt: 'Vue réelle de la détection des favoris en doublon',
      index: '05',
      caption: 'Comparez les doublons avant de les envoyer en quarantaine.',
      label: 'Détection des doublons',
    },
    sessions: {
      image: 'screenshots/06-sessions.png',
      alt: 'Vue réelle de la session en cours et des sessions sauvegardées',
      index: '06',
      caption: 'Voyez les favicônes de la session en cours, puis rouvrez une journée ou un instantané.',
      label: 'Sessions Chrome',
    },
  };

  const tabs = [...document.querySelectorAll('[data-preview]')];
  const image = document.getElementById('preview-image');
  const panel = document.getElementById('preview-panel');
  const index = document.getElementById('preview-index');
  const caption = document.getElementById('preview-caption');
  let current = 'historique';
  let swapId = 0;

  function showPreview(key, moveFocus = false) {
    const next = previews[key];
    if (!next || !image || !panel) return;
    const selected = tabs.find((tab) => tab.dataset.preview === key);
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    if (moveFocus) selected?.focus();
    panel.setAttribute('aria-label', next.label);
    index.textContent = next.index;
    caption.textContent = next.caption;
    if (key === current) return;
    current = key;
    const id = ++swapId;
    image.classList.add('is-changing');
    const preloaded = new Image();
    preloaded.onload = () => {
      if (id !== swapId) return;
      image.src = next.image;
      image.alt = next.alt;
      requestAnimationFrame(() => image.classList.remove('is-changing'));
    };
    preloaded.onerror = () => {
      if (id !== swapId) return;
      image.classList.remove('is-changing');
    };
    preloaded.src = next.image;
  }

  tabs.forEach((tab, position) => {
    tab.addEventListener('click', () => showPreview(tab.dataset.preview));
    tab.addEventListener('keydown', (event) => {
      let target;
      if (event.key === 'ArrowRight') target = (position + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') target = (position - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = tabs.length - 1;
      else return;
      event.preventDefault();
      showPreview(tabs[target].dataset.preview, true);
    });
  });

  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('has-js');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: .12, rootMargin: '0px 0px 40px 0px' });
    reveals.forEach((element) => observer.observe(element));
  }
})();
