# @relay/desktop

The founder control plane: Tauri v2 shell + React 19 UI. Talks to two local
services over HTTP — the NestJS backend (`:3000`, product API) and the
runtime daemon (`127.0.0.1:51720`, workspace admin RPC). No custom Rust
commands; release builds spawn the daemon as a sidecar.

```bash
pnpm dev          # from the repo root — full stack + this app
pnpm dev:web      # same, but the UI runs in the browser (no Rust build)
```
