// Coque Tauri de Tokidachi : fenêtre compagnon + détection de verrouillage de
// session (GDD §6.1 : le Compagnon ne vit que PC déverrouillé, gelé sinon).
//
// macOS : on interroge CGSessionCopyCurrentDictionary ~1 Hz et on cherche la
// clé "CGSSessionScreenIsLocked" — présente et vraie quand l'écran est
// verrouillé. Simple, robuste, et le coût d'un poll par seconde est nul.
// Windows (WM_WTSSESSION_CHANGE) et Linux (logind/dbus) viendront ensuite.

use tauri::{Emitter, Manager, PhysicalPosition};

const LOCK_EVENT: &str = "tokidachi://lock-state";

/// Place la fenêtre compagnon en bas à droite de l'écran OÙ EST LA SOURIS —
/// c'est là que l'utilisateur regarde. Repli : l'écran de la fenêtre.
fn position_bottom_right(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let cursor_monitor = app.cursor_position().ok().and_then(|cursor| {
        window.available_monitors().ok()?.into_iter().find(|m| {
            let p = m.position();
            let s = m.size();
            cursor.x >= p.x as f64
                && cursor.x < (p.x + s.width as i32) as f64
                && cursor.y >= p.y as f64
                && cursor.y < (p.y + s.height as i32) as f64
        })
    });
    let monitor = match cursor_monitor.or_else(|| window.current_monitor().ok().flatten()) {
        Some(m) => m,
        None => return,
    };
    let Ok(win_size) = window.outer_size() else {
        return;
    };
    let scale = monitor.scale_factor();
    let margin = (16.0 * scale) as i32;
    let dock_allowance = (70.0 * scale) as i32; // Dock macOS en bas
    let pos = monitor.position();
    let size = monitor.size();
    let x = pos.x + size.width as i32 - win_size.width as i32 - margin;
    let y = pos.y + size.height as i32 - win_size.height as i32 - dock_allowance;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

#[cfg(target_os = "macos")]
mod session_lock {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::CFString;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSessionCopyCurrentDictionary() -> CFDictionaryRef;
    }

    pub fn is_locked() -> bool {
        unsafe {
            let dict_ref = CGSessionCopyCurrentDictionary();
            if dict_ref.is_null() {
                // Pas de session graphique joignable : considérer verrouillé
                // (le gel est le comportement sûr).
                return true;
            }
            let dict: CFDictionary = CFDictionary::wrap_under_create_rule(dict_ref);
            let key = CFString::from_static_string("CGSSessionScreenIsLocked");
            match dict.find(key.as_CFTypeRef() as *const _) {
                Some(value) => {
                    let b: CFBoolean = CFBoolean::wrap_under_get_rule(*value as _);
                    b.into()
                }
                None => false,
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod session_lock {
    pub fn is_locked() -> bool {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            position_bottom_right(app);
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last = session_lock::is_locked();
                loop {
                    let locked = session_lock::is_locked();
                    if locked != last {
                        last = locked;
                        let _ = handle.emit(LOCK_EVENT, locked);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
