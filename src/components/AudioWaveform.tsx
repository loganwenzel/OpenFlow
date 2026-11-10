import React, { useEffect, useRef, useState } from "react";

interface AudioWaveformProps {
  rms: number; // 0.0 to 1.0
  isRecording?: boolean;
  isProcessing?: boolean;
  state?: "idle" | "recording" | "processing" | "copied" | "error" | string;
  barCount?: number;
  barColor?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  rms,
  isRecording,
  isProcessing,
  state,
  barCount = 9,
  barColor = "bg-white",
}) => {
  const recording = Boolean(isRecording ?? state === "recording");
  const processing = Boolean(isProcessing ?? state === "processing");
  const active = recording || processing;

  const rmsRef = useRef(rms);
  const smoothedRef = useRef(0);
  const blendRef = useRef(processing ? 1 : 0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    rmsRef.current = recording ? rms : 0;
  }, [rms, recording]);

  useEffect(() => {
    if (!active) {
      smoothedRef.current = 0;
      blendRef.current = 0;
      setTick((t) => t + 1);
      return;
    }

    let rafId: number;
    const animate = () => {
      // 1. Smooth voice RMS tracking during recording
      const targetRms = recording ? rmsRef.current : 0;
      const factor = targetRms > smoothedRef.current ? 0.45 : 0.18;
      smoothedRef.current = smoothedRef.current + (targetRms - smoothedRef.current) * factor;

      // 2. Smooth blend factor between recording (0) and processing (1)
      const targetBlend = processing ? 1 : 0;
      blendRef.current = blendRef.current + (targetBlend - blendRef.current) * 0.12;

      setTick((t) => (t + 1) % 100000);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [active, recording, processing]);

  const now = performance.now() * 0.006;
  const level = smoothedRef.current;
  const blend = blendRef.current;

  return (
    <div className="flex items-center justify-center gap-[2.5px] h-6 shrink-0" data-tick={tick}>
      {Array.from({ length: barCount }).map((_, index) => {
        const centerOffset = Math.abs(index - (barCount - 1) / 2) / (barCount / 2);

        // State A: Voice-responsive Organic Wave (Speaking indicator)
        const recEnvelope = Math.max(0.25, Math.cos(centerOffset * (Math.PI * 0.45)));
        const recWave =
          0.65 +
          0.35 * Math.sin(index * 1.15 - now * 1.3) * Math.cos(index * 0.7 + now * 0.8);
        const recActiveHeight = level * recEnvelope * recWave;
        const recHeight = Math.max(3.5, Math.min(22, 3.5 + recActiveHeight * 20.5));
        const recOpacity = Math.min(1, 0.4 + recActiveHeight * 0.85);

        // State B: Fluid Traveling Sine Wave Loader (Processing / Thinking indicator)
        const procPhase = now * 1.7 - index * 0.52;
        const procWave = (Math.sin(procPhase) + 1) / 2; // 0.0 to 1.0 smooth cycle
        const procEnvelope = 0.75 + 0.25 * (1 - centerOffset * 0.6);
        const procHeight = 4 + procWave * 14 * procEnvelope;
        const procOpacity = 0.35 + procWave * 0.6;

        // Smooth cross-fade between speaking wave and loading wave
        const heightPx = Math.round((1 - blend) * recHeight + blend * procHeight);
        const opacity = (1 - blend) * recOpacity + blend * procOpacity;

        return (
          <div
            key={index}
            className={`w-[2.5px] shrink-0 rounded-full transition-colors duration-300 ${barColor}`}
            style={{
              height: `${heightPx}px`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
};
