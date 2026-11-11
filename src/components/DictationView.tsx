import { useState } from "react";
import {
  Search,
  Copy,
  Check,
  ClipboardCheck,
  Volume2,
  Trash2,
  Mic,
  Square,
  Sparkles,
  AppWindow,
  ShieldAlert,
} from "lucide-react";
import { Dictation, PermissionsStatus } from "../types";
import { deleteHistory } from "../api";

interface DictationViewProps {
  history: Dictation[];
  onRefresh: () => void;
  onNavigateTab: (tab: "dictation" | "dictionary" | "snippets" | "settings") => void;
  dictationState: string;
  onStartDictation: () => void;
  onStopDictation: () => void;
  permissions?: PermissionsStatus | null;
  hotkeyKey?: string;
}

export const DictationView: React.FC<DictationViewProps> = ({
  history,
  onRefresh,
  onNavigateTab,
  dictationState,
  onStartDictation,
  onStopDictation,
  permissions,
  hotkeyKey,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Stats calculation
  const totalWords = history.reduce((acc, item) => acc + (item.word_count || 0), 0);
  const averageWpm = 132;
  const timeSavedHours = ((totalWords * 2.5) / 60 / 60).toFixed(1);

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
      ? "$0.00"
      : totalCostUsd < 0.01
      ? `$${totalCostUsd.toFixed(4)}`
      : `$${totalCostUsd.toFixed(2)}`;

  // Bar fill relative to a $1.00 reference scale (with a subtle minimum visual indicator when > 0)
  const spendFillPct =
    totalCostUsd === 0 ? 0 : Math.min(100, Math.max(8, (totalCostUsd / 1.0) * 100));

  // Filter history
  const filteredHistory = history.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.text.toLowerCase().includes(q) ||
      item.target_app.toLowerCase().includes(q)
    );
  });

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleSpeak = (id: string, text: string) => {
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.onend = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteHistory(id);
      onRefresh();
    } catch (e) {
      console.error("Failed to delete entry:", e);
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
    } catch {
      return "1:59pm";
    }
  };

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden bg-[#111114]">
      {/* Main Activity Area with guaranteed scrolling */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-9 py-6 pb-28">
        {/* Missing Permissions Banner */}
        {permissions && (!permissions.microphone || !permissions.accessibility || !permissions.input_monitoring) && (
          <div className="mb-5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs animate-in fade-in">
            <div className="flex items-center gap-2.5 text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Missing macOS permissions (
                {[
                  !permissions.microphone && "Microphone",
                  !permissions.input_monitoring && "Input Monitoring",
                  !permissions.accessibility && "Accessibility",
                ]
                  .filter(Boolean)
                  .join(", ")}
                ). Required for global hotkeys and auto-paste across apps.
              </span>
            </div>
            <button
              onClick={() => onNavigateTab("settings")}
              className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium whitespace-nowrap cursor-pointer transition-colors"
            >
              Open Permissions
            </button>
          </div>
        )}

        {/* Welcome Header */}
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div>
            <h1 className="text-[26px] font-bold text-white tracking-tight">
              Welcome back!
            </h1>
          </div>

          {/* Quick Record Action */}
          <div className="flex items-center gap-2.5">
            {dictationState === "copied" && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-medium animate-in fade-in">
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Copied to clipboard</span>
              </div>
            )}
            {dictationState === "recording" ? (
              <button
                onClick={onStopDictation}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium text-xs shadow-lg shadow-red-500/20 transition-all animate-pulse cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop & Transcribe</span>
              </button>
            ) : dictationState === "processing" ? (
              <button
                disabled
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#202026] text-neutral-300 font-medium text-xs cursor-wait"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span>Transcribing...</span>
              </button>
            ) : (
              <button
                onClick={onStartDictation}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-neutral-200 text-black font-semibold text-xs shadow transition-all cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5 text-black" />
                <span>Start Dictation</span>
              </button>
            )}
          </div>
        </div>

        {/* Date Divider & Search Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1c1c22] mb-2 shrink-0">
          <span className="text-[11px] font-semibold tracking-wider text-[#686875] uppercase">
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>

          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#6c6c78] absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search transcriptions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#141418] border border-[#22222a] rounded-full pl-8 pr-3 py-1 text-xs text-[#ededf0] placeholder-[#60606a] focus:outline-none focus:border-[#404050] transition-colors w-48"
            />
          </div>
        </div>

        {/* Chronological Dictation Activity List (Pixel-accurate Wispr Flow row styling) */}
        <div className="flex flex-col divide-y divide-[#17171d]">
          {filteredHistory.length === 0 ? (
            <div className="py-20 text-center text-[#6e6e7c]">
              <Mic className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No dictations found</p>
              <p className="text-xs text-[#525260] mt-1">
                Hold your global hotkey ({hotkeyKey ? hotkeyKey.replace(/\s*\([^)]*\)/g, "").trim() : "Right Shift"}) or click "Start Dictation" above.
              </p>
            </div>
          ) : (
            filteredHistory.map((item) => (
              <div
                key={item.id}
                className="group relative flex items-start gap-4 py-4 px-2 rounded-xl hover:bg-[#15151a]/80 transition-colors"
              >
                {/* Timestamp */}
                <div className="w-14 shrink-0 pt-0.5">
                  <span className="text-[12px] text-[#6b6b77] font-normal font-sans">
                    {formatTimestamp(item.created_at)}
                  </span>
                </div>

                {/* Target App Badge (subtle icon) */}
                <div className="shrink-0 pt-0.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#18181f] text-[10.5px] text-neutral-400">
                    <AppWindow className="w-3 h-3 text-neutral-400" />
                    <span>{item.target_app}</span>
                  </span>
                </div>

                {/* Transcribed Text matching Wispr Flow typography */}
                <div className="flex-1 pr-24">
                  <p className="text-[13.5px] leading-relaxed text-[#dedee5] select-text font-normal">
                    {item.text}
                  </p>
                </div>

                {/* Floating Action Controls on Hover matching Wispr Flow Screenshot 0 */}
                <div className="absolute right-3 top-4 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity bg-[#15151a]/95 px-2 py-1 rounded-lg border border-[#262630] shadow-sm">
                  {/* Play audio simulation */}
                  <button
                    onClick={() => handleSpeak(item.id, item.text)}
                    title="Read Aloud"
                    className={`p-1 rounded text-[#90909e] hover:text-white transition-colors cursor-pointer ${
                      speakingId === item.id ? "text-purple-400" : ""
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Copy */}
                  <button
                    onClick={() => handleCopy(item.id, item.text)}
                    title="Copy"
                    className="p-1 rounded text-[#90909e] hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(item.id)}
                    title="Delete"
                    className="p-1 rounded text-[#90909e] hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Stats Column (Wispr Flow Match - Screenshot 0) */}
      <div className="w-72 shrink-0 border-l border-[#191920] bg-[#111114] p-6 flex flex-col gap-6 min-h-0 overflow-y-auto pb-28">
        {/* Core Stats */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-[28px] font-bold text-white tracking-tight leading-none mb-1">
              {totalWords > 1000 ? `${(totalWords / 1000).toFixed(1)}K` : totalWords}
            </div>
            <div className="text-xs text-[#787886] font-normal">total words</div>
          </div>

          <div>
            <div className="text-[28px] font-bold text-white tracking-tight leading-none mb-1">
              {averageWpm}
            </div>
            <div className="text-xs text-[#787886] font-normal">wpm</div>
          </div>

          <div>
            <div className="text-[28px] font-bold text-white tracking-tight leading-none mb-1">
              {timeSavedHours} hrs
            </div>
            <div className="text-xs text-[#787886] font-normal">day streak / time saved</div>
          </div>
        </div>

        {/* Minimal API Spend Bar */}
        <button
          type="button"
          onClick={() => onNavigateTab("settings")}
          title="View API spend details in Settings"
          className="w-full p-3.5 rounded-2xl bg-[#15151a] hover:bg-[#191920] border border-[#202026] flex flex-col gap-2 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#787886] font-medium">API Spend</span>
            <span className="font-mono font-semibold text-white">
              {formattedCost}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#22222b] overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${spendFillPct}%` }}
            />
          </div>
        </button>
      </div>
    </div>
  );
};
