# Trace Commons documentation

Static documentation site for `docs.tracecommons.ai`. This is an independent
Astro Starlight project inside the community repository so it can deploy and
release separately from `tracecommons.ai`.

## Local development

Node.js 22.12 or newer is required.

```sh
cd docs-site
npm install
npm run dev
```

## Verify

```sh
npm run check
npm run build
```

## Source contracts

User-facing facts are derived from the current implementations in:

- `TraceCommons/trace-commons-server`: contributor CLI/GUI, protocol, and server.
- `iqlusioninc/ironclaw`: trace CLI, client, queue worker, and web UI.

Last reconciled on 2026-08-12 against server
`47a3351c27176fa5278f244b43f9d5f8318f32ff` and Ironclaw
`173f078bbabfbf3770f6a0b2d637d88942e4f31e`.

## Cloudflare Pages

| Setting | Value |
| --- | --- |
| Root directory | `docs-site` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `22.12.0` or newer |
| Production domain | `docs.tracecommons.ai` |

Deploy the verified static build with:

```sh
npm run deploy
```
