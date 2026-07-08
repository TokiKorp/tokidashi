// Coque Tauri de Tokidachi : fenêtre compagnon + détection de verrouillage de
// session (GDD §6.1 : le Compagnon ne vit que PC déverrouillé, gelé sinon).
//
// macOS : on interroge CGSessionCopyCurrentDictionary ~1 Hz et on cherche la
// clé "CGSSessionScreenIsLocked" — présente et vraie quand l'écran est
// verrouillé. Simple, robuste, et le coût d'un poll par seconde est nul.
// Windows (WM_WTSSESSION_CHANGE) et Linux (logind/dbus) viendront ensuite.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
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

use std::path::PathBuf;
use std::process::Command;

#[derive(serde::Serialize, serde::Deserialize)]
struct CliRunResult {
    response: String,
    cli_used: String,
    tokens_consumed: u32,
    success: bool,
    error: Option<String>,
}

fn find_binary(name: &str) -> PathBuf {
    if let Ok(output) = Command::new("which").arg(name).output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return PathBuf::from(path_str);
            }
        }
    }
    // Fallback paths based on discovery
    let home = std::env::var("HOME").unwrap_or_default();
    match name {
        "agy" => {
            let p = PathBuf::from(&home).join(".local/bin/agy");
            if p.exists() {
                return p;
            }
        }
        "codex" => {
            let p = PathBuf::from(&home).join(".nvm/versions/node/v24.15.0/bin/codex");
            if p.exists() {
                return p;
            }
        }
        "claude" => {
            let p = PathBuf::from(&home).join(".nvm/versions/node/v24.15.0/bin/claude");
            if p.exists() {
                return p;
            }
        }
        _ => {}
    }
    PathBuf::from(name)
}

#[tauri::command]
async fn run_cli_command(cli_name: String, prompt: String) -> CliRunResult {
    let cli_name_for_job = cli_name.clone();
    tokio::task::spawn_blocking(move || {
        let cli_name = cli_name_for_job;
        let binary_path = find_binary(&cli_name);
        let mut cmd = Command::new(&binary_path);

        match cli_name.as_str() {
            "agy" => {
                cmd.arg("--print").arg(&prompt);
            }
            "codex" => {
                cmd.arg("exec").arg(&prompt);
            }
            "claude" => {
                cmd.arg("-p").arg(&prompt);
            }
            _ => {
                return CliRunResult {
                    response: String::new(),
                    tokens_consumed: 0,
                    success: false,
                    error: Some(format!("Unknown CLI: {}", cli_name)),
                    cli_used: cli_name,
                };
            }
        }

        cmd.env("PAGER", "cat");

        match cmd.output() {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let mut response = stdout.clone();
                    let mut tokens_consumed = 0;

                    if cli_name == "codex" {
                        if let Some(pos) = stdout.find("tokens used") {
                            let token_section = &stdout[pos + "tokens used".len()..];
                            let digits: String =
                                token_section.chars().filter(|c| c.is_digit(10)).collect();
                            if let Ok(parsed) = digits.parse::<u32>() {
                                tokens_consumed = parsed;
                            }
                        }

                        if let Some(codex_pos) = stdout.find("codex\n") {
                            let start = codex_pos + "codex\n".len();
                            let end = stdout.find("tokens used").unwrap_or(stdout.len());
                            if start < end {
                                response = stdout[start..end].trim().to_string();
                            }
                        } else if let Some(codex_r_pos) = stdout.find("codex\r\n") {
                            let start = codex_r_pos + "codex\r\n".len();
                            let end = stdout.find("tokens used").unwrap_or(stdout.len());
                            if start < end {
                                response = stdout[start..end].trim().to_string();
                            }
                        }
                    }

                    if tokens_consumed == 0 {
                        let base_tokens = match cli_name.as_str() {
                            "agy" => 12000,
                            "codex" => 8000,
                            "claude" => 25000,
                            _ => 5000,
                        };
                        let prompt_tokens = prompt.len() as u32 / 4;
                        let resp_tokens = response.len() as u32 / 4;
                        tokens_consumed = base_tokens + prompt_tokens + resp_tokens;
                    }

                    CliRunResult {
                        response: response.trim().to_string(),
                        cli_used: cli_name,
                        tokens_consumed,
                        success: true,
                        error: None,
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    CliRunResult {
                        response: String::new(),
                        cli_used: cli_name,
                        tokens_consumed: 0,
                        success: false,
                        error: Some(format!(
                            "Exit code {}: {}",
                            output.status.code().unwrap_or(-1),
                            stderr
                        )),
                    }
                }
            }
            Err(e) => CliRunResult {
                response: String::new(),
                cli_used: cli_name,
                tokens_consumed: 0,
                success: false,
                error: Some(e.to_string()),
            },
        }
    })
    .await
    .unwrap_or_else(|e| CliRunResult {
        response: String::new(),
        cli_used: cli_name,
        tokens_consumed: 0,
        success: false,
        error: Some(format!("Task execution panicked: {}", e)),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![run_cli_command])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                if let Some(window) = app.get_webview_window("main") {
                    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
                    use cocoa::base::id;
                    if let Ok(ns_window_ptr) = window.ns_window() {
                        let ns_window = ns_window_ptr as id;
                        unsafe {
                            let collection_behavior = 
                                NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces | 
                                NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary;
                            ns_window.setCollectionBehavior_(collection_behavior);
                            ns_window.setLevel_(25); // NSMainMenuWindowLevel + 1
                        }
                    }
                }
            }

            let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Afficher", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Masquer", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            let icon = app.default_window_icon().cloned().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "No default window icon found")
            })?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

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
