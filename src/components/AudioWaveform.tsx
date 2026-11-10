import React, { useEffect, useRef, useState } from "react";

interface AudioWaveformProps {
  rms: number; // 0.0 to 1.0
  isRecording: boolean;
  barCount?: number;
  barColor?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  rms,
  isRecording,
  barCount = 14,
  barColor = "bg-white",
}) => {
  const rmsRef = useRef(rms);
  const smoothedRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    rmsRef.current = isRecording ? rms : 0;
  }, [rms, isRecording]);

  useEffect(() => {
    if (!isRecording) {
      smoothedRef.current = 0;
      setTick((t) => t + 1);
      return;
    }

    let rafId: number;
    const animate = () => {
      const target = rmsRef.current;
      // Fast attack, smooth decay
      const factor = target > smoothedRef.current ? 0.45 : 0.18;
      smoothedRef.current = smoothedRef.current + (target - smoothedRef.current) * factor;
      setTick((t) => (t + 1) % 10000);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isRecording]);

  const now = performance.now() * 0.008;
  const level = smoothedRef.current;

  return (
    <div className="flex items-center justify-center gap-[3px] h-6 px-1" data-tick={tick}>
      {Array.from({ length: barCount }).map((_, index) => {
        const centerOffset = Math.abs(index - (barCount - 1) / 2) / (barCount / 2);
        const envelope = Math.max(0.25, Math.cos(centerOffset * (Math.PI * 0.45)));

        // Organic travelling wave when voice is present
        const wave =
          0.65 +
          0.35 * Math.sin(index * 1.15 - now) * Math.cos(index * 0.7 + now * 0.6);

        const activeHeight = isRecording ? level * envelope * wave : 0;
        const heightPx = Math.max(3, Math.min(22, Math.round(3 + activeHeight * 21)));
        const opacity = isRecording ? Math.min(1, 0.35 + activeHeight * 0.85) : 0.25;

        return (
          <div
            key={index}
            className={`w-[2.5px] rounded-full ${barColor}`}
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
