# OpenFlow 🎙️✨
> **Native macOS AI Dictation App (Wispr Flow Clone) powered directly by Google Gemini API**

OpenFlow is a lightweight, blazing-fast, open-source macOS desktop dictation application that replicates the core user experience, speed, and visual design of **Wispr Flow**, powered directly by the **Google Gemini API** (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, etc.).

---

## Features

### 1. Home / Dictation Activity Feed
- **Summary Metrics:** Total words dictated, average WPM, and estimated time saved.
- **Chronological Activity Log:** Real-time stream of transcriptions with active application tags (`Slack`, `VS Code`, `Cursor`, `Mail`, `Chrome`), audio duration, quick "Copy to Clipboard", read-aloud playback, and auto-paste into active apps.
- **Unlimited Usage:** Zero paywalls, zero rate limits — connected directly to your Gemini API key.

### 2. Dictionary (Custom Vocabulary & Corrections)
- Add personal terms, company jargon, acronyms, or uncommon names (`Supabase`, `nibl`, `Supabase`, `PostHog`).
- Supports both single terms and `Misspelling -> Formatted Correction` pairs (e.g. `btw → by the way`).
- **Dynamic Prompt Injection:** Dictionary entries are dynamically injected into the Gemini system instruction on every dictation so the model spells them with 100% accuracy.

### 3. Snippets (Voice Shortcuts & Text Expansion)
- Spoken trigger phrases automatically expand into full text blocks or URLs.
- Examples:
  - Spoken `"my email"` ➔ Expands to `"alex@example.com"`
  - Spoken `"calendar link"` ➔ Expands to `"https://cal.com/alex/30min"`
  - Spoken `"organize thoughts prompt"` ➔ Expands to structured writing prompt
- Works seamlessly in-sentence and handles deterministic post-processing fallbacks.

### 4. Settings & Permissions
- **Gemini API Key:** Securely stored in local SQLite database with live connection test.
- **Model Selector:** Default `gemini-3.5-flash-lite` (fastest & most affordable), with `gemini-3.8-flash` and custom model ID support.
- **Hotkey Configuration:**
  - **Push-to-Talk:** Hold down key (default `Right Option ⌥`) to record, release to transcribe & auto-paste.
  - **Hands-Free Toggle:** Press once to start, press again to finish.
  - Configurable keys: `Right Option (⌥)`, `Left Option (⌥)`, `Fn`, `Right Control`, `F8`.
- **Microphone Input Selector:** Choose from any active macOS audio input device with 16kHz mono in-memory capture.
- **macOS Permissions Panel:** Live status checks and one-click quick-open buttons for **Microphone** and **Accessibility** permissions.

### 5. Floating Dictation Pill (HUD Overlay)
- Transparent, borderless, always-on-top floating pill positioned at the bottom-center of your screen.
- **Idle State:** Minimal discreet bar (`⌥ Hold`).
- **Recording State:** Real-time multi-bar sound wave reactive to microphone RMS volume, recording timer, and active app badge.
- **Processing State:** Sleek pulse shimmer animation while Gemini processes the audio.
- **Text Auto-Paste:** Synthesizes native macOS `Cmd + V` keystroke into your frontmost application and restores previous clipboard contents after 180ms.

---

## Tech Stack & Architecture

- **Backend:** Rust + Tauri v2
  - `cpal` + `hound`: 16kHz 16-bit Mono PCM audio capture with dedicated audio thread
  - `rusqlite`: Bundled SQLite database in `~/Library/Application Support/com.openflow.app/`
  - `rdev` / CoreGraphics: Global key listener & native event synthesis (`Cmd + V`)
  - `cocoa` / Objective-C: Frontmost app detection (`NSWorkspace.sharedWorkspace.frontmostApplication`)
  - `reqwest`: Asynchronous REST client for Google Generative Language API
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide Icons
  - Newsreader & Instrument Serif display typography matching Wispr Flow's visual hierarchy
  - Web Audio API synthetic feedback chimes

---

## Getting Started

### Prerequisites
- macOS (Apple Silicon or Intel)
- Node.js 18+ and npm
- Rust 1.75+ (`cargo`)

### Installation & Run

1. Clone or open the repository:
   ```bash
   cd /Users/logan/repos/openflow
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

4. Build release binary:
   ```bash
   npm run tauri build
   ```

---

## macOS Permissions Note

- **Microphone Permission:** Required for recording your voice. Prompted on first launch or accessible via *System Settings > Privacy & Security > Microphone*.
- **Accessibility Permission:** Required for global hotkey detection in the background and native `Cmd + V` text auto-paste. Accessible via *System Settings > Privacy & Security > Accessibility*.

---

## License
MIT License.
