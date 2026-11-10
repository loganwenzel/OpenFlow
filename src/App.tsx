import { useEffect, useState, useCallback } from "react";
import { Sidebar, TabType } from "./components/Sidebar";
import { DictationView } from "./components/DictationView";
import { DictionaryView } from "./components/DictionaryView";
import { SnippetsView } from "./components/SnippetsView";
import { SettingsView } from "./components/SettingsView";
import { FloatingPill } from "./components/FloatingPill";
import { OnboardingModal } from "./components/OnboardingModal";
import {
  checkPermissions,
  getAppSettings,
  getAudioDevices,
  getDictionary,
  getHistory,
  getSnippets,
  onDictationCompleted,
  onDictationStateChanged,
  startDictation,
  stopDictation,
} from "./api";
import {
  AppSettings,
  Dictation,
  DictionaryEntry,
  PermissionsStatus,
  SnippetEntry,
} from "./types";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export function App() {
  const isPillWindow =
    window.location.search.includes("window=pill") ||
    window.location.hash.includes("pill");

  if (isPillWindow) {
    return <FloatingPill />;
  }

  const [currentTab, setCurrentTab] = useState<TabType>("dictation");
  const [history, setHistory] = useState<Dictation[]>([]);
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);
  const [snippets, setSnippets] = useState<SnippetEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    gemini_api_key: "",
    model: "gemini-flash-lite-latest",
    custom_model_id: null,
    hotkey_mode: "push_to_talk",
    hotkey_key: "Left Control (⌃) + Left Shift (⇧)",
    hotkey_keycode: 59,
    hotkey_keycodes: [59, 56],
    mic_device: "default",
    auto_paste: true,
    sound_effects: true,
    pill_enabled: true,
    pause_media: true,
    mute_audio: true,
    theme: "system",
  });
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<PermissionsStatus | null>(null);
  const [dictationState, setDictationState] = useState<string>("idle");
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [hasDismissedOnboarding, setHasDismissedOnboarding] = useState<boolean>(false);
  const [targetSettingsSection, setTargetSettingsSection] = useState<string | null>(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true
  );

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const themePref = settings.theme || "system";
  const resolvedTheme: "dark" | "light" =
    themePref === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : themePref === "light"
      ? "light"
      : "dark";

  useEffect(() => {
    try {
      const win = getCurrentWebviewWindow();
      win.setTheme(themePref === "system" ? null : resolvedTheme).catch(() => {});
    } catch {
      // Ignore outside Tauri context
    }
  }, [themePref, resolvedTheme]);

  const handleRefreshPermissions = useCallback(async () => {
    try {
      const perms = await checkPermissions();
      setPermissions(perms);
      return perms;
    } catch (e) {
      console.error("Failed to check permissions:", e);
      return null;
    }
  }, []);

  const loadData = async () => {
    try {
      const [hist, dict, snip, sett, devs, perms] = await Promise.all([
        getHistory().catch(() => []),
        getDictionary().catch(() => []),
        getSnippets().catch(() => []),
        getAppSettings().catch(() => settings),
        getAudioDevices().catch(() => []),
        checkPermissions().catch(() => ({ accessibility: true, microphone: true, input_monitoring: true })),
      ]);

      setHistory(hist);
      setDictionary(dict);
      setSnippets(snip);
      setSettings(sett);
      setAudioDevices(devs);
      setPermissions(perms);

      const isMissingSetup =
        !sett.gemini_api_key?.trim() ||
        !perms.microphone ||
        !perms.accessibility ||
        !perms.input_monitoring;

      if (isMissingSetup && !hasDismissedOnboarding) {
        setShowOnboarding(true);
      } else if (!isMissingSetup) {
        setShowOnboarding(false);
      }
    } catch (e) {
      console.error("Failed to load initial data:", e);
    }
  };

  useEffect(() => {
    loadData();

    let unlistenState: (() => void) | undefined;
    let unlistenCompleted: (() => void) | undefined;

    onDictationStateChanged((payload) => {
      setDictationState(payload.state);
    }).then((un) => {
      unlistenState = un;
    });

    onDictationCompleted((newItem) => {
      setHistory((prev) => [newItem, ...prev]);
    }).then((un) => {
      unlistenCompleted = un;
    });

    return () => {
      unlistenState?.();
      unlistenCompleted?.();
    };
  }, []);

  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target.closest("button, input, select, textarea, a, [role='button'], kbd, [data-no-drag]")) {
        return;
      }
      getCurrentWebviewWindow().startDragging().catch((err) => {
        console.warn("[Window Drag] startDragging failed:", err);
      });
    }
  };

  const handleDoubleClickTitlebar = () => {
    getCurrentWebviewWindow().toggleMaximize().catch((err) => {
      console.warn("[Window Drag] toggleMaximize failed:", err);
    });
  };

  return (
    <div
      className={`app-shell theme-${resolvedTheme} flex flex-col h-screen w-screen overflow-hidden bg-[#0e0e11] text-[#f4f4f7] select-none`}
    >
      {/* Dedicated macOS Titlebar / Drag Region so Close, Minimize, and Expand buttons never overlap content */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        onDoubleClick={handleDoubleClickTitlebar}
        className="app-titlebar h-9 w-full shrink-0 flex items-center justify-center bg-[#0e0e11] cursor-default select-none"
      />

      {/* Main Content Area below traffic lights */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Sidebar matching Wispr Flow */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setTargetSettingsSection(null);
            setCurrentTab(tab);
            if (tab === "settings") {
              getAudioDevices().then((devs) => setAudioDevices(devs)).catch(() => {});
            }
          }}
          onNavigateSection={(section) => {
            setTargetSettingsSection(section);
            setCurrentTab("settings");
            getAudioDevices().then((devs) => setAudioDevices(devs)).catch(() => {});
          }}
          settings={settings}
          permissions={permissions}
          dictationState={dictationState}
        />

        {/* Main Canvas with nested rounded card container */}
        <div className="flex-1 h-full min-h-0 flex flex-col pr-2.5 pb-2.5 pl-0 overflow-hidden">
          <div className="app-canvas flex-1 h-full min-h-0 flex flex-col bg-[#111114] rounded-2xl border border-[#1e1e24] overflow-hidden shadow-2xl">
            {/* View Container with proper flex scrolling constraint */}
            <main className="flex-1 min-h-0 flex overflow-hidden">
              {currentTab === "dictation" && (
                <DictationView
                  history={history}
                  onRefresh={loadData}
                  onNavigateTab={setCurrentTab}
                  dictationState={dictationState}
                  onStartDictation={() => startDictation()}
                  onStopDictation={() => stopDictation()}
                  permissions={permissions}
                />
              )}

              {currentTab === "dictionary" && (
                <DictionaryView
                  entries={dictionary}
                  onRefresh={loadData}
                />
              )}

              {currentTab === "snippets" && (
                <SnippetsView
                  snippets={snippets}
                  onRefresh={loadData}
                />
              )}

              {currentTab === "settings" && (
                <SettingsView
                  settings={settings}
                  history={history}
                  audioDevices={audioDevices}
                  permissions={permissions}
                  onUpdateSettings={setSettings}
                  onRefreshPermissions={handleRefreshPermissions}
                  targetSection={targetSettingsSection}
                  onClearTargetSection={() => setTargetSettingsSection(null)}
                  onOpenOnboarding={() => {
                    setHasDismissedOnboarding(false);
                    setShowOnboarding(true);
                  }}
                />
              )}
            </main>
          </div>
        </div>
      </div>

      {showOnboarding && (
        <OnboardingModal
          permissions={permissions}
          settings={settings}
          onRefreshPermissions={handleRefreshPermissions}
          onComplete={() => {
            setHasDismissedOnboarding(true);
            setShowOnboarding(false);
          }}
          onUpdateSettings={setSettings}
        />
      )}
    </div>
  );
}

export default App;
