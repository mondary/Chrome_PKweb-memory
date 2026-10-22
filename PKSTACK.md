# PKSTACK

| Skill | Usage in this change | Deliverables |
|---|---|---|
| `pk-commit` | Review and commit Respiration quick access (left-click on the icon, right-click menu, ⌘T on Sessions); verify CalVer, bilingual documentation and tests | Version `2026.10.33`, scoped staging and push on the current branch |
| `pk-commits` | CalVer bump, changelog and project documentation synchronization | `extension/manifest.json`, `CHANGELOG.md`, bilingual READMEs |
| `fixing-accessibility` | Exact ⌘⌥W keyboard handling in pages and frames; status feedback without moving focus | `extension/respiration-shortcut.js`, real browser keyboard regression tests |
| `app-presence-sync` | Sync README FR/EN and the landing (FR/EN) with the side panel, manual rotation and quick access | `README.md`, `README.en.md`, `store/website/index.html`, `store/website/site-i18n.js` |
| `fixing-accessibility` | Accessible Respiration pages panel: labelled filters, live list, focus restore on dialog close, visible focus rings | `extension/sessions.js`, `extension/style.css` |
| `premium-promo-media` | Build the v4 media kit: real-UI captures (listing 1280×800 + landing 1440×1000), tile/marquee/banner/OG card, GIF + MP4 loop, reproducible capture tooling and honest method notes | `store/v4/` (`screenshots/`, `assets/`, `gifs/`, `videos/`, `PLAN.md`, `media-kit/README.md`, `tools/capture-v4.mjs`, `tools/assets.html`, `tools/build-media.sh`) |
| `publish-chrome-web-store` | Verify the published listing (review status, URL officielle field) in the EGO dashboard and submit 2026.10.22 | `store/regle-recherche-store.md`, `store/v4/description-store.md`, `release/bpbbglmebdopkbmgpehloggencjmfbcd-2026.10.22.zip` |
