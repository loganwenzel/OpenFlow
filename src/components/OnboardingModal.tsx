import React, { useState, useEffect } from "react";
import {
  Mic,
  Command,
  Key,
  Check,
  ArrowRight,
  ExternalLink,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { PermissionsStatus, AppSettings } from "../types";
import {
  openSystemSettings,
  saveAppSettings,
  playChime,
} from "../api";

interface OnboardingModalProps {
  permissions: PermissionsStatus | null;
  settings: AppSettings;
  onRefreshPermissions: () => void;
  onComplete: () => void;
  onUpdateSettings: (s: AppSettings) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  permissions,
  settings,
  onRefreshPermissions,
  onComplete,
  onUpdateSettings,
}) => {
  const [apiKey, setApiKey] = useState(settings.gemini_api_key || "");
  const allPermissionsGranted =
    Boolean(permissions?.microphone && permissions?.accessibility && permissions?.input_monitoring);

  const [step, setStep] = useState<1 | 2>(() => {
    return permissions?.microphone && permissions?.accessibility && permissions?.input_monitoring ? 2 : 1;
  });

  // Poll permissions while modal is open so flips in System Settings reflect in real time
  useEffect(() => {
    const handleFocus = () => onRefreshPermissions();
    window.addEventListener("focus", handleFocus);
    const interval = setInterval(() => {
      onRefreshPermissions();
    }, 1500);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [onRefreshPermissions]);

  const handleSaveKey = () => {
    const updated = { ...settings, gemini_api_key: apiKey.trim() };
    saveAppSettings(updated).catch(() => {});
    onUpdateSettings(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#141418] border border-[#262632] rounded-3xl p-7 shadow-2xl flex flex-col gap-6 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3.5">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/10 border border-indigo-500/30 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">OpenFlow Setup</h2>
              <p className="text-xs text-neutral-400">
                {step === 1
                  ? "Configure the 3 macOS permissions needed to dictate anywhere."
                  : "Add your Gemini API key to start transcribing."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onRefreshPermissions()}
            className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1a1a22] hover:bg-[#252530] border border-[#262634] rounded-xl transition-colors cursor-pointer shrink-0"
            title="Re-check granted permissions"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check Status</span>
          </button>
        </div>

        {/* Step Selector Tabs */}
        <div className="flex items-center gap-2 p-1 bg-[#1a1a22] border border-[#252530] rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              step === 1 ? "bg-[#282836] text-white shadow-xs" : "text-neutral-400 hover:text-white"
            }`}
          >
            <span>1. macOS Permissions</span>
            {allPermissionsGranted && <Check className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              step === 2 ? "bg-[#282836] text-white shadow-xs" : "text-neutral-400 hover:text-white"
            }`}
          >
            <span>2. Gemini API Key</span>
            {Boolean(settings.gemini_api_key?.trim() || apiKey.trim()) && (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3">
            {/* 1. Microphone Access */}
            <div className="p-3.5 rounded-2xl bg-[#1a1a22] border border-[#252530] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Microphone Access</div>
                  <div className="text-[11px] text-neutral-400">
                    Captures your spoken voice when holding the hotkey.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {permissions?.microphone ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-2.5 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <Check className="w-3.5 h-3.5" />
                    <span>Granted</span>
                  </span>
                ) : (
                  <button
                    onClick={() => openSystemSettings("microphone")}
                    className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                  >
                    Open Settings
                  </button>
                )}
              </div>
            </div>

            {/* 2. Input Monitoring (Device Control) */}
            <div className="p-3.5 rounded-2xl bg-[#1a1a22] border border-[#252530] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">
                    Input Monitoring (Device Control)
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Detects your dictation hotkey while in other apps.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {permissions?.input_monitoring ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-2.5 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <Check className="w-3.5 h-3.5" />
                    <span>Granted</span>
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openSystemSettings("input_monitoring")}
                      className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                    >
                      Open Settings
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Accessibility Permissions */}
            <div className="p-3.5 rounded-2xl bg-[#1a1a22] border border-[#252530] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Command className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Accessibility (Device Control & Data Access)</div>
                  <div className="text-[11px] text-neutral-400">
                    Pastes transcribed text at your active cursor with native ⌘V. Listed as "Device Control and Data Access" in macOS Sequoia.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {permissions?.accessibility ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-2.5 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <Check className="w-3.5 h-3.5" />
                    <span>Granted</span>
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openSystemSettings("accessibility")}
                      className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                    >
                      Open Settings
                    </button>
                  </div>
                )}
              </div>
            </div>

            {allPermissionsGranted && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400/90 pt-1">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>All 3 macOS permissions granted</span>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Gemini API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#1a1a22] border border-[#2c2c38] text-xs font-mono text-white focus:outline-none focus:border-indigo-400 transition-colors"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-neutral-500">
                  Free tier available on Google AI Studio.
                </span>
                <button
                  type="button"
                  onClick={() => openSystemSettings("https://aistudio.google.com/app/apikey")}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Get API Key</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-[#22222c]">
          <button
            onClick={() => {
              if (step === 2) {
                handleSaveKey();
              }
              onComplete();
            }}
            className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            Skip for now
          </button>

          {step === 1 ? (
            <button
              onClick={() => {
                if (Boolean(settings.gemini_api_key?.trim() || apiKey.trim()) && allPermissionsGranted) {
                  playChime("success");
                  onComplete();
                } else {
                  setStep(2);
                }
              }}
              className={`px-4 py-2 rounded-xl text-xs font-medium text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm ${
                Boolean(settings.gemini_api_key?.trim() || apiKey.trim()) && allPermissionsGranted
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-indigo-600 hover:bg-indigo-500"
              }`}
            >
              <span>
                {Boolean(settings.gemini_api_key?.trim() || apiKey.trim()) && allPermissionsGranted
                  ? "Finish Setup"
                  : "Next: API Key"}
              </span>
              {Boolean(settings.gemini_api_key?.trim() || apiKey.trim()) && allPermissionsGranted ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-3 py-2 rounded-xl bg-[#22222d] hover:bg-[#2c2c3b] text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={() => {
                  handleSaveKey();
                  playChime("success");
                  onComplete();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Finish Setup</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
