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

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  settings: AppSettings | null;
  permissions: PermissionsStatus | null;
  dictationState: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  settings,
  permissions,
  dictationState,
}) => {
  const isHealthy = permissions?.accessibility && permissions?.microphone;

  return (
    <aside className="app-sidebar w-56 shrink-0 h-full flex flex-col justify-between bg-[#0e0e11] border-r border-[#1a1a20] px-3 pb-3 pt-1 select-none">
      {/* Brand & Main Navigation */}
      <div className="flex flex-col gap-5">
        {/* Brand Header (positioned cleanly below the macOS traffic light drag bar) */}
        <div className="flex items-center gap-2.5 px-3 pt-1">
          {/* Soundwave Logo Icon */}
          <div className="flex items-center gap-[2.5px] h-5">
            <div className="brand-bar w-[3px] h-3 bg-white rounded-full" />
            <div className="brand-bar w-[3px] h-5 bg-white rounded-full" />
            <div className="brand-bar w-[3px] h-4 bg-white rounded-full" />
            <div className="brand-bar w-[3px] h-2 bg-white rounded-full" />
          </div>
          <span className="brand-title text-[17px] font-semibold text-white tracking-tight">
            Flow
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
          {/* Hotkey & Model Info */}
          <div className="p-3 text-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#888892] font-medium shrink-0">Hotkey</span>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {(settings?.hotkey_key || "Left Control (⌃) + Left Shift (⇧)")
                  .split(" + ")
                  .map((part, idx, arr) => (
                    <React.Fragment key={idx}>
                      <kbd className="hotkey-badge font-sans text-[11px] font-medium bg-[#1d1d24] text-neutral-200 px-1.5 py-0.5 rounded-md border border-[#2b2b35] shadow-2xs">
                        {formatKeyLabel(part)}
                      </kbd>
                      {idx < arr.length - 1 && (
                        <span className="text-[10px] text-[#686875] font-medium">+</span>
                      )}
                    </React.Fragment>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[#888892] font-medium shrink-0">Model</span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium truncate">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {settings?.model?.replace("gemini-", "") || "flash-lite"}
                </span>
              </span>
            </div>
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
