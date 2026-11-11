# OpenFlow 🎙️✨

An open-source **Wispr Flow** alternative for macOS powered directly by the Google Gemini API.

Just as fast, just as accurate, and **~15x cheaper** than Wispr Flow's monthly subscription — you pay pennies directly to Google per million tokens (~$0.50–$1.00/mo of heavy dictation) instead of $15+/month.

[![Download for macOS](https://img.shields.io/badge/Download-macOS%20(Apple%20Silicon)-101014?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/loganwenzel/OpenFlow/releases/latest/download/OpenFlow_0.1.0_aarch64.dmg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

---

## ⚡ Quick Install

1. **[Download OpenFlow (.dmg)](https://github.com/loganwenzel/OpenFlow/releases/latest/download/OpenFlow_0.1.0_aarch64.dmg)** *(Apple Silicon)*  
   *(Or browse releases on the [Releases page](https://github.com/loganwenzel/OpenFlow/releases))*
2. Drag **OpenFlow** into your **Applications** folder.
3. Open the app, paste your [Google Gemini API key](https://aistudio.google.com/app/apikey), and grant permissions.

---

## Why OpenFlow?

| | **Wispr Flow** | **OpenFlow** |
|---|---|---|
| **Price** | $12 – $15 / month | **~$0.50 – $1.00 / month** (direct pay-per-token via Gemini) |
| **Privacy / Control** | Closed source, third-party servers | **100% open source**, audio sends directly to your own Gemini key |
| **Model** | Fixed | Gemini 2.5 Flash, 1.5 Flash, or custom fine-tuned models |
| **Custom Vocabulary** | Limited | Dynamic dictionary prompt injection + voice snippets |

---

## Features

- **Global Push-to-Talk & Hands-Free:** Hold down to dictate (default `⌃ Control + ⇧ Shift` or `⌥ Option`), release to transcribe, or double-tap for hands-free lock.
- **Morphing HUD Pill:** Minimalist floating soundwave that smoothly morphs into an animated sine loader. Floats seamlessly over all spaces and full-screen apps.
- **Auto-Paste at Cursor:** Injects text directly into your frontmost application via native `⌘V`.
- **Custom Dictionary & Snippets:** Add industry jargon, names, or spoken shortcuts (e.g., saying `"my email"` expands to your address).
- **Smart Audio:** Auto-silence filtering, Bluetooth HFP audio handling, and media pause/resume.

---

## Build from Source

```bash
git clone https://github.com/loganwenzel/OpenFlow.git
cd OpenFlow
npm install
npm run tauri dev    # Run in development mode
npm run tauri build  # Build signed production .app & .dmg
```

---

## License

[MIT](LICENSE)
