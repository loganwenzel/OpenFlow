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
  const [seconds, setSeconds] = useState<number>(0);
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
        setSeconds(0);
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

  // Timer while recording
  useEffect(() => {
    let timer: any;
    if (statePayload.state === "recording") {
      timer = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else if (statePayload.state === "idle" || statePayload.state === "copied") {
      setSeconds(0);
    }
    return () => clearInterval(timer);
  }, [statePayload.state]);

  // Auto-dismiss timer for "copied" bubble (pauses while user hovers/scrolls)
  useEffect(() => {
    if (statePayload.state !== "copied" || isHovered) return;
    const timeout = setTimeout(() => {
      cancelDictation();
    }, 3200);
    return () => clearTimeout(timeout);
  }, [statePayload.state, isHovered]);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? "0" : ""}${s}`;
  };

  const currentState = statePayload.state;

  // Don't render anything when idle to avoid any residual visual flash
  if (currentState === "idle") {
    return null;
  }

  return (
    <div className="w-full h-full flex items-end justify-center pb-2 px-1 bg-transparent select-none overflow-hidden">
      {/* HUD Bubble Container (Fixed 310px width & constant 20px radius across all states so corners never snap) */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          if (currentState === "recording") {
            stopDictation();
          }
        }}
        className={`relative w-[310px] rounded-[20px] px-3.5 py-2 transition-[background-color,border-color,box-shadow] duration-200 shadow-2xl backdrop-blur-2xl border ${
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
        {/* State 1 & 2: RECORDING & PROCESSING (same bar width & structure) */}
        {(currentState === "recording" || currentState === "processing") && (
          <div className="flex items-center justify-between w-full gap-2">
            {/* Recording indicator dot & App Name */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                {currentState === "recording" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 transition-colors duration-200 ${
                    currentState === "recording" ? "bg-red-500" : "bg-neutral-400"
                  }`}
                />
              </span>

              <span
                className={`text-[11px] font-medium truncate max-w-[75px] ${
                  isLight ? "text-zinc-700" : "text-neutral-300"
                }`}
              >
                {statePayload.target_app || "Active App"}
              </span>
            </div>

            {/* Audio Waveform */}
            <div className="flex-1 flex justify-center px-1 min-w-[75px]">
              <AudioWaveform
                rms={rms}
                isRecording={currentState === "recording"}
                barCount={14}
                barColor={isLight ? "bg-zinc-900" : "bg-white"}
              />
            </div>

            {/* Timer & Right-Hand Control (Stop button -> Loading Spinner) */}
            <div
              className="flex items-center gap-2 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                className={`text-[11px] font-mono ${
                  isLight ? "text-zinc-500" : "text-neutral-400"
                }`}
              >
                {formatTimer(seconds)}
              </span>

              <div className="w-5 h-5 flex items-center justify-center">
                {currentState === "recording" ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      stopDictation();
                    }}
                    title="Stop & Transcribe"
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors cursor-pointer shadow-sm ${
                      isLight
                        ? "bg-zinc-900 text-white hover:bg-zinc-700"
                        : "bg-white text-black hover:bg-neutral-200"
                    }`}
                  >
                    <Square
                      className={`w-2.5 h-2.5 ${
                        isLight ? "fill-white text-white" : "fill-black text-black"
                      }`}
                    />
                  </button>
                ) : (
                  <svg
                    className={`w-4 h-4 animate-spin ${
                      isLight ? "text-zinc-800" : "text-white/90"
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeOpacity="0.2"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M21 12a9 9 0 0 0-9-9"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Expandable Recorded Text Area (animates smoothly from 0fr -> 1fr when entering "copied") */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-250 ease-out ${
            currentState === "copied" && statePayload.last_text
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden">
            <div
              className={`max-h-[110px] overflow-y-auto pb-2 pr-1 text-[12.5px] leading-[18.5px] break-words select-text border-b mb-1.5 ${
                isLight
                  ? "text-zinc-800 border-zinc-200/80"
                  : "text-neutral-100 border-white/10"
              }`}
            >
              {statePayload.last_text}
            </div>
          </div>
        </div>

        {/* State 3: SAVED TO CLIPBOARD Footer */}
        {currentState === "copied" && (
          <div className="flex items-center justify-center w-full gap-1.5 py-0.5">
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
          <div className="flex items-center justify-between w-full py-0.5">
            <div className="flex items-center gap-2 truncate">
              <AlertCircle
                className={`w-4 h-4 shrink-0 ${
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
              className={`p-1 cursor-pointer ${
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
