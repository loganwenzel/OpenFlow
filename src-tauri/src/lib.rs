#![allow(unexpected_cfgs)]

pub mod audio;
pub mod commands;
pub mod db;
pub mod gemini;
pub mod hotkey;
pub mod macos;

use commands::{
    add_dictionary_word, add_snippet, cancel_dictation, check_permissions,
    delete_dictionary_word, delete_history, delete_snippet, get_app_settings,
    get_audio_devices, get_dictation_state, get_dictionary_entries, get_history,
    get_snippet_entries, open_system_settings, paste_text,
    request_accessibility_permission, save_app_settings, start_dictation,
    stop_dictation, update_dictation, AppSession,
};
use db::{get_settings, DbState};
use hotkey::{start_hotkey_listener, HotkeyConfig};
use tauri::{LogicalPosition, LogicalSize, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_state = DbState::new().expect("Failed to initialize SQLite database");
    let app_session = AppSession::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db_state)
        .manage(app_session)
        .setup(|app| {
            // Position the floating pill window at bottom-center of the primary monitor using Logical coordinates
            if let Some(pill_window) = app.get_webview_window("pill") {
                macos::configure_pill_window(&pill_window);
                if let Ok(Some(monitor)) = pill_window.primary_monitor() {
                    let scale = monitor.scale_factor();
                    let pill_w = 340.0f64;
                    let pill_h = 200.0f64;
                    let screen_w = monitor.size().width as f64 / scale;
                    let screen_h = monitor.size().height as f64 / scale;
                    let x = (screen_w - pill_w) / 2.0;
                    let y = screen_h - pill_h - 48.0;

                    let _ = pill_window.set_size(LogicalSize::new(pill_w, pill_h));
                    let _ = pill_window.set_position(LogicalPosition::new(x, y));
                    let _ = pill_window.set_always_on_top(true);
                    macos::hide_pill_window(&pill_window);
                }
            }

            // Start background global hotkey listener
            let app_handle_start = app.handle().clone();
            let app_handle_stop = app.handle().clone();
            let app_handle_cfg = app.handle().clone();

            start_hotkey_listener(
                move || {
                    let db_state = app_handle_cfg.state::<DbState>();
                    let conn = db_state.conn.lock().unwrap();
                    let s = get_settings(&conn).unwrap_or_else(|_| db::AppSettings {
                        gemini_api_key: "".into(),
                        model: "gemini-3.5-flash-lite".into(),
                        custom_model_id: None,
                        hotkey_mode: "push_to_talk".into(),
                        hotkey_key: "Left Control (⌃) + Left Shift (⇧)".into(),
                        hotkey_keycode: Some(59),
                        hotkey_keycodes: Some(vec![59, 56]),
                        mic_device: "default".into(),
                        auto_paste: true,
                        sound_effects: true,
                        pill_enabled: true,
                        theme: Some("system".into()),
                    });
                    HotkeyConfig {
                        key_name: s.hotkey_key,
                        keycode: s.hotkey_keycode,
                        keycodes: s.hotkey_keycodes.unwrap_or_default(),
                        is_push_to_talk: s.hotkey_mode == "push_to_talk",
                    }
                },
                move || {
                    let app = app_handle_start.clone();
                    tauri::async_runtime::spawn(async move {
                        let session = app.state::<AppSession>();
                        let db = app.state::<DbState>();
                        let _ = start_dictation(app.clone(), session, db).await;
                    });
                },
                move || {
                    let app = app_handle_stop.clone();
                    tauri::async_runtime::spawn(async move {
                        let session = app.state::<AppSession>();
                        let db = app.state::<DbState>();
                        let _ = stop_dictation(app.clone(), session, db).await;
                    });
                },
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_dictation,
            stop_dictation,
            cancel_dictation,
            get_dictation_state,
            get_history,
            update_dictation,
            delete_history,
            paste_text,
            get_dictionary_entries,
            add_dictionary_word,
            delete_dictionary_word,
            get_snippet_entries,
            add_snippet,
            delete_snippet,
            get_app_settings,
            save_app_settings,
            get_audio_devices,
            check_permissions,
            request_accessibility_permission,
            open_system_settings
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // If closing the main dashboard window, hide it so OpenFlow keeps running in background
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Re-open main window when user clicks the macOS Dock icon
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
        });
}
