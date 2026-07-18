/**
 * Open a URL in the system browser. Inside Tauri, plain target="_blank"
 * anchors are swallowed by the webview — the opener plugin is the supported
 * path. In web mode (pnpm dev:web) fall back to window.open.
 */
export async function openExternal(url: string): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, "_blank", "noreferrer");
}
