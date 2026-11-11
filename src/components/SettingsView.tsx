import { useState, useEffect, useRef, useCallback } from "react";
import {
  Key,
  Mic,
  Command,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Check,
  Sparkles,
  Sliders,
  RefreshCw,
  Monitor,
  Sun,
  Moon,
  ExternalLink,
} from "lucide-react";
import { AppSettings, Dictation, PermissionsStatus } from "../types";
import { CustomSelect, ToggleSwitch } from "./CustomControls";
import {
  saveAppSettings,
  getAudioDevices,
  openSystemSettings,
  openExternalUrl,
  requestAccessibilityPermission,
  requestInputMonitoringPermission,
  playChime,
} from "../api";

interface SettingsViewProps {
  settings: AppSettings;
  history: Dictation[];
  audioDevices: string[];
  permissions: PermissionsStatus | null;
  onUpdateSettings: (updated: AppSettings) => void;
  onRefreshPermissions: () => void;
  onOpenOnboarding?: () => void;
  targetSection?: string | null;
  onClearTargetSection?: () => void;
}

const MAC_PRESETS = [
  { label: "Left Control (⌃) + Left Shift (⇧)", key: "Left Control (⌃) + Left Shift (⇧)", keycodes: [59, 56] },
  { label: "Right Option (⌥) — Wispr Flow Default", key: "Right Option (⌥)", keycodes: [61] },
  { label: "Left Option (⌥)", key: "Left Option (⌥)", keycodes: [58] },
  { label: "Fn / Globe Key (🌐)", key: "Fn / Globe", keycodes: [63] },
  { label: "Right Control (⌃)", key: "Right Control (⌃)", keycodes: [62] },
  { label: "Left Control (⌃)", key: "Left Control (⌃)", keycodes: [59] },
  { label: "Right Shift (⇧)", key: "Right Shift (⇧)", keycodes: [60] },
  { label: "Left Shift (⇧)", key: "Left Shift (⇧)", keycodes: [56] },
  { label: "F8 Key", key: "F8", keycodes: [100] },
  { label: "F7 Key", key: "F7", keycodes: [98] },
  { label: "F9 Key", key: "F9", keycodes: [101] },
  { label: "Spacebar", key: "Spacebar", keycodes: [49] },
];

function getMacKeycode(e: KeyboardEvent): { keycode: number; label: string } | null {
  switch (e.code) {
    case "AltRight":
      return { keycode: 61, label: "Right Option (⌥)" };
    case "AltLeft":
      return { keycode: 58, label: "Left Option (⌥)" };
    case "ControlRight":
      return { keycode: 62, label: "Right Control (⌃)" };
    case "ControlLeft":
      return { keycode: 59, label: "Left Control (⌃)" };
    case "ShiftRight":
      return { keycode: 60, label: "Right Shift (⇧)" };
    case "ShiftLeft":
      return { keycode: 56, label: "Left Shift (⇧)" };
    case "MetaRight":
      return { keycode: 54, label: "Right Command (⌘)" };
    case "MetaLeft":
      return { keycode: 55, label: "Left Command (⌘)" };
    case "Space":
      return { keycode: 49, label: "Spacebar" };
    case "Tab":
      return { keycode: 48, label: "Tab" };
    case "Enter":
      return { keycode: 36, label: "Return (↵)" };
    case "F1": return { keycode: 122, label: "F1" };
    case "F2": return { keycode: 120, label: "F2" };
    case "F3": return { keycode: 99, label: "F3" };
    case "F4": return { keycode: 118, label: "F4" };
    case "F5": return { keycode: 96, label: "F5" };
    case "F6": return { keycode: 97, label: "F6" };
    case "F7": return { keycode: 98, label: "F7" };
    case "F8": return { keycode: 100, label: "F8" };
    case "F9": return { keycode: 101, label: "F9" };
    case "F10": return { keycode: 109, label: "F10" };
    case "F11": return { keycode: 103, label: "F11" };
    case "F12": return { keycode: 111, label: "F12" };
    case "KeyA": return { keycode: 0, label: "A" };
    case "KeyS": return { keycode: 1, label: "S" };
    case "KeyD": return { keycode: 2, label: "D" };
    case "KeyF": return { keycode: 3, label: "F" };
    case "KeyH": return { keycode: 4, label: "H" };
    case "KeyG": return { keycode: 5, label: "G" };
    case "KeyZ": return { keycode: 6, label: "Z" };
    case "KeyX": return { keycode: 7, label: "X" };
    case "KeyC": return { keycode: 8, label: "C" };
    case "KeyV": return { keycode: 9, label: "V" };
    case "KeyB": return { keycode: 11, label: "B" };
    case "KeyQ": return { keycode: 12, label: "Q" };
    case "KeyW": return { keycode: 13, label: "W" };
    case "KeyE": return { keycode: 14, label: "E" };
    case "KeyR": return { keycode: 15, label: "R" };
    case "KeyY": return { keycode: 16, label: "Y" };
    case "KeyT": return { keycode: 17, label: "T" };
    case "Digit1": return { keycode: 18, label: "1" };
    case "Digit2": return { keycode: 19, label: "2" };
    case "Digit3": return { keycode: 20, label: "3" };
    case "Digit4": return { keycode: 21, label: "4" };
    case "Digit6": return { keycode: 22, label: "6" };
    case "Digit5": return { keycode: 23, label: "5" };
    case "Digit9": return { keycode: 25, label: "9" };
    case "Digit7": return { keycode: 26, label: "7" };
    case "Digit8": return { keycode: 28, label: "8" };
    case "Digit0": return { keycode: 29, label: "0" };
  }
  if (e.key === "Fn" || (e as any).key === "Function") {
    return { keycode: 63, label: "Fn / Globe" };
  }
  return null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  history,
  audioDevices,
  permissions,
  onUpdateSettings,
  onRefreshPermissions,
  onOpenOnboarding,
  targetSection,
  onClearTargetSection,
}) => {
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);

  useEffect(() => {
    if (!targetSection) return;

    setHighlightedSection(targetSection);
    const elemId = `settings-section-${targetSection}`;

    const timer = setTimeout(() => {
      const elem = document.getElementById(elemId);
      if (elem) {
        elem.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 60);

    const clearTimer = setTimeout(() => {
      setHighlightedSection(null);
      onClearTargetSection?.();
    }, 2200);

    return () => {
      clearTimeout(timer);
      clearTimeout(clearTimer);
    };
  }, [targetSection, onClearTargetSection]);

  const totalTokens = history.reduce((acc, item) => {
    const p =
      item.prompt_tokens ||
      (item.word_count ? 240 + Math.round((item.duration_ms / 1000) * 32) : 0);
    const o = item.output_tokens || Math.round((item.word_count || 0) * 1.35);
    return acc + p + o;
  }, 0);

  const totalCostUsd = history.reduce((acc, item) => {
    if (item.cost_usd && item.cost_usd > 0) {
      return acc + item.cost_usd;
    }
    if (!item.word_count) return acc;
    const audioTok = (item.duration_ms / 1000) * 32;
    const outTok = item.word_count * 1.35;
    return acc + (240 * 0.1 + audioTok * 0.3 + outTok * 0.4) / 1_000_000;
  }, 0);

  const formattedCost =
    totalCostUsd === 0
      ? "$0.0000"
      : totalCostUsd < 0.01
      ? `$${totalCostUsd.toFixed(4)}`
      : `$${totalCostUsd.toFixed(2)}`;
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testApiStatus, setTestApiStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testApiMsg, setTestApiMsg] = useState("");
  const [isRecordingKey, setIsRecordingKey] = useState(false);
  const [pendingCombo, setPendingCombo] = useState<{ keycode: number; label: string }[]>([]);
  const comboRef = useRef<{ keycode: number; label: string }[]>([]);

  const [liveAudioDevices, setLiveAudioDevices] = useState<string[]>(audioDevices);
  const [isRefreshingAudio, setIsRefreshingAudio] = useState(false);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  useEffect(() => {
    if (audioDevices && audioDevices.length > 0) {
      setLiveAudioDevices(audioDevices);
    }
  }, [audioDevices]);

  const refreshAudioDevices = useCallback(async () => {
    try {
      setIsRefreshingAudio(true);
      const devs = await getAudioDevices();
      if (Array.isArray(devs)) {
        setLiveAudioDevices(devs);
      }
    } catch (e) {
      console.warn("Failed to refresh audio devices:", e);
    } finally {
      setTimeout(() => setIsRefreshingAudio(false), 400);
    }
  }, []);

  useEffect(() => {
    refreshAudioDevices();
    const handleFocus = () => refreshAudioDevices();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshAudioDevices]);

  useEffect(() => {
    // Re-check permissions when window gains focus (e.g. returning from macOS System Settings)
    const handleFocus = () => {
      onRefreshPermissions();
    };
    window.addEventListener("focus", handleFocus);

    // Also poll every 1.5s while on the settings screen so toggling permissions updates in real-time
    const interval = setInterval(() => {
      onRefreshPermissions();
    }, 1500);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [onRefreshPermissions]);

  useEffect(() => {
    if (!isRecordingKey) {
      comboRef.current = [];
      setPendingCombo([]);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        comboRef.current = [];
        setPendingCombo([]);
        setIsRecordingKey(false);
        return;
      }

      const match = getMacKeycode(e);
      if (match) {
        if (!comboRef.current.some((k) => k.keycode === match.keycode)) {
          comboRef.current = [...comboRef.current, match];
          setPendingCombo(comboRef.current);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (comboRef.current.length > 0) {
        const finalCombo = [...comboRef.current];
        const updated: AppSettings = {
          ...formData,
          hotkey_key: finalCombo.map((k) => k.label).join(" + "),
          hotkey_keycode: finalCombo[0].keycode,
          hotkey_keycodes: finalCombo.map((k) => k.keycode),
        };
        comboRef.current = [];
        setPendingCombo([]);
        setIsRecordingKey(false);
        handleSave(updated);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [isRecordingKey, formData]);

  const handleSave = async (updated: AppSettings) => {
    setFormData(updated);
    try {
      await saveAppSettings(updated);
      onUpdateSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  const testApiKey = async () => {
    const key = formData.gemini_api_key.trim();
    if (!key) {
      setTestApiStatus("error");
      setTestApiMsg("Please enter an API key first.");
      return;
    }

    setTestApiStatus("testing");
    setTestApiMsg("Connecting to Google Gemini API...");

    try {
      const activeModel = formData.custom_model_id?.trim() || formData.model;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}?key=${key}`
      );
      if (res.ok) {
        setTestApiStatus("success");
        setTestApiMsg("API key verified successfully! Connected to Gemini.");
        playChime("success");
      } else {
        const err = await res.json().catch(() => ({}));
        setTestApiStatus("error");
        setTestApiMsg(err?.error?.message || `HTTP ${res.status}: Verification failed`);
        playChime("error");
      }
    } catch (err: any) {
      setTestApiStatus("error");
      setTestApiMsg(err?.message || "Failed to connect to Google API");
      playChime("error");
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-[#111114] px-10 py-7 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-[#8c8c97] mt-0.5">
            Configure Gemini AI models, macOS global hotkeys, audio devices, and permissions.
          </p>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-in fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>Saved changes</span>
          </div>
        )}
      </div>

      <div className="max-w-3xl flex flex-col gap-7 pb-16">
        {/* SECTION 0: Appearance & Theme */}
        <section className="settings-card p-6 rounded-2xl bg-[#121216] border border-[#212128] flex flex-col gap-5 shadow-sm">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1c1c24]">
            <Monitor className="w-4 h-4 text-neutral-300" />
            <h2 className="text-sm font-semibold text-white">Appearance</h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9a9aa8] mb-2">
              App Theme
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  id: "system",
                  label: "System Default",
                  desc: "Match macOS appearance",
                  icon: Monitor,
                },
                {
                  id: "light",
                  label: "Light",
                  desc: "Clean light interface",
                  icon: Sun,
                },
                {
                  id: "dark",
                  label: "Dark",
                  desc: "Sleek dark interface",
                  icon: Moon,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = (formData.theme || "system") === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSave({ ...formData, theme: opt.id })}
                    className={`theme-option-btn p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                      active
                        ? "theme-option-active bg-[#1f1d2b] border-purple-500/60 text-white shadow-sm"
                        : "bg-[#181820] border-[#292934] text-[#8e8e9c] hover:bg-[#1d1d24]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon
                        className={`w-4 h-4 ${
                          active ? "text-purple-400" : "text-[#8e8e9c]"
                        }`}
                      />
                      {active && (
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                      )}
                    </div>
                    <div className="text-xs font-semibold text-white mt-0.5">
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-[#7d7d8e] leading-snug">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 1: Google Gemini API */}
        <section
          id="settings-section-model"
          className={`p-6 rounded-2xl bg-[#121216] border flex flex-col gap-5 shadow-sm transition-all duration-500 ${
            highlightedSection === "model"
              ? "border-emerald-500/80 ring-2 ring-emerald-500/25 shadow-lg shadow-emerald-500/10"
              : "border-[#212128]"
          }`}
        >
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1c1c24]">
            <Key className="w-4 h-4 text-neutral-300" />
            <h2 className="text-sm font-semibold text-white">Google Gemini API Configuration</h2>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-[#9a9aa8] mb-1.5">
              Gemini API Key
            </label>
            <div className="relative flex items-center">
              <input
                type={showApiKey ? "text" : "password"}
                value={formData.gemini_api_key}
                onChange={(e) => {
                  const updated = { ...formData, gemini_api_key: e.target.value };
                  handleSave(updated);
                }}
                placeholder="AIzaSy..."
                className="w-full px-4 py-3 pr-24 rounded-xl bg-[#161622] border border-[#2b2b3a] text-sm font-mono text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/15 transition-all placeholder:text-[#505060]"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 p-1.5 rounded-lg text-[#787886] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-[#6b6b7a]">
                Keys are stored locally in your SQLite database.
              </span>
              <button
                type="button"
                onClick={testApiKey}
                disabled={testApiStatus === "testing"}
                className="text-xs text-purple-400 hover:text-purple-300 font-medium cursor-pointer transition-colors"
              >
                {testApiStatus === "testing" ? "Testing..." : "Test Connection"}
              </button>
            </div>

            {testApiMsg && (
              <div
                className={`mt-2.5 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  testApiStatus === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                    : "bg-red-500/10 border border-red-500/30 text-red-300"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{testApiMsg}</span>
              </div>
            )}
          </div>

          {/* Model Selector */}
          <div>
            <label className="block text-xs font-medium text-[#9a9aa8] mb-1.5">
              Active Gemini Model
            </label>
            <CustomSelect
              value={formData.model}
              onChange={(val) => {
                const updated = { ...formData, model: val };
                handleSave(updated);
              }}
              options={[
                {
                  value: "gemini-flash-lite-latest",
                  label: "gemini-flash-lite-latest",
                  badge: "Recommended",
                  description: "Ultra-fast, lowest latency for streaming speech",
                },
                {
                  value: "gemini-2.5-flash",
                  label: "gemini-2.5-flash",
                  badge: "Standard",
                  description: "Standard production flash model with high accuracy",
                },
                {
                  value: "gemini-3.5-flash-lite",
                  label: "gemini-3.5-flash-lite",
                  badge: "Fast",
                  description: "Fastest preview model",
                },
                {
                  value: "gemini-3.8-flash",
                  label: "gemini-3.8-flash",
                  badge: "High Logic",
                  description: "Complex logic and specialized vocabulary",
                },
                {
                  value: "gemini-flash-latest",
                  label: "gemini-flash-latest",
                  description: "General multimodal release",
                },
                {
                  value: "custom",
                  label: "Custom Model ID...",
                  description: "Specify your own custom tuned or private model identifier",
                },
              ]}
            />
          </div>

          {/* Custom Model ID (if selected) */}
          {(formData.model === "custom" || formData.custom_model_id) && (
            <div>
              <label className="block text-xs font-medium text-[#9a9aa8] mb-1.5">
                Custom Model Identifier
              </label>
              <input
                type="text"
                placeholder="e.g. gemini-1.5-pro, tunedModels/my-model-1"
                value={formData.custom_model_id || ""}
                onChange={(e) => {
                  const updated = { ...formData, custom_model_id: e.target.value };
                  handleSave(updated);
                }}
                className="w-full px-4 py-3 rounded-xl bg-[#161622] border border-[#2b2b3a] text-sm text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/15 transition-all placeholder:text-[#505060]"
              />
            </div>
          )}
        </section>

        {/* SECTION 1B: Gemini API Spend & Billing Panel */}
        <section className="p-6 rounded-2xl bg-[#121216] border border-[#212128] flex flex-col gap-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#1c1c24]">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">
                Estimated Gemini API Spend
              </h2>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
              Local Token Tracking
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#181820] border border-[#24242e] flex flex-col gap-1">
              <span className="text-xs text-[#8c8c97]">Estimated Total Spend</span>
              <span className="text-2xl font-bold text-white tracking-tight">
                {formattedCost}
              </span>
              <span className="text-[11px] text-[#6b6b7a]">
                Based on {formData.model} per-token rates
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#181820] border border-[#24242e] flex flex-col gap-1">
              <span className="text-xs text-[#8c8c97]">Total Tokens Processed</span>
              <span className="text-2xl font-bold text-white tracking-tight">
                {totalTokens.toLocaleString()}
              </span>
              <span className="text-[11px] text-[#6b6b7a]">
                Across {history.length} {history.length === 1 ? "dictation" : "dictations"}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-[11.5px] text-[#7b7b8a] leading-relaxed">
              Calculated locally from Gemini <code className="text-neutral-300">usageMetadata</code> token counts. Check Google AI Studio to confirm your official invoiced billing.
            </p>

            <button
              type="button"
              onClick={() => openExternalUrl("https://aistudio.google.com/spend")}
              className="shrink-0 px-4 py-2 rounded-xl bg-[#1d1d24] hover:bg-[#25252e] border border-[#2b2b36] text-neutral-200 font-medium text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Gemini Billing Console</span>
              <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
            </button>
          </div>
        </section>

        {/* SECTION 2: Hotkey & Dictation Modes */}
        <section
          id="settings-section-hotkey"
          className={`p-6 rounded-2xl bg-[#121216] border flex flex-col gap-5 shadow-sm transition-all duration-500 ${
            highlightedSection === "hotkey"
              ? "border-purple-500/80 ring-2 ring-purple-500/25 shadow-lg shadow-purple-500/10"
              : "border-[#212128]"
          }`}
        >
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1c1c24]">
            <Command className="w-4 h-4 text-neutral-300" />
            <h2 className="text-sm font-semibold text-white">Global Hotkey & Dictation Modes</h2>
          </div>

          {/* Hotkey Mode */}
          <div>
            <label className="block text-xs font-medium text-[#9a9aa8] mb-2">
              Dictation Trigger Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSave({ ...formData, hotkey_mode: "push_to_talk" })}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  formData.hotkey_mode === "push_to_talk"
                    ? "bg-[#1f1d2b] border-purple-500/50 text-white"
                    : "bg-[#181820] border-[#292934] text-[#8e8e9c] hover:bg-[#1d1d24]"
                }`}
              >
                <div className="text-xs font-semibold text-white mb-0.5">
                  Push-to-Talk (Hold)
                </div>
                <div className="text-[11px] text-[#7d7d8e] leading-snug">
                  Hold down key to record, release to transcribe & auto-paste.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSave({ ...formData, hotkey_mode: "hands_free" })}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  formData.hotkey_mode === "hands_free"
                    ? "bg-[#1f1d2b] border-purple-500/50 text-white"
                    : "bg-[#181820] border-[#292934] text-[#8e8e9c] hover:bg-[#1d1d24]"
                }`}
              >
                <div className="text-xs font-semibold text-white mb-0.5">
                  Hands-Free Toggle
                </div>
                <div className="text-[11px] text-[#7d7d8e] leading-snug">
                  Press once to begin recording, press again when finished.
                </div>
              </button>
            </div>
          </div>

          {/* Key Selection & Recorder */}
          <div>
            <label className="block text-xs font-medium text-[#9a9aa8] mb-2">
              Activation Shortcut Key
            </label>

            {/* Interactive Shortcut Box */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div
                onClick={() => setIsRecordingKey(true)}
                className={`flex-1 flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer select-none ${
                  isRecordingKey
                    ? "bg-[#251d38] border-purple-500 shadow-lg shadow-purple-950/40 ring-2 ring-purple-500/20"
                    : "bg-[#181820] border-[#292934] hover:border-[#383846] hover:bg-[#1b1b24]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-semibold ${
                      isRecordingKey
                        ? "bg-purple-500 text-white animate-pulse"
                        : "bg-[#242430] text-purple-300 border border-[#343444]"
                    }`}
                  >
                    {isRecordingKey ? "⏺" : "⌨"}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {isRecordingKey
                        ? pendingCombo.length > 0
                          ? pendingCombo.map((k) => k.label).join(" + ")
                          : "Hold your key combination, then release..."
                        : formData.hotkey_key}
                    </div>
                    <div className="text-[11px] text-[#7d7d8e]">
                      {isRecordingKey
                        ? pendingCombo.length > 0
                          ? "Release keys to save combination (or Esc to cancel)"
                          : "Supports single keys or multi-key combinations (Esc to cancel)"
                        : `macOS Keycodes: ${
                            formData.hotkey_keycodes?.length
                              ? formData.hotkey_keycodes.join(" + ")
                              : (formData.hotkey_keycode ?? 61)
                          }`}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRecordingKey(!isRecordingKey);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isRecordingKey
                      ? "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                      : "bg-white/10 text-white hover:bg-white/15 border border-white/10"
                  }`}
                >
                  {isRecordingKey ? "Cancel (Esc)" : "Record Shortcut"}
                </button>
              </div>
            </div>

            {/* Quick Presets Dropdown */}
            <div className="mt-3 flex items-center gap-2.5">
              <span className="text-xs text-[#78788a] whitespace-nowrap">Or pick a preset:</span>
              <div className="flex-1">
                <CustomSelect
                  size="md"
                  value={
                    formData.hotkey_keycodes?.length
                      ? formData.hotkey_keycodes.join(",")
                      : String(formData.hotkey_keycode ?? 61)
                  }
                  onChange={(val) => {
                    const preset = MAC_PRESETS.find((p) => p.keycodes.join(",") === val);
                    if (preset) {
                      const updated: AppSettings = {
                        ...formData,
                        hotkey_key: preset.key,
                        hotkey_keycode: preset.keycodes[0],
                        hotkey_keycodes: preset.keycodes,
                      };
                      handleSave(updated);
                    }
                  }}
                  options={MAC_PRESETS.map((p) => ({
                    value: p.keycodes.join(","),
                    label: p.label,
                  }))}
                />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: Audio & Microphone */}
        <section
          id="settings-section-mic"
          className={`p-6 rounded-2xl bg-[#121216] border flex flex-col gap-5 shadow-sm transition-all duration-500 ${
            highlightedSection === "mic"
              ? "border-sky-500/80 ring-2 ring-sky-500/25 shadow-lg shadow-sky-500/10"
              : "border-[#212128]"
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#1c1c24]">
            <div className="flex items-center gap-2.5">
              <Mic className="w-4 h-4 text-neutral-300" />
              <h2 className="text-sm font-semibold text-white">Audio & Microphone Input</h2>
            </div>
            <button
              type="button"
              onClick={refreshAudioDevices}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Rescan connected audio devices"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingAudio ? "animate-spin" : ""}`} />
              <span>Rescan</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9a9aa8] mb-1.5">
              Microphone Device
            </label>
            {(() => {
              const currentMic = formData.mic_device || "default";
              const isDefault = currentMic === "default";
              const isFoundInList = isDefault || liveAudioDevices.includes(currentMic);

              const options = [
                {
                  value: "default",
                  label: "Default macOS System Microphone",
                  description: "Automatically uses the input device selected in macOS Sound Settings",
                },
                ...liveAudioDevices.map((dev) => ({
                  value: dev,
                  label: dev,
                  badge: dev === currentMic ? "Active" : undefined,
                })),
              ];

              if (!isFoundInList && currentMic) {
                options.push({
                  value: currentMic,
                  label: currentMic,
                  badge: "Selected",
                  description: "Device may be temporarily disconnected",
                });
              }

              return (
                <CustomSelect
                  value={currentMic}
                  placeholder="Default macOS System Microphone"
                  onChange={(val) => {
                    const updated = { ...formData, mic_device: val };
                    handleSave(updated);
                  }}
                  options={options}
                />
              );
            })()}
            <span className="text-[11px] text-[#6b6b7a] mt-1.5 block">
              Records in 16kHz, 16-bit, Mono PCM in-memory to minimize Gemini payload latency.
            </span>
          </div>
        </section>

        {/* SECTION 4: macOS Permissions Status Panel */}
        <section className="p-6 rounded-2xl bg-[#121216] border border-[#212128] flex flex-col gap-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#1c1c24]">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-neutral-300" />
              <h2 className="text-sm font-semibold text-white">macOS Permissions Status Panel</h2>
            </div>
            <div className="flex items-center gap-3">
              {onOpenOnboarding && (
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Setup Guide</span>
                </button>
              )}
              <button
                type="button"
                onClick={onRefreshPermissions}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Check Status</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            {/* Microphone Permission */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#181820] border border-[#24242e]">
              <div>
                <div className="text-xs font-semibold text-white">Microphone Access</div>
                <div className="text-[11px] text-[#7b7b8a]">
                  Required for capturing spoken voice audio.
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {permissions?.microphone ? (
                  <span className="flex items-center gap-1 text-[11.5px] text-emerald-400 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    <span>Granted</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11.5px] text-amber-400 font-medium">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Action Needed</span>
                  </span>
                )}

                <button
                  onClick={() => openSystemSettings("microphone")}
                  className="px-3 py-1 rounded-lg bg-[#24242e] hover:bg-[#30303c] text-xs text-neutral-200 transition-colors cursor-pointer"
                >
                  Open Mac Settings
                </button>
              </div>
            </div>

            {/* Accessibility Permission */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#181820] border border-[#24242e]">
              <div>
                <div className="text-xs font-semibold text-white">Accessibility (Device Control & Data Access)</div>
                <div className="text-[11px] text-[#7b7b8a]">
                  Required for native Cmd+V auto-pasting at your cursor. Listed as "Device Control and Data Access" in macOS Sequoia.
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {permissions?.accessibility ? (
                  <span className="flex items-center gap-1 text-[11.5px] text-emerald-400 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    <span>Granted</span>
                  </span>
                ) : (
                  <button
                    onClick={async () => {
                      await requestAccessibilityPermission();
                      openSystemSettings("accessibility");
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Grant Access
                  </button>
                )}

                <button
                  onClick={() => openSystemSettings("accessibility")}
                  className="px-3 py-1 rounded-lg bg-[#24242e] hover:bg-[#30303c] text-xs text-neutral-200 transition-colors cursor-pointer"
                >
                  Open Mac Settings
                </button>
              </div>
            </div>

            {/* Input Monitoring */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#181820] border border-[#24242e]">
              <div>
                <div className="text-xs font-semibold text-white">
                  Input Monitoring
                </div>
                <div className="text-[11px] text-[#7b7b8a]">
                  Required for global hotkeys (e.g. ⌥ Option, ⇧ Shift) while other apps are active.
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {permissions?.input_monitoring ? (
                  <span className="flex items-center gap-1 text-[11.5px] text-emerald-400 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    <span>Granted</span>
                  </span>
                ) : (
                  <button
                    onClick={async () => {
                      await requestInputMonitoringPermission();
                      openSystemSettings("input_monitoring");
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Grant Access
                  </button>
                )}

                <button
                  onClick={() => openSystemSettings("input_monitoring")}
                  className="px-3 py-1 rounded-lg bg-[#24242e] hover:bg-[#30303c] text-xs text-neutral-200 transition-colors cursor-pointer"
                >
                  Open Mac Settings
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: Text Injection & Preferences */}
        <section className="p-6 rounded-2xl bg-[#121216] border border-[#212128] flex flex-col gap-5 shadow-sm">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#1c1c24]">
            <Sliders className="w-4 h-4 text-neutral-300" />
            <h2 className="text-sm font-semibold text-white">Text Injection & Preferences</h2>
          </div>

          <div className="flex flex-col gap-5">
            {/* Auto Paste */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-white">Auto-paste at Cursor</div>
                <div className="text-[11px] text-[#7b7b8a]">
                  Automatically synthesizes native Cmd+V into the active application.
                </div>
              </div>
              <ToggleSwitch
                checked={formData.auto_paste}
                onChange={(checked) => {
                  const updated = { ...formData, auto_paste: checked };
                  handleSave(updated);
                }}
              />
            </div>

            {/* Sound Feedback */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-white">Audio Feedback Chimes</div>
                <div className="text-[11px] text-[#7b7b8a]">
                  Play gentle tone when dictation starts and finishes.
                </div>
              </div>
              <ToggleSwitch
                checked={formData.sound_effects}
                onChange={(checked) => {
                  const updated = { ...formData, sound_effects: checked };
                  handleSave(updated);
                }}
              />
            </div>

            {/* Floating HUD Pill */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-white">Floating HUD Dictation Pill</div>
                <div className="text-[11px] text-[#7b7b8a]">
                  Show floating non-intrusive waveform pill at bottom of screen.
                </div>
              </div>
              <ToggleSwitch
                checked={formData.pill_enabled}
                onChange={(checked) => {
                  const updated = { ...formData, pill_enabled: checked };
                  handleSave(updated);
                }}
              />
            </div>

            {/* Pause Media During Dictation */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-white">Pause Media During Dictation</div>
                <div className="text-[11px] text-[#7b7b8a]">
                  Like Wispr Flow: automatically pauses music and video playback (Spotify, Apple Music, YouTube) during dictation, and resumes when finished.
                </div>
              </div>
              <ToggleSwitch
                checked={formData.pause_media !== false && formData.mute_audio !== false}
                onChange={(checked) => {
                  const updated = { ...formData, pause_media: checked, mute_audio: checked };
                  handleSave(updated);
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
