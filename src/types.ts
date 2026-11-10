export interface Dictation {
  id: string;
  text: string;
  raw_transcript?: string;
  target_app: string;
  duration_ms: number;
  word_count: number;
  created_at: string;
  audio_path?: string;
  prompt_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}

export interface DictionaryEntry {
  id: string;
  term: string;
  replacement?: string | null;
  category: string;
  created_at: string;
}

export interface SnippetEntry {
  id: string;
  trigger: string;
  expansion: string;
  category: string;
  created_at: string;
}

export interface AppSettings {
  gemini_api_key: string;
  model: string;
  custom_model_id?: string | null;
  hotkey_mode: string; // "push_to_talk" | "hands_free"
  hotkey_key: string; // "Left Control (⌃) + Left Shift (⇧)", "Right Option (⌥)", etc.
  hotkey_keycode?: number | null; // primary macOS hardware virtual keycode
  hotkey_keycodes?: number[] | null; // array of macOS virtual keycodes for multi-key combinations
  mic_device: string; // "default" or device name
  auto_paste: boolean;
  sound_effects: boolean;
  pill_enabled: boolean;
  pause_media?: boolean;
  mute_audio?: boolean;
  theme?: string; // "system" | "light" | "dark"
}

export interface PermissionsStatus {
  accessibility: boolean;
  microphone: boolean;
  input_monitoring: boolean;
}

export interface DictationStatePayload {
  state: "idle" | "recording" | "processing" | "copied" | "error";
  target_app?: string | null;
  message?: string | null;
  duration_ms?: number | null;
  last_text?: string | null;
  is_hands_free?: boolean | null;
}
