use crate::audio::AudioRecorder;
use crate::db::{
    add_dictionary_entry, add_snippet_entry, delete_dictation, delete_dictionary_entry,
    delete_snippet_entry, get_all_dictations, get_dictionary, get_settings, get_snippets,
    insert_dictation, save_settings, update_dictation_text, AppSettings, DbState, Dictation,
    DictionaryEntry, SnippetEntry,
};
use crate::gemini::GeminiTranscriber;
use crate::macos::{
    get_frontmost_app_name, inject_or_copy_text, inject_text_at_cursor, is_accessibility_granted,
    is_input_monitoring_granted, is_microphone_granted, open_accessibility_settings,
    open_input_monitoring_settings, open_microphone_settings, open_url_in_browser,
    prompt_accessibility_permission, prompt_input_monitoring_permission,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictationStatePayload {
    pub state: String, // "idle", "recording", "processing", "error"
    pub target_app: Option<String>,
    pub message: Option<String>,
    pub duration_ms: Option<u32>,
    pub last_text: Option<String>,
    pub is_hands_free: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionsStatus {
    pub accessibility: bool,
    pub microphone: bool,
    pub input_monitoring: bool,
}

pub struct AppSession {
    pub recorder: Arc<AudioRecorder>,
    pub transcriber: Arc<GeminiTranscriber>,
    pub is_busy: Arc<AtomicBool>,
    pub is_starting: Arc<AtomicBool>,
    pub stop_requested: Arc<AtomicBool>,
    pub current_target_app: Arc<std::sync::Mutex<Option<String>>>,
    pub process_lock: Arc<AsyncMutex<()>>,
}

impl Default for AppSession {
    fn default() -> Self {
        Self::new()
    }
}

impl AppSession {
    pub fn new() -> Self {
        Self {
            recorder: Arc::new(AudioRecorder::new()),
            transcriber: Arc::new(GeminiTranscriber::new()),
            is_busy: Arc::new(AtomicBool::new(false)),
            is_starting: Arc::new(AtomicBool::new(false)),
            stop_requested: Arc::new(AtomicBool::new(false)),
            current_target_app: Arc::new(std::sync::Mutex::new(None)),
            process_lock: Arc::new(AsyncMutex::new(())),
        }
    }
}

// -------------------------------------------------------------
// Dictation Flow Commands
// -------------------------------------------------------------

#[tauri::command]
pub async fn start_dictation(
    app: AppHandle,
    session: State<'_, AppSession>,
    db: State<'_, DbState>,
) -> Result<(), String> {
    if session.recorder.is_recording()
        || session.is_busy.load(Ordering::SeqCst)
        || session.is_starting.load(Ordering::SeqCst)
    {
        return Ok(());
    }

    session.stop_requested.store(false, Ordering::SeqCst);
    session.is_starting.store(true, Ordering::SeqCst);

    // Fetch mic & pause_media settings
    let (mic_device, should_pause_media) = {
        let conn = db.conn.lock().unwrap();
        get_settings(&conn)
            .map(|s| (s.mic_device, s.pause_media))
            .unwrap_or_else(|_| ("default".to_string(), true))
    };

    if session.stop_requested.load(Ordering::SeqCst) {
        session.is_starting.store(false, Ordering::SeqCst);
        session.stop_requested.store(false, Ordering::SeqCst);
        return Ok(());
    }

    // Pause active media playback before recording/transcription starts
    if should_pause_media {
        crate::media_pause::pause_media_playback();
    }

    // Capture the frontmost app name BEFORE starting recording
    let frontmost = get_frontmost_app_name();
    *session.current_target_app.lock().unwrap() = Some(frontmost.clone());

    let app_handle_rms = app.clone();
    let start_res = session
        .recorder
        .start_recording(Some(mic_device), move |rms| {
            let _ = app_handle_rms.emit("audio-rms", rms);
        });

    session.is_starting.store(false, Ordering::SeqCst);

    if let Err(e) = start_res {
        crate::media_pause::resume_media_playback();
        return Err(format!("Failed to start recording: {}", e));
    }

    // Check if stop was requested while recorder was initializing (e.g. quick release / single tap)
    if session.stop_requested.load(Ordering::SeqCst) {
        session.stop_requested.store(false, Ordering::SeqCst);
        let _ = session.recorder.stop_recording();
        crate::media_pause::resume_media_playback();
        crate::hotkey::reset_hotkey_state();
        if let Some(pill) = app.get_webview_window("pill") {
            crate::macos::hide_pill_window(&pill);
        }
        let payload = DictationStatePayload {
            state: "idle".to_string(),
            target_app: None,
            message: None,
            duration_ms: None,
            last_text: None,
            is_hands_free: None,
        };
        let _ = app.emit("dictation-state-changed", payload);
        return Ok(());
    }

    // Show floating pill window on recording without activating OpenFlow or switching spaces
    if let Some(pill) = app.get_webview_window("pill") {
        crate::macos::show_pill_without_activation(&pill);
    }

    let payload = DictationStatePayload {
        state: "recording".to_string(),
        target_app: Some(frontmost),
        message: None,
        duration_ms: None,
        last_text: None,
        is_hands_free: Some(crate::hotkey::is_hands_free_locked()),
    };
    let _ = app.emit("dictation-state-changed", payload);

    Ok(())
}

#[tauri::command]
pub async fn stop_dictation(
    app: AppHandle,
    session: State<'_, AppSession>,
    db: State<'_, DbState>,
) -> Result<Option<Dictation>, String> {
    // If start_dictation is still initializing, flag stop_requested and wait for it
    if session.is_starting.load(Ordering::SeqCst) {
        session.stop_requested.store(true, Ordering::SeqCst);
        for _ in 0..30 {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            if !session.is_starting.load(Ordering::SeqCst) {
                break;
            }
        }
    }

    crate::hotkey::reset_hotkey_state();

    if !session.recorder.is_recording() {
        return Ok(None);
    }

    let _guard = session.process_lock.lock().await;
    session.is_busy.store(true, Ordering::SeqCst);

    // Stop recording and retrieve audio WAV bytes
    let (wav_bytes, duration_ms, max_peak, rms) = match session.recorder.stop_recording() {
        Ok(res) => res,
        Err(e) => {
            session.is_busy.store(false, Ordering::SeqCst);
            crate::media_pause::resume_media_playback();
            if let Some(pill) = app.get_webview_window("pill") {
                crate::macos::hide_pill_window(&pill);
            }
            let payload = DictationStatePayload {
                state: "idle".to_string(),
                target_app: None,
                message: Some(e),
                duration_ms: None,
                last_text: None,
                is_hands_free: None,
            };
            let _ = app.emit("dictation-state-changed", payload);
            return Ok(None);
        }
    };

    eprintln!(
        "[OpenFlow Audio Stop] duration={}ms, max_peak={}, rms={:.5}",
        duration_ms, max_peak, rms
    );

    // Silence detection: if peak amplitude and RMS are below speech thresholds,
    // discard immediately without calling Gemini API. This prevents hallucinated terminal commands
    // (e.g. "git status", "ls -la") from background mic noise or silent recordings.
    if max_peak < 850 && rms < 0.0035 {
        session.is_busy.store(false, Ordering::SeqCst);
        crate::media_pause::resume_media_playback();
        if let Some(pill) = app.get_webview_window("pill") {
            crate::macos::hide_pill_window(&pill);
        }
        let empty_payload = DictationStatePayload {
            state: "idle".to_string(),
            target_app: None,
            message: Some("No speech detected".to_string()),
            duration_ms: Some(duration_ms),
            last_text: None,
            is_hands_free: None,
        };
        let _ = app.emit("dictation-state-changed", empty_payload);
        return Ok(None);
    }

    // Emit processing state
    let target_app = session
        .current_target_app
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| "Unknown".to_string());

    let proc_payload = DictationStatePayload {
        state: "processing".to_string(),
        target_app: Some(target_app.clone()),
        message: None,
        duration_ms: Some(duration_ms),
        last_text: None,
        is_hands_free: Some(crate::hotkey::is_hands_free_locked()),
    };
    let _ = app.emit("dictation-state-changed", proc_payload);

    // Read settings and context
    let (settings, dictionary, snippets) = {
        let conn = db.conn.lock().unwrap();
        let s = get_settings(&conn).map_err(|e| e.to_string())?;
        let d = get_dictionary(&conn).map_err(|e| e.to_string())?;
        let sn = get_snippets(&conn).map_err(|e| e.to_string())?;
        (s, d, sn)
    };

    let active_model = if let Some(ref custom) = settings.custom_model_id {
        if !custom.trim().is_empty() {
            custom.as_str()
        } else {
            &settings.model
        }
    } else {
        &settings.model
    };

    // Call Gemini API
    let transcribe_res = session
        .transcriber
        .transcribe(
            &settings.gemini_api_key,
            active_model,
            &wav_bytes,
            &target_app,
            &dictionary,
            &snippets,
        )
        .await;

    session.is_busy.store(false, Ordering::SeqCst);

    match transcribe_res {
        Ok(res) => {
            let clean_text = res.text.trim().to_string();

            // Additional hallucination guard: if audio was very quiet (max_peak < 1800) and
            // Gemini returned a generic terminal command commonly hallucinated when active_app is iTerm/terminal
            let is_hallucinated_cmd = max_peak < 1800
                && (clean_text.eq_ignore_ascii_case("git status")
                    || clean_text.eq_ignore_ascii_case("ls -la")
                    || clean_text.eq_ignore_ascii_case("ls")
                    || clean_text.eq_ignore_ascii_case("git clone")
                    || clean_text.eq_ignore_ascii_case("pwd")
                    || clean_text.eq_ignore_ascii_case("clear"));

            if clean_text.is_empty() || is_hallucinated_cmd {
                crate::media_pause::resume_media_playback();
                if let Some(pill) = app.get_webview_window("pill") {
                    crate::macos::hide_pill_window(&pill);
                }
                let empty_payload = DictationStatePayload {
                    state: "idle".to_string(),
                    target_app: None,
                    message: Some("No speech detected".to_string()),
                    duration_ms: Some(duration_ms),
                    last_text: None,
                    is_hands_free: None,
                };
                let _ = app.emit("dictation-state-changed", empty_payload);
                return Ok(None);
            }

            let word_count = clean_text.split_whitespace().count();
            let new_dictation = Dictation {
                id: uuid::Uuid::new_v4().to_string(),
                text: clean_text.clone(),
                raw_transcript: Some(clean_text.clone()),
                target_app: target_app.clone(),
                duration_ms,
                word_count,
                created_at: Utc::now().to_rfc3339(),
                audio_path: None,
                prompt_tokens: res.prompt_tokens,
                output_tokens: res.output_tokens,
                cost_usd: res.cost_usd,
            };

            // Save to DB
            {
                let conn = db.conn.lock().unwrap();
                let _ = insert_dictation(&conn, &new_dictation);
            }

            // Inject at cursor if a text field is focused, otherwise copy to clipboard
            let pasted = inject_or_copy_text(&clean_text, settings.auto_paste).unwrap_or(false);

            // Resume audio smoothly now that transcription and injection are complete
            crate::media_pause::resume_media_playback();

            // Emit completion event so history updates immediately
            let _ = app.emit("dictation-completed", new_dictation.clone());

            if pasted {
                if let Some(pill) = app.get_webview_window("pill") {
                    crate::macos::hide_pill_window(&pill);
                }
                let done_payload = DictationStatePayload {
                    state: "idle".to_string(),
                    target_app: None,
                    message: None,
                    duration_ms: Some(duration_ms),
                    last_text: Some(clean_text),
                    is_hands_free: None,
                };
                let _ = app.emit("dictation-state-changed", done_payload);
            } else {
                let copied_payload = DictationStatePayload {
                    state: "copied".to_string(),
                    target_app: Some(target_app),
                    message: Some("Copied to clipboard".to_string()),
                    duration_ms: Some(duration_ms),
                    last_text: Some(clean_text),
                    is_hands_free: None,
                };
                let _ = app.emit("dictation-state-changed", copied_payload);

                let app_hide = app.clone();
                let recorder_check = session.recorder.clone();
                let busy_check = session.is_busy.clone();
                tokio::spawn(async move {
                    // Fallback auto-hide if not already dismissed by frontend hover/timer
                    tokio::time::sleep(Duration::from_millis(12000)).await;
                    if !recorder_check.is_recording() && !busy_check.load(Ordering::SeqCst) {
                        if let Some(pill) = app_hide.get_webview_window("pill") {
                            crate::macos::hide_pill_window(&pill);
                        }
                        let idle_payload = DictationStatePayload {
                            state: "idle".to_string(),
                            target_app: None,
                            message: None,
                            duration_ms: None,
                            last_text: None,
                            is_hands_free: None,
                        };
                        let _ = app_hide.emit("dictation-state-changed", idle_payload);
                    }
                });
            }

            Ok(Some(new_dictation))
        }
        Err(err) => {
            crate::media_pause::resume_media_playback();
            let err_msg = err.clone();
            let err_payload = DictationStatePayload {
                state: "error".to_string(),
                target_app: None,
                message: Some(err_msg.clone()),
                duration_ms: Some(duration_ms),
                last_text: None,
                is_hands_free: None,
            };
            let _ = app.emit("dictation-state-changed", err_payload);

            // Revert to idle and hide pill after 2s
            let app_revert = app.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(2000)).await;
                if let Some(pill) = app_revert.get_webview_window("pill") {
                    crate::macos::hide_pill_window(&pill);
                }
                let idle_payload = DictationStatePayload {
                    state: "idle".to_string(),
                    target_app: None,
                    message: None,
                    duration_ms: None,
                    last_text: None,
                    is_hands_free: None,
                };
                let _ = app_revert.emit("dictation-state-changed", idle_payload);
            });

            Err(err)
        }
    }
}

#[tauri::command]
pub async fn cancel_dictation(
    app: AppHandle,
    session: State<'_, AppSession>,
) -> Result<(), String> {
    crate::hotkey::reset_hotkey_state();
    session.stop_requested.store(true, Ordering::SeqCst);
    if session.recorder.is_recording() {
        session.recorder.cancel_recording();
    }
    session.is_busy.store(false, Ordering::SeqCst);
    crate::media_pause::resume_media_playback();

    if let Some(pill) = app.get_webview_window("pill") {
        crate::macos::hide_pill_window(&pill);
    }

    let payload = DictationStatePayload {
        state: "idle".to_string(),
        target_app: None,
        message: Some("Dictation cancelled".to_string()),
        duration_ms: None,
        last_text: None,
        is_hands_free: None,
    };
    let _ = app.emit("dictation-state-changed", payload);
    Ok(())
}

#[tauri::command]
pub fn get_dictation_state(session: State<'_, AppSession>) -> String {
    if session.recorder.is_recording() {
        "recording".to_string()
    } else if session.is_busy.load(Ordering::SeqCst) {
        "processing".to_string()
    } else {
        "idle".to_string()
    }
}

// -------------------------------------------------------------
// History Commands
// -------------------------------------------------------------

#[tauri::command]
pub fn get_history(db: State<'_, DbState>) -> Result<Vec<Dictation>, String> {
    let conn = db.conn.lock().unwrap();
    get_all_dictations(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_dictation(
    id: String,
    text: String,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    update_dictation_text(&conn, &id, &text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_history(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    delete_dictation(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paste_text(text: String) -> Result<(), String> {
    inject_text_at_cursor(&text)
}

// -------------------------------------------------------------
// Dictionary Commands
// -------------------------------------------------------------

#[tauri::command]
pub fn get_dictionary_entries(db: State<'_, DbState>) -> Result<Vec<DictionaryEntry>, String> {
    let conn = db.conn.lock().unwrap();
    get_dictionary(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_dictionary_word(
    term: String,
    replacement: Option<String>,
    category: Option<String>,
    db: State<'_, DbState>,
) -> Result<DictionaryEntry, String> {
    let conn = db.conn.lock().unwrap();
    let cat = category.unwrap_or_else(|| "Personal".to_string());
    add_dictionary_entry(&conn, &term, replacement.as_deref(), &cat).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_dictionary_word(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    delete_dictionary_entry(&conn, &id).map_err(|e| e.to_string())
}

// -------------------------------------------------------------
// Snippets Commands
// -------------------------------------------------------------

#[tauri::command]
pub fn get_snippet_entries(db: State<'_, DbState>) -> Result<Vec<SnippetEntry>, String> {
    let conn = db.conn.lock().unwrap();
    get_snippets(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_snippet(
    trigger: String,
    expansion: String,
    category: Option<String>,
    db: State<'_, DbState>,
) -> Result<SnippetEntry, String> {
    let conn = db.conn.lock().unwrap();
    let cat = category.unwrap_or_else(|| "Personal".to_string());
    add_snippet_entry(&conn, &trigger, &expansion, &cat).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_snippet(id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    delete_snippet_entry(&conn, &id).map_err(|e| e.to_string())
}

// -------------------------------------------------------------
// Settings & System Commands
// -------------------------------------------------------------

#[tauri::command]
pub fn get_app_settings(db: State<'_, DbState>) -> Result<AppSettings, String> {
    let conn = db.conn.lock().unwrap();
    get_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_app_settings(
    app: AppHandle,
    settings: AppSettings,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    save_settings(&conn, &settings).map_err(|e| e.to_string())?;
    let _ = app.emit("settings-updated", &settings);
    Ok(())
}

#[tauri::command]
pub fn get_audio_devices(session: State<'_, AppSession>) -> Vec<String> {
    let devices = session.recorder.list_devices();
    eprintln!("[OpenFlow get_audio_devices] {:?}", devices);
    devices
}

#[tauri::command]
pub fn check_permissions() -> PermissionsStatus {
    let accessibility = is_accessibility_granted();
    let microphone = is_microphone_granted();
    let input_monitoring = is_input_monitoring_granted();
    eprintln!(
        "[OpenFlow PERM CHECK] accessibility={}, microphone={}, input_monitoring={}",
        accessibility, microphone, input_monitoring
    );
    if accessibility || input_monitoring {
        crate::hotkey::refresh_hotkey_listener_if_needed();
    }
    PermissionsStatus {
        accessibility,
        microphone,
        input_monitoring,
    }
}

#[tauri::command]
pub fn request_accessibility_permission() {
    prompt_accessibility_permission();
}

#[tauri::command]
pub fn request_input_monitoring_permission() {
    prompt_input_monitoring_permission();
}

#[tauri::command]
pub fn open_system_settings(target: String) {
    if target == "accessibility" {
        open_accessibility_settings();
    } else if target == "microphone" {
        open_microphone_settings();
    } else if target == "input_monitoring" {
        open_input_monitoring_settings();
    } else if target.starts_with("https://") || target.starts_with("http://") {
        open_url_in_browser(&target);
    }
}
