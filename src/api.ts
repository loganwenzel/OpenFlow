import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  AppSettings,
  Dictation,
  DictationStatePayload,
  DictionaryEntry,
  PermissionsStatus,
  SnippetEntry,
} from "./types";

const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

// Helper for safe invoke with browser mockup fallback
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  if (isTauri) {
    try {
      return await invoke<T>(cmd, args);
    } catch (err) {
      console.warn(`Tauri invoke error [${cmd}]:`, err);
      if (fallback !== undefined) return fallback;
      throw err;
    }
  }
  // Browser fallback mode
  console.debug(`[Browser Preview] invoke("${cmd}")`, args);
  if (fallback !== undefined) return fallback;
  return undefined as unknown as T;
}

// Dictation operations
export async function startDictation(): Promise<void> {
  return await safeInvoke("start_dictation");
}

export async function stopDictation(): Promise<Dictation | null> {
  return await safeInvoke("stop_dictation", undefined, null);
}

export async function cancelDictation(): Promise<void> {
  return await safeInvoke("cancel_dictation");
}

export async function getDictationState(): Promise<string> {
  return await safeInvoke("get_dictation_state", undefined, "idle");
}

// History operations
export async function getHistory(): Promise<Dictation[]> {
  return await safeInvoke("get_history", undefined, []);
}

export async function updateDictation(id: string, text: string): Promise<void> {
  return await safeInvoke("update_dictation", { id, text });
}

export async function deleteHistory(id: string): Promise<void> {
  return await safeInvoke("delete_history", { id });
}

export async function pasteText(text: string): Promise<void> {
  return await safeInvoke("paste_text", { text });
}

// Dictionary operations
export async function getDictionary(): Promise<DictionaryEntry[]> {
  return await safeInvoke("get_dictionary_entries", undefined, []);
}

export async function addDictionaryWord(
  term: string,
  replacement?: string | null,
  category?: string
): Promise<DictionaryEntry> {
  const fallback: DictionaryEntry = {
    id: Math.random().toString(),
    term,
    replacement: replacement || null,
    category: category || "Personal",
    created_at: new Date().toISOString(),
  };
  return await safeInvoke(
    "add_dictionary_word",
    {
      term,
      replacement: replacement || null,
      category,
    },
    fallback
  );
}

export async function deleteDictionaryWord(id: string): Promise<void> {
  return await safeInvoke("delete_dictionary_word", { id });
}

// Snippets operations
export async function getSnippets(): Promise<SnippetEntry[]> {
  return await safeInvoke("get_snippet_entries", undefined, []);
}

export async function addSnippet(
  trigger: string,
  expansion: string,
  category?: string
): Promise<SnippetEntry> {
  const fallback: SnippetEntry = {
    id: Math.random().toString(),
    trigger,
    expansion,
    category: category || "Personal",
    created_at: new Date().toISOString(),
  };
  return await safeInvoke("add_snippet", { trigger, expansion, category }, fallback);
}

export async function deleteSnippet(id: string): Promise<void> {
  return await safeInvoke("delete_snippet", { id });
}

// Settings & Permissions
export async function getAppSettings(): Promise<AppSettings> {
  const fallbackSettings: AppSettings = {
    gemini_api_key: "",
    model: "gemini-flash-lite-latest",
    custom_model_id: null,
    hotkey_mode: "push_to_talk",
    hotkey_key: "RightOption",
    mic_device: "default",
    auto_paste: true,
    sound_effects: true,
    pill_enabled: true,
  };
  return await safeInvoke("get_app_settings", undefined, fallbackSettings);
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  return await safeInvoke("save_app_settings", { settings });
}

export async function getAudioDevices(): Promise<string[]> {
  const fallback = ["MacBook Pro Microphone", "Studio Display Microphone", "External USB Mic"];
  return await safeInvoke("get_audio_devices", undefined, fallback);
}

export async function checkPermissions(): Promise<PermissionsStatus> {
  const fallback = { accessibility: true, microphone: true };
  return await safeInvoke("check_permissions", undefined, fallback);
}

export async function requestAccessibilityPermission(): Promise<void> {
  return await safeInvoke("request_accessibility_permission");
}

export async function openSystemSettings(
  target: "accessibility" | "microphone" | string
): Promise<void> {
  return await safeInvoke("open_system_settings", { target });
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri) {
    await safeInvoke("open_system_settings", { target: url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Event Subscriptions
export function onDictationStateChanged(
  handler: (payload: DictationStatePayload) => void
): Promise<UnlistenFn> {
  if (!isTauri) {
    return Promise.resolve(() => {});
  }
  return listen<DictationStatePayload>("dictation-state-changed", (event) => {
    handler(event.payload);
  });
}

export function onDictationCompleted(
  handler: (payload: Dictation) => void
): Promise<UnlistenFn> {
  if (!isTauri) {
    return Promise.resolve(() => {});
  }
  return listen<Dictation>("dictation-completed", (event) => {
    handler(event.payload);
  });
}

export function onAudioRms(
  handler: (rms: number) => void
): Promise<UnlistenFn> {
  if (!isTauri) {
    return Promise.resolve(() => {});
  }
  return listen<number>("audio-rms", (event) => {
    handler(event.payload);
  });
}

export function onSettingsUpdated(
  handler: (settings: AppSettings) => void
): Promise<UnlistenFn> {
  if (!isTauri) {
    return Promise.resolve(() => {});
  }
  return listen<AppSettings>("settings-updated", (event) => {
    handler(event.payload);
  });
}

// Subtle Audio Chimes using Web Audio API
export function playChime(type: "start" | "success" | "error" | "click") {
  try {
    const AudioContextClass =
      window.AudioContext ||
      // @ts-expect-error webkit prefix
      window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "start") {
      // Gentle rising double-tone
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === "success") {
      // Pleasant chime
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === "error") {
      // Low descending buzz
      osc.type = "triangle";
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === "click") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  } catch (e) {
    console.debug("Audio cue omitted:", e);
  }
}
