/**
 * Native OS notifications (Tauri notification plugin). No-op in web mode.
 * Permission is requested lazily on first use and cached.
 */

let granted: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    const plugin = await import("@tauri-apps/plugin-notification");
    granted = await plugin.isPermissionGranted();
    if (!granted) {
      granted = (await plugin.requestPermission()) === "granted";
    }
  } catch {
    granted = false;
  }
  return granted;
}

export async function nativeNotify(title: string, body?: string): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return; // web mode: in-app only
  try {
    if (!(await ensurePermission())) return;
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
  } catch {
    // notifications are best-effort, never break the caller
  }
}

/** True when the user isn't looking at the app — native makes sense then. */
export function appUnfocused(): boolean {
  return document.hidden || !document.hasFocus();
}
