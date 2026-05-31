# 9. Deployment

## 9.1 Netlify

Configured by [`netlify.toml`](../netlify.toml). A push to the tracked
branch triggers:

```
pnpm install --frozen-lockfile && pnpm build
```

with these environment pins:

| Variable | Value | Why |
|---|---|---|
| `NODE_VERSION` | `20.11.1` | matches `engines.node` |
| `PNPM_VERSION` | `9.12.0` | matches `packageManager` |
| `NPM_CONFIG_PRODUCTION` | `false` | keep devDeps so `tsc`/`vite` exist on CI |
| `CI` | `true` | suppress optional postinstall noise |

> Do **not** set `NODE_ENV=production` in `[build.environment]` — pnpm
> will skip devDependencies and the workspace package builds will fail
> with `tsc: not found`. Vite already sets `NODE_ENV=production`
> internally for the bundling step.

### Publish directory

`apps/web/dist` — Vite's static output.

### Redirects

```toml
[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200
```

Single SPA fallback so deep links and hard refreshes resolve to the
React shell.

### Cache headers

| Path | Policy | Reason |
|---|---|---|
| `/excalidraw-assets/*` | `public, max-age=31536000, immutable` | hashed filenames; safe to pin for a year |
| `/assets/*` | `public, max-age=31536000, immutable` | Vite emits content-hashed names |
| `/index.html` | revalidate (no immutable) | new deploys must be picked up immediately, otherwise the PWA shell stays stale |

## 9.2 Any static host

The build output is a plain folder. Drop `apps/web/dist/` onto:

- GitHub Pages
- Cloudflare Pages
- Vercel (static preset)
- S3 + CloudFront
- An Nginx / Caddy server

Required server behaviour:

1. **SPA fallback** — every unknown path serves `index.html` with HTTP 200.
2. **Long cache** for hashed assets, **revalidate** for `index.html`.
3. **HTTPS** is required for the File System Access API and for the
   service worker to register.

## 9.3 PWA behaviour

Configured by `vite-plugin-pwa` in
[`apps/web/vite.config.ts`](../apps/web/vite.config.ts):

- `registerType: "autoUpdate"`
- `clientsClaim: true`, `skipWaiting: true`, `cleanupOutdatedCaches: true`
- Pre-cache: `**/*.{js,css,html,svg,png,ico,woff2}`
- Excluded from pre-cache (runtime-cached instead): the Excalidraw
  vendor chunks, which are large and lazy.
- `maximumFileSizeToCacheInBytes: 4 * 1024 * 1024` (4 MB)
- Manifest declares `name`, `short_name`, theme/background colour, and
  a maskable SVG icon.

### Service worker disabled in dev

`devOptions: { enabled: false }` — HMR is never served from a stale
cache while developing.

## 9.4 Secrets / environment variables

Chitra needs **none** for the core PWA build. Everything that touches
external services (AI providers, Notion, Confluence) is BYO at runtime
and stored in IndexedDB encrypted by a user passphrase.
