import { useEffect, useState } from "react";
import {
  AlertCircle,
  X,
  Square,
  ClipboardCheck,
} from "lucide-react";
import { AudioWaveform } from "./AudioWaveform";
import {
  cancelDictation,
  getAppSettings,
  getDictationState,
  onAudioRms,
  onDictationStateChanged,
  onSettingsUpdated,
  playChime,
  stopDictation,
} from "../api";
import { DictationStatePayload } from "../types";

export const FloatingPill: React.FC = () => {
  const [statePayload, setStatePayload] = useState<DictationStatePayload>({
    state: "idle",
  });
  const [rms, setRms] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [themePref, setThemePref] = useState<string>("system");
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

  const isLight =
    themePref === "light" || (themePref === "system" && !systemPrefersDark);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    let unlistenState: (() => void) | undefined;
    let unlistenRms: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;

    getAppSettings()
      .then((s) => {
        if (s?.theme) setThemePref(s.theme);
      })
      .catch(() => {});

    onSettingsUpdated((s) => {
      if (s?.theme) setThemePref(s.theme);
    }).then((un) => {
      unlistenSettings = un;
    });

    getDictationState()
      .then((s) => {
        if (s === "recording" || s === "processing") {
          setStatePayload((prev) => (prev.state === "idle" ? { state: s } : prev));
        }
      })
      .catch(() => {});

    onDictationStateChanged((payload) => {
      setStatePayload(payload);
      if (payload.state === "recording") {
        setIsHovered(false);
        playChime("start");
      } else if (
        (payload.state === "idle" || payload.state === "copied") &&
        payload.last_text
      ) {
        playChime("success");
      } else if (payload.state === "error") {
        playChime("error");
      }
    }).then((un) => {
      unlistenState = un;
    });

    onAudioRms((val) => {
      setRms(val);
    }).then((un) => {
      unlistenRms = un;
    });

    return () => {
      unlistenState?.();
      unlistenRms?.();
      unlistenSettings?.();
    };
  }, []);

  // Auto-dismiss timer for "copied" bubble (pauses while user hovers/scrolls)
  useEffect(() => {
    if (statePayload.state !== "copied" || isHovered) return;
    const timeout = setTimeout(() => {
      cancelDictation();
    }, 3200);
    return () => clearTimeout(timeout);
  }, [statePayload.state, isHovered]);

  const currentState = statePayload.state;
  const isHandsFree = Boolean(statePayload.is_hands_free);

  // Don't render anything when idle to avoid any residual visual flash
  if (currentState === "idle") {
    return null;
  }

  const widthClass =
    currentState === "copied"
      ? "w-auto min-w-[200px] max-w-[440px] px-3.5 py-2.5"
      : currentState === "error"
      ? "w-auto min-w-[170px] max-w-[320px] px-3.5 py-1.5"
      : "w-fit px-3.5 py-1.5";

  return (
    <div className="w-full h-full flex items-end justify-center pb-2 px-2 bg-transparent select-none overflow-hidden">
      {/* HUD Bubble Container */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          if (currentState === "recording") {
            stopDictation();
          }
        }}
        className={`animate-pill-enter relative ${widthClass} rounded-[20px] transition-[width,max-width,padding,background-color,border-color,box-shadow,transform] duration-250 ease-out shadow-2xl backdrop-blur-2xl border ${
          currentState === "copied" ? "cursor-default" : "cursor-pointer"
        } ${
          currentState === "error"
            ? isLight
              ? "bg-red-50/95 border-red-400/50 shadow-red-900/10"
              : "bg-[#180f12]/95 border-red-500/40 shadow-red-950/40"
            : isLight
            ? currentState === "recording"
              ? "bg-white/95 border-purple-500/50 shadow-black/15"
              : "bg-white/95 border-zinc-300/90 shadow-black/15"
            : currentState === "recording"
            ? "bg-[#101014]/95 border-purple-500/40 shadow-purple-950/40"
            : "bg-[#101014]/95 border-white/15 shadow-black/50"
        }`}
      >
        {/* State 1 & 2: RECORDING & PROCESSING */}
        {(currentState === "recording" || currentState === "processing") && (
          <div className="flex items-center gap-2.5 h-6">
            {/* Morphing Speaking -> Loading Waveform (Constant Width) */}
            <AudioWaveform
              rms={rms}
              state={currentState}
              barCount={9}
              barColor={
                currentState === "processing"
                  ? isLight
                    ? "bg-purple-600"
                    : "bg-purple-400"
                  : isLight
                  ? "bg-zinc-900"
                  : "bg-white"
              }
            />

            {/* Square stop button (only in double-click hands-free mode while recording) */}
            {currentState === "recording" && isHandsFree && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  stopDictation();
                }}
                title="Stop & Transcribe"
                className={`w-4 h-4 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 ${
                  isLight
                    ? "bg-zinc-900 text-white hover:bg-zinc-700"
                    : "bg-white text-black hover:bg-neutral-200"
                }`}
              >
                <Square
                  className={`w-1.5 h-1.5 ${
                    isLight ? "fill-white text-white" : "fill-black text-black"
                  }`}
                />
              </button>
            )}
          </div>
        )}

        {/* Expandable Recorded Text Area for "copied" state */}
        {currentState === "copied" && statePayload.last_text && (
          <div className="max-h-[110px] overflow-y-auto pb-2 pr-1 text-[12.5px] leading-relaxed break-words select-text border-b mb-1.5 border-white/10 animate-in fade-in duration-200">
            <span
              className={isLight ? "text-zinc-800" : "text-neutral-100"}
            >
              {statePayload.last_text}
            </span>
          </div>
        )}

        {/* State 3: SAVED TO CLIPBOARD Footer */}
        {currentState === "copied" && (
          <div className="flex items-center justify-center w-full gap-1.5 py-0.5 animate-in fade-in duration-200">
            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span
              className={`text-[11.5px] font-medium ${
                isLight ? "text-zinc-700" : "text-neutral-200"
              }`}
            >
              {statePayload.message || "Saved to clipboard"}
            </span>
          </div>
        )}

        {/* State 4: ERROR */}
        {currentState === "error" && (
          <div className="flex items-center justify-between w-full py-0.5 gap-2">
            <div className="flex items-center gap-1.5 truncate">
              <AlertCircle
                className={`w-3.5 h-3.5 shrink-0 ${
                  isLight ? "text-red-500" : "text-red-400"
                }`}
              />
              <span
                className={`text-xs truncate ${
                  isLight ? "text-red-700" : "text-red-200"
                }`}
              >
                {statePayload.message || "Error"}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cancelDictation();
              }}
              className={`p-1 cursor-pointer shrink-0 ${
                isLight
                  ? "text-zinc-500 hover:text-zinc-800"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
