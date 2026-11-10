import React from "react";
import {
  Mic,
  BookA,
  Scissors,
  Settings as SettingsIcon,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { AppSettings, PermissionsStatus } from "../types";

export type TabType = "dictation" | "dictionary" | "snippets" | "settings";

function formatKeyLabel(rawKey: string): string {
  return rawKey
    .replace(/Left Control \(⌃\)/g, "Left Ctrl")
    .replace(/Right Control \(⌃\)/g, "Right Ctrl")
    .replace(/Left Shift \(⇧\)/g, "Left Shift")
    .replace(/Right Shift \(⇧\)/g, "Right Shift")
    .replace(/Left Option \(⌥\)/g, "Left Opt")
    .replace(/Right Option \(⌥\)/g, "Right Opt")
    .replace(/Left Command \(⌘\)/g, "Left Cmd")
    .replace(/Right Command \(⌘\)/g, "Right Cmd")
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
}

function formatMicLabel(rawDev?: string | null): string {
  if (!rawDev || rawDev === "default" || rawDev.toLowerCase() === "default") {
    return "Default";
  }
  return rawDev
    .replace(/^Default macOS System Microphone$/i, "Default")
    .replace(/ Microphone$/i, "")
    .replace(/ \(Built-in\)$/i, "")
    .trim() || rawDev;
}

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onNavigateSection?: (section: "hotkey" | "model" | "mic") => void;
  settings: AppSettings | null;
  permissions: PermissionsStatus | null;
  dictationState: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onNavigateSection,
  settings,
  permissions,
  dictationState,
}) => {
  const isHealthy =
    Boolean(permissions?.accessibility && permissions?.microphone && permissions?.input_monitoring);

  return (
    <aside className="app-sidebar w-56 shrink-0 h-full flex flex-col justify-between bg-[#0e0e11] border-r border-[#1a1a20] px-3 pb-3 pt-1 select-none">
      {/* Brand & Main Navigation */}
      <div className="flex flex-col gap-5">
        {/* Brand Header (positioned cleanly below the macOS traffic light drag bar) */}
        <div className="flex items-center gap-2.5 px-3 pt-1">
          <img
            src="/app-icon.png"
            alt="OpenFlow"
            className="w-6 h-6 rounded-lg object-contain shadow-sm"
          />
          <span className="brand-title text-[16px] font-semibold text-white tracking-tight">
            OpenFlow
          </span>
        </div>

        {/* Primary Navigation Items */}
        <nav className="flex flex-col gap-1">
          <button
            onClick={() => onSelectTab("dictation")}
            className={`nav-item flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all cursor-pointer ${
              currentTab === "dictation"
                ? "nav-item-active bg-[#1c1c22] text-white shadow-inner"
                : "text-[#8e8e99] hover:text-[#f0f0f3] hover:bg-[#15151a]"
            }`}
          >
            <Mic className="w-4 h-4 text-inherit" />
            <span>Dictation</span>
            {dictationState === "recording" && (
              <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => onSelectTab("dictionary")}
            className={`nav-item flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all cursor-pointer ${
              currentTab === "dictionary"
                ? "nav-item-active bg-[#1c1c22] text-white shadow-inner"
                : "text-[#8e8e99] hover:text-[#f0f0f3] hover:bg-[#15151a]"
            }`}
          >
            <BookA className="w-4 h-4 text-inherit" />
            <span>Dictionary</span>
          </button>

          <button
            onClick={() => onSelectTab("snippets")}
            className={`nav-item flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all cursor-pointer ${
              currentTab === "snippets"
                ? "nav-item-active bg-[#1c1c22] text-white shadow-inner"
                : "text-[#8e8e99] hover:text-[#f0f0f3] hover:bg-[#15151a]"
            }`}
          >
            <Scissors className="w-4 h-4 text-inherit" />
            <span>Snippets</span>
          </button>
        </nav>
      </div>

      {/* Bottom-Left Unified Dock */}
      <div className="flex flex-col gap-2">
        <div className="sidebar-dock rounded-2xl bg-[#141418] border border-[#202026] overflow-hidden flex flex-col">
          {/* Hotkey, Model & Mic Quick-Jump Info */}
          <div className="p-2.5 text-xs flex flex-col gap-1">
            {/* Hotkey Row */}
            <button
              type="button"
              onClick={() => (onNavigateSection ? onNavigateSection("hotkey") : onSelectTab("settings"))}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-[#1c1c24] transition-colors cursor-pointer text-left group"
              title="Click to edit hotkey in settings"
            >
              <span className="text-[#888892] group-hover:text-neutral-200 font-medium shrink-0 transition-colors">
                Hotkey
              </span>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {(settings?.hotkey_key || "Left Control (⌃) + Left Shift (⇧)")
                  .split(" + ")
                  .map((part, idx, arr) => (
                    <React.Fragment key={idx}>
                      <kbd className="hotkey-badge font-sans text-[11px] font-medium bg-[#1d1d24] group-hover:bg-[#252530] text-neutral-200 px-1.5 py-0.5 rounded-md border border-[#2b2b35] group-hover:border-[#3b3b48] shadow-2xs transition-colors">
                        {formatKeyLabel(part)}
                      </kbd>
                      {idx < arr.length - 1 && (
                        <span className="text-[10px] text-[#686875] font-medium">+</span>
                      )}
                    </React.Fragment>
                  ))}
              </div>
            </button>

            {/* Model Row */}
            <button
              type="button"
              onClick={() => (onNavigateSection ? onNavigateSection("model") : onSelectTab("settings"))}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-[#1c1c24] transition-colors cursor-pointer text-left group"
              title="Click to edit AI model in settings"
            >
              <span className="text-[#888892] group-hover:text-neutral-200 font-medium shrink-0 transition-colors">
                Model
              </span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-500 group-hover:text-emerald-400 font-medium truncate transition-colors">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[105px]">
                  {settings?.model?.replace("gemini-", "") || "flash-lite"}
                </span>
              </span>
            </button>

            {/* Microphone Input Row */}
            <button
              type="button"
              onClick={() => (onNavigateSection ? onNavigateSection("mic") : onSelectTab("settings"))}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-[#1c1c24] transition-colors cursor-pointer text-left group"
              title={`Click to edit microphone input in settings (${settings?.mic_device || "Default"})`}
            >
              <span className="text-[#888892] group-hover:text-neutral-200 font-medium shrink-0 transition-colors">
                Mic
              </span>
              <span className="flex items-center gap-1 text-[11px] text-sky-400 group-hover:text-sky-300 font-medium truncate transition-colors">
                <Mic className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[105px]" title={settings?.mic_device || "Default"}>
                  {formatMicLabel(settings?.mic_device)}
                </span>
              </span>
            </button>
          </div>

          {/* Integrated Bottom-Left Settings Button */}
          <button
            onClick={() => onSelectTab("settings")}
            className={`nav-item flex items-center gap-2.5 px-3 py-2.5 border-t border-[#1e1e26] text-[13px] font-medium transition-all cursor-pointer ${
              currentTab === "settings"
                ? "nav-item-active bg-[#1c1c22] text-white"
                : "text-[#8e8e99] hover:text-[#f0f0f3] hover:bg-[#18181f]"
            }`}
          >
            <SettingsIcon className="w-4 h-4 text-inherit" />
            <span>Settings</span>
            {!isHealthy && (
              <AlertTriangle className="ml-auto w-3.5 h-3.5 text-amber-400" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};
