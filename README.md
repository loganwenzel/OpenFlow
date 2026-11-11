# OpenFlow 🎙️✨
> **Native macOS AI Dictation App (Wispr Flow Clone) powered directly by Google Gemini API**

[![Download for macOS](https://img.shields.io/badge/Download-macOS%20(Apple%20Silicon)-101014?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/loganwenzel/OpenFlow/releases/latest/download/OpenFlow_0.1.0_aarch64.dmg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

OpenFlow is a lightweight, blazing-fast, open-source macOS desktop dictation application that replicates the core user experience, speed, and visual design of **Wispr Flow**, powered directly by the **Google Gemini API** (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, etc.).

---

## ⚡ Quick Download & Install

1. **[Download OpenFlow for macOS (Apple Silicon .dmg)](https://github.com/loganwenzel/OpenFlow/releases/latest/download/OpenFlow_0.1.0_aarch64.dmg)**  
   *(Or browse all versions on the [Releases page](https://github.com/loganwenzel/OpenFlow/releases))*
2. Open the downloaded `.dmg` and drag **OpenFlow** into your **Applications** folder.
3. Launch **OpenFlow**, enter your free Gemini API key, and grant Microphone & Device Control permissions.

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

## Build from Source

### Prerequisites
- macOS 12+ (Apple Silicon or Intel)
- Node.js 18+ and npm
- Rust 1.75+ (`cargo`)

### Compilation

1. Clone the repository:
   ```bash
   git clone https://github.com/loganwenzel/OpenFlow.git
   cd OpenFlow
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

4. Build production DMG & app bundle:
   ```bash
   npm run tauri build
   ```

---

## macOS Permissions Note

OpenFlow requires macOS system permissions to operate seamlessly across applications:
- **Microphone Access:** Required for capturing spoken voice audio for Gemini AI transcription.
- **Accessibility (Device Control and Data Access):** Required for global push-to-talk hotkey detection in the background and native `Cmd + V` text auto-paste at your active cursor. *(In macOS Sequoia, Apple renames Accessibility to "Device Control and Data Access" under Privacy & Security).*
- **Input Monitoring:** Allows low-level hardware chord monitoring (e.g. `⌃ Control + ⇧ Shift` or `⌥ Option`) across all active spaces.

---

## License
MIT License.
