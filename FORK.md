# JotDrop fork

This is the independent wert-rar fork of [Diexar Labs JotDrop](https://github.com/Diexar-Labs/jotdrop), based on plugin 0.20.4, commit `722024792bad2176ea757b06c905404eb63ff5a6`.

## Identity and provenance
- Repository: https://github.com/wert-rar/jotdrop; upstream remote: Diexar-Labs/jotdrop.
- The user chose to retain plugin name JotDrop and id `jotdrop`; settings stay in the same plugin folder. Do not enable two copies simultaneously.
- Version 0.20.4 currently identifies the upstream baseline, not a published fork release. No release tag or ZIP has been issued.
- MIT license and author attribution remain; native editor attribution is in THIRD_PARTY.md.
- The upstream AGENTS.md referenced a gitignored, unshipped machine-specific Hand-off/HANDOFF.md. This tracked document replaces that reference for this fork; the source verification gate remains enabled.

## Features
Full Obsidian Markdown rendering; native Live Preview with Save/Archive drafts and Cancel; compact icon controls; initial measured masonry; exact target-column drag placement; sparse note ranks and saved per-note columns; retained DOM and scroll; upstream title marker cleanup; checkbox writes update in place.

## Development
Run `npm ci`, `npm run build`, then `npm run check:fork`. The browser fixture needs Playwright available to Node and installed Microsoft Edge. It runs the production bundle with mocked Obsidian services and disposable notes. No real vault is accessed.

src/customizations.js is a readable source module imported from TypeScript and bundled by esbuild. It retains the tested prototype extensions; there is no post-build patching or dependency on minified class names. Further migration of those extensions into class methods is a separate refactor.

## Release requirements
Check native Live Preview, theme, tooltips, checkbox state, archive and drag placement in Obsidian before release. The editor uses internal APIs verified previously against Obsidian 1.13.7. Mobile touch reorder is not implemented. Do not replace a working installed build while preparing candidates.
