use chrono::Utc;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dictation {
    pub id: String,
    pub text: String,
    pub raw_transcript: Option<String>,
    pub target_app: String,
    pub duration_ms: u32,
    pub word_count: usize,
    pub created_at: String,
    pub audio_path: Option<String>,
    #[serde(default)]
    pub prompt_tokens: usize,
    #[serde(default)]
    pub output_tokens: usize,
    #[serde(default)]
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub id: String,
    pub term: String,
    pub replacement: Option<String>,
    pub category: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnippetEntry {
    pub id: String,
    pub trigger: String,
    pub expansion: String,
    pub category: String,
    pub created_at: String,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub gemini_api_key: String,
    pub model: String,
    pub custom_model_id: Option<String>,
    pub hotkey_mode: String, // "push_to_talk" or "hands_free"
    pub hotkey_key: String,  // "Left Control (⌃) + Left Shift (⇧)", etc.
    pub hotkey_keycode: Option<i64>,
    #[serde(default)]
    pub hotkey_keycodes: Option<Vec<i64>>,
    pub mic_device: String,  // "default" or device name
    pub auto_paste: bool,
    pub sound_effects: bool,
    pub pill_enabled: bool,
    #[serde(default = "default_true")]
    pub pause_media: bool,
    #[serde(default = "default_true")]
    pub mute_audio: bool,
    #[serde(default)]
    pub theme: Option<String>,
}

pub struct DbState {
    pub conn: Mutex<Connection>,
}

impl DbState {
    pub fn new() -> Result<Self> {
        let db_dir = dirs_fallback();
        fs::create_dir_all(&db_dir).ok();
        let db_path = db_dir.join("openflow.db");

        let conn = Connection::open(&db_path)?;
        init_tables(&conn)?;
        seed_defaults(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

fn dirs_fallback() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("com.openflow.app")
    } else {
        PathBuf::from(".openflow")
    }
}

fn init_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS dictations (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            raw_transcript TEXT,
            target_app TEXT NOT NULL,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            word_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            audio_path TEXT,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            cost_usd REAL NOT NULL DEFAULT 0.0
        );",
        [],
    )?;

    // Migrate existing dictations table if columns were added after initial creation
    let _ = conn.execute(
        "ALTER TABLE dictations ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0;",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE dictations ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE dictations ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0.0;",
        [],
    );

    // Backfill token/cost estimates for any pre-existing dictations that had 0 tokens recorded
    let _ = conn.execute(
        "UPDATE dictations
         SET prompt_tokens = 240 + CAST((duration_ms / 1000.0) * 32.0 AS INTEGER),
             output_tokens = MAX(1, CAST(word_count * 1.35 AS INTEGER)),
             cost_usd = ((240.0 * 0.10) + ((duration_ms / 1000.0) * 32.0 * 0.30) + (MAX(1.0, word_count * 1.35) * 0.40)) / 1000000.0
         WHERE prompt_tokens = 0 AND word_count > 0;",
        [],
    );

    conn.execute(
        "CREATE TABLE IF NOT EXISTS dictionary (
            id TEXT PRIMARY KEY,
            term TEXT NOT NULL,
            replacement TEXT,
            category TEXT NOT NULL DEFAULT 'Personal',
            created_at TEXT NOT NULL
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS snippets (
            id TEXT PRIMARY KEY,
            trigger TEXT NOT NULL,
            expansion TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Personal',
            created_at TEXT NOT NULL
        );",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
        [],
    )?;

    Ok(())
}

fn seed_defaults(conn: &Connection) -> Result<()> {
    let default_settings = [
        ("gemini_api_key", ""),
        ("model", "gemini-3.5-flash-lite"),
        ("custom_model_id", ""),
        ("hotkey_mode", "push_to_talk"),
        ("hotkey_key", "Right Shift (⇧)"),
        ("hotkey_keycode", "60"),
        ("hotkey_keycodes", "60"),
        ("mic_device", "default"),
        ("auto_paste", "true"),
        ("sound_effects", "true"),
        ("pill_enabled", "true"),
        ("pause_media", "true"),
        ("mute_audio", "true"),
        ("theme", "system"),
    ];

    for (k, v) in default_settings {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2);",
            params![k, v],
        )?;
    }

    // Auto-migrate any existing DB from previous default "Left Control (⌃) + Left Shift (⇧)" to "Right Shift (⇧)"
    let _ = conn.execute(
        "UPDATE settings SET value = 'Right Shift (⇧)' WHERE key = 'hotkey_key' AND value = 'Left Control (⌃) + Left Shift (⇧)';",
        [],
    );
    let _ = conn.execute(
        "UPDATE settings SET value = '60' WHERE key = 'hotkey_keycode' AND value = '59';",
        [],
    );
    let _ = conn.execute(
        "UPDATE settings SET value = '60' WHERE key = 'hotkey_keycodes' AND value = '59,56';",
        [],
    );

    Ok(())
}

// Queries
pub fn get_all_dictations(conn: &Connection) -> Result<Vec<Dictation>> {
    let mut stmt = conn.prepare(
        "SELECT id, text, raw_transcript, target_app, duration_ms, word_count, created_at, audio_path,
                prompt_tokens, output_tokens, cost_usd
         FROM dictations ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(Dictation {
            id: row.get(0)?,
            text: row.get(1)?,
            raw_transcript: row.get(2)?,
            target_app: row.get(3)?,
            duration_ms: row.get(4)?,
            word_count: row.get(5)?,
            created_at: row.get(6)?,
            audio_path: row.get(7)?,
            prompt_tokens: row.get::<_, Option<usize>>(8)?.unwrap_or(0),
            output_tokens: row.get::<_, Option<usize>>(9)?.unwrap_or(0),
            cost_usd: row.get::<_, Option<f64>>(10)?.unwrap_or(0.0),
        })
    })?;

    let mut dictations = Vec::new();
    for row in rows {
        dictations.push(row?);
    }
    Ok(dictations)
}

pub fn insert_dictation(conn: &Connection, dictation: &Dictation) -> Result<()> {
    conn.execute(
        "INSERT INTO dictations (
            id, text, raw_transcript, target_app, duration_ms, word_count, created_at, audio_path,
            prompt_tokens, output_tokens, cost_usd
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            dictation.id,
            dictation.text,
            dictation.raw_transcript,
            dictation.target_app,
            dictation.duration_ms,
            dictation.word_count,
            dictation.created_at,
            dictation.audio_path,
            dictation.prompt_tokens,
            dictation.output_tokens,
            dictation.cost_usd,
        ],
    )?;
    Ok(())
}

pub fn update_dictation_text(conn: &Connection, id: &str, new_text: &str) -> Result<()> {
    let word_count = new_text.split_whitespace().count();
    conn.execute(
        "UPDATE dictations SET text = ?1, word_count = ?2 WHERE id = ?3",
        params![new_text, word_count, id],
    )?;
    Ok(())
}

pub fn delete_dictation(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM dictations WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_dictionary(conn: &Connection) -> Result<Vec<DictionaryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, term, replacement, category, created_at FROM dictionary ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(DictionaryEntry {
            id: row.get(0)?,
            term: row.get(1)?,
            replacement: row.get(2)?,
            category: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

pub fn add_dictionary_entry(
    conn: &Connection,
    term: &str,
    replacement: Option<&str>,
    category: &str,
) -> Result<DictionaryEntry> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO dictionary (id, term, replacement, category, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, term, replacement, category, now],
    )?;

    Ok(DictionaryEntry {
        id,
        term: term.to_string(),
        replacement: replacement.map(|s| s.to_string()),
        category: category.to_string(),
        created_at: now,
    })
}

pub fn delete_dictionary_entry(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM dictionary WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_snippets(conn: &Connection) -> Result<Vec<SnippetEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, trigger, expansion, category, created_at FROM snippets ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SnippetEntry {
            id: row.get(0)?,
            trigger: row.get(1)?,
            expansion: row.get(2)?,
            category: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

pub fn add_snippet_entry(
    conn: &Connection,
    trigger: &str,
    expansion: &str,
    category: &str,
) -> Result<SnippetEntry> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO snippets (id, trigger, expansion, category, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, trigger, expansion, category, now],
    )?;

    Ok(SnippetEntry {
        id,
        trigger: trigger.to_string(),
        expansion: expansion.to_string(),
        category: category.to_string(),
        created_at: now,
    })
}

pub fn delete_snippet_entry(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_settings(conn: &Connection) -> Result<AppSettings> {
    let mut map = std::collections::HashMap::new();
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        let k: String = row.get(0)?;
        let v: String = row.get(1)?;
        Ok((k, v))
    })?;

    for r in rows {
        let (k, v) = r?;
        map.insert(k, v);
    }

    Ok(AppSettings {
        gemini_api_key: map
            .get("gemini_api_key")
            .cloned()
            .unwrap_or_default(),
        model: map
            .get("model")
            .cloned()
            .unwrap_or_else(|| "gemini-3.5-flash-lite".to_string()),
        custom_model_id: map.get("custom_model_id").cloned(),
        hotkey_mode: map
            .get("hotkey_mode")
            .cloned()
            .unwrap_or_else(|| "push_to_talk".to_string()),
        hotkey_key: map
            .get("hotkey_key")
            .cloned()
            .unwrap_or_else(|| "RightOption".to_string()),
        hotkey_keycode: map
            .get("hotkey_keycode")
            .and_then(|v| v.parse::<i64>().ok())
            .or(Some(61)),
        hotkey_keycodes: map
            .get("hotkey_keycodes")
            .map(|v| {
                v.split(',')
                    .filter_map(|s| s.trim().parse::<i64>().ok())
                    .collect::<Vec<i64>>()
            })
            .filter(|v| !v.is_empty())
            .or_else(|| {
                let single = map
                    .get("hotkey_keycode")
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(61);
                Some(vec![single])
            }),
        mic_device: map
            .get("mic_device")
            .cloned()
            .unwrap_or_else(|| "default".to_string()),
        auto_paste: map
            .get("auto_paste")
            .map(|v| v == "true")
            .unwrap_or(true),
        sound_effects: map
            .get("sound_effects")
            .map(|v| v == "true")
            .unwrap_or(true),
        pill_enabled: map
            .get("pill_enabled")
            .map(|v| v == "true")
            .unwrap_or(true),
        pause_media: map
            .get("pause_media")
            .map(|v| v == "true")
            .unwrap_or_else(|| {
                map.get("mute_audio")
                    .map(|v| v == "true")
                    .unwrap_or(true)
            }),
        mute_audio: map
            .get("mute_audio")
            .map(|v| v == "true")
            .unwrap_or(true),
        theme: Some(
            map.get("theme")
                .cloned()
                .unwrap_or_else(|| "system".to_string()),
        ),
    })
}

pub fn save_settings(conn: &Connection, settings: &AppSettings) -> Result<()> {
    let keycode_str = settings.hotkey_keycode.unwrap_or(60).to_string();
    let keycodes_str = settings
        .hotkey_keycodes
        .as_ref()
        .filter(|v| !v.is_empty())
        .map(|v| {
            v.iter()
                .map(|k| k.to_string())
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_else(|| keycode_str.clone());
    let theme_str = settings.theme.as_deref().unwrap_or("system");
    let pairs = [
        ("gemini_api_key", settings.gemini_api_key.as_str()),
        ("model", settings.model.as_str()),
        (
            "custom_model_id",
            settings.custom_model_id.as_deref().unwrap_or(""),
        ),
        ("hotkey_mode", settings.hotkey_mode.as_str()),
        ("hotkey_key", settings.hotkey_key.as_str()),
        ("hotkey_keycode", keycode_str.as_str()),
        ("hotkey_keycodes", keycodes_str.as_str()),
        ("mic_device", settings.mic_device.as_str()),
        (
            "auto_paste",
            if settings.auto_paste { "true" } else { "false" },
        ),
        (
            "sound_effects",
            if settings.sound_effects { "true" } else { "false" },
        ),
        (
            "pill_enabled",
            if settings.pill_enabled { "true" } else { "false" },
        ),
        (
            "pause_media",
            if settings.pause_media { "true" } else { "false" },
        ),
        (
            "mute_audio",
            if settings.mute_audio { "true" } else { "false" },
        ),
        ("theme", theme_str),
    ];

    for (k, v) in pairs {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![k, v],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_init_and_seed() {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();
        seed_defaults(&conn).unwrap();

        let dictations = get_all_dictations(&conn).unwrap();
        assert!(dictations.is_empty(), "No sample dictations should be seeded");

        let dictionary = get_dictionary(&conn).unwrap();
        assert!(dictionary.is_empty(), "No sample dictionary words should be seeded");

        let snippets = get_snippets(&conn).unwrap();
        assert!(snippets.is_empty(), "No sample snippets should be seeded");

        let settings = get_settings(&conn).unwrap();
        assert_eq!(settings.model, "gemini-3.5-flash-lite");
        assert_eq!(settings.hotkey_mode, "push_to_talk");
        assert_eq!(settings.hotkey_key, "Right Shift (⇧)");
        assert_eq!(settings.hotkey_keycode, Some(60));
    }

    #[test]
    fn test_crud_operations() {
        let conn = Connection::open_in_memory().unwrap();
        init_tables(&conn).unwrap();
        seed_defaults(&conn).unwrap();

        // Add dictionary word
        let word = add_dictionary_entry(&conn, "NewTerm", Some("NewReplacement"), "Personal").unwrap();
        let dict = get_dictionary(&conn).unwrap();
        assert!(dict.iter().any(|d| d.term == "NewTerm"));

        delete_dictionary_entry(&conn, &word.id).unwrap();
        let dict_after = get_dictionary(&conn).unwrap();
        assert!(!dict_after.iter().any(|d| d.term == "NewTerm"));

        // Add snippet
        let snippet = add_snippet_entry(&conn, "call me", "123-456-7890", "Personal").unwrap();
        let snips = get_snippets(&conn).unwrap();
        assert!(snips.iter().any(|s| s.trigger == "call me"));

        delete_snippet_entry(&conn, &snippet.id).unwrap();
        let snips_after = get_snippets(&conn).unwrap();
        assert!(!snips_after.iter().any(|s| s.trigger == "call me"));
    }
}

