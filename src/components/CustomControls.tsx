import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  badge?: string;
  description?: string;
}

interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  size?: "md" | "lg";
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  className = "",
  placeholder = "Select an option...",
  size = "lg",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Gracefully fallback to current value instead of showing generic placeholder if value exists
  const displayLabel = selectedOption
    ? selectedOption.label
    : value && value !== "default"
    ? value
    : value === "default"
    ? "Default macOS System Microphone"
    : placeholder;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-3 rounded-xl bg-[#161622] hover:bg-[#1a1a28] border transition-all text-left cursor-pointer ${
          isOpen
            ? "border-purple-500/60 ring-2 ring-purple-500/15 shadow-lg shadow-purple-950/20"
            : "border-[#2b2b3a] hover:border-[#3c3c4e]"
        } ${size === "lg" ? "px-4 py-3" : "px-3.5 py-2"}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium text-white truncate ${size === "lg" ? "text-sm" : "text-xs"}`}>
              {displayLabel}
            </span>
            {selectedOption?.badge && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-300 shrink-0">
                {selectedOption.badge}
              </span>
            )}
          </div>
          {selectedOption?.description && size === "lg" && (
            <p className="text-[11px] text-[#78788a] truncate mt-0.5">
              {selectedOption.description}
            </p>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-[#8a8a9e] transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-purple-400" : ""
          }`}
        />
      </button>

      {/* Dropdown Popup */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 max-h-72 overflow-y-auto rounded-2xl bg-[#151520] border border-[#2d2d3e] shadow-2xl p-1.5 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex flex-col gap-1">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? "bg-purple-600/15 border border-purple-500/30 text-white font-medium"
                      : "text-[#d1d1de] hover:bg-[#20202d] hover:text-white"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-[13px] truncate">
                        {option.label}
                      </span>
                      {option.badge && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-medium bg-purple-500/20 text-purple-300 shrink-0">
                          {option.badge}
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <p className="text-[11px] text-[#707082] truncate mt-0.5">
                        {option.description}
                      </p>
                    )}
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 ${
        checked ? "bg-purple-600" : "bg-[#272736]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
};
