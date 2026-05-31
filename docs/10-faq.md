# 10. FAQ & Troubleshooting

### Where do my projects live?

Two places, both under your control:

1. **In your browser** — IndexedDB holds recents, file handles, and
   encrypted secrets.
2. **On your disk** — every `Save` writes a `.chitra` zip wherever you
   pointed the picker. The zip is portable; copy it to another
   machine and `Open` works exactly the same.

### Does Chitra phone home?

No. There is no Chitra server. After the initial PWA load, no
outbound traffic happens unless you explicitly enable an AI provider
or publish to Notion/Confluence.

### Why does Save behave differently in Firefox / Safari?

The full **Save in place** experience uses the
[File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_Access_API),
which currently ships only on Chromium browsers (Chrome, Edge, Brave,
Opera, Arc). On other browsers Chitra falls back to a regular
download for Save and a file picker for Open — the data is identical;
only the UX is one extra click.

### Is there a desktop app?

`apps/desktop/` is a placeholder reserved for a future Electron /
Tauri wrapper. The web app's `platform/` adapter mirrors the API an
Electron preload bridge would expose, so wrapping is a drop-in.

### How do I add a new card type?

1. Add the literal to the `CardType` enum in
   [`packages/core/src/schemas.ts`](../packages/core/src/schemas.ts).
2. Add classifier rules for it in
   `packages/composer/src/index.ts` (keyword + optional structural).
3. Register a default visual style in `apps/web/src/cardStyles.ts`.
4. Run `pnpm typecheck` — every exhaustive `switch` over `CardType`
   will report the missing arm.

### How do I add a new template?

1. Append a `Template` literal to `packages/templates/src/registry.ts`.
2. Export it from the registry array at the bottom of the file.
3. It appears in the Templates view (`Cmd/Ctrl + T`) automatically.

### How do I add a new export format?

1. Add a pure converter to `packages/exports/src/index.ts` that takes
   a `Project` and returns the artefact (string / bytes).
2. Add a thin adapter in `apps/web/src/exports/runExport.ts` that
   passes the bytes to `platform.fileSave(...)`.
3. Wire it into the Export menu and the Command Palette.

### My build fails on Netlify with `tsc: not found`.

`NODE_ENV=production` was set in `[build.environment]`, which makes
pnpm skip devDependencies. Remove it — Vite sets `NODE_ENV` internally
for bundling.

### Hot reload shows old code.

The dev service worker is disabled by config. If it ever re-registers,
DevTools → Application → Service Workers → **Unregister** and hard
reload. The production SW uses `skipWaiting + clientsClaim`, so a new
deploy replaces the old one without the "click reload twice" dance.

### Where do AI keys live?

In IndexedDB, **encrypted** with a key derived from your passphrase
(`apps/web/src/platform/secrets.ts`). The first AI call per session
prompts for the passphrase via `PassphrasePrompt.tsx`. Keys never
leave the browser except in outbound HTTPS calls to the provider you
configured.

### Can I use Chitra offline?

Yes — once the PWA has loaded once, the service worker caches every
asset. Open new projects, edit, save, and export entirely offline.
AI and Publish features obviously need network.

### What's the schema version policy?

`PROJECT_SCHEMA_VERSION` is `1`. Files with a higher version than the
current build supports refuse to open with a clear error. Migrations
(when needed) will be added forward-only as `v1 → v2 → v3` and will
never silently rewrite older files.
