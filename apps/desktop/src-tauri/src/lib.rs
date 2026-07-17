use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
// Only used in the release path (the daemon spawn is gated on release builds).
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

/// Holds the runtime daemon child so it can be killed when the app exits.
struct RuntimeSidecar(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // In dev the daemon is started by `pnpm dev`; only the packaged app
            // owns its own daemon, so the two never fight over :51720.
            #[cfg(not(debug_assertions))]
            {
                let sidecar = app.shell().sidecar("relay-runtime")?;
                let (_rx, child) = sidecar.spawn()?;
                app.manage(RuntimeSidecar(Mutex::new(Some(child))));
            }
            #[cfg(debug_assertions)]
            let _ = app; // silence unused in dev builds
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<RuntimeSidecar>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
