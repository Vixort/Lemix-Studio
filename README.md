# Lemix Studio

**Lemix Studio** is an offline desktop music and remix studio built with **Electron, TypeScript and Vite**. It uses the Web Audio API for real audio processing, so you can compose beats and melodies, cut and arrange audio clips, repair noisy recordings and strip vocals from songs with local AI models — all without an account and without uploading your audio anywhere.

> Download the latest Windows portable build from the [Releases](https://github.com/Vixort/Lemix-Studio/releases) page. No installation is required; just run `Lemix-Studio-<version>.exe`. The executable is not code-signed yet, so Windows SmartScreen may show a warning.

## Features

- **Arrangement:** up to 24 layers and 512 clips. Place several files on one layer, drag clips across layers, split with the Razor tool, trim both edges, and duplicate or delete non-destructively. Includes waveforms, toggleable snap, seek, zoom and loop.
- **Beat making:** a 16-step drum machine with kick, snare, hi-hat and clap.
- **Sound Library:** 9 instruments — Drum machine, Analog bass, Electric keys, Ambient pad, Studio piano, Nylon guitar, Wood marimba, Drawbar organ and Synth lead — with search and a scrollable list.
- **Melody writing:** a note grid for bass, keys and the five newer instruments, showing the octave that actually plays. The pad builds ambient chords. Patterns repeat every bar and the progression changes every 2 bars.
- **Audio import:** pick or drag in WAV, MP3, OGG, FLAC or any format Chromium supports (up to 108 MB and 10 minutes per file).
- **AI Vocal Remover:** choose MDX-Net, BS-RoFormer ViperX (uint8/FP32), Mel-Band RoFormer FP32 or a local Ensemble, with a 4 s or 8 s context window. Save the instrumental as WAV or add it as a new layer to keep remixing. Progress and cancel are supported. Shortcuts open the MVSEP website for its 124-band and Ensemble models without uploading anything from the app.
- **Audio Repair:** drag Noise Reduction, Click / Pop Repair or Clean Audio onto a clip to reduce hiss and fix short clicks. Adjust strength, A/B with Bypass, and undo. Applied both during playback and WAV export.
- **Clip tools:** per-clip gain and mute, reverse, playback speed 0.5–2× (changes pitch too), and effects independent of the layer mixer.
- **Mixing:** volume, stereo pan, mute/solo and a master mixer for all tracks.
- **Tone shaping:** 3-band EQ, low-pass filter, drive, compressor, convolution room reverb and dotted delay, plus a master limiter.
- **Project management:** rename tracks, duplicate/delete, 24-step undo/redo and a warning before closing unsaved work.
- **`.lemix` projects:** settings, patterns and imported audio are stored in a single project file (up to 300 MB total, timeline up to about 10 minutes).
- **WAV export:** stereo 16-bit PCM / 44.1 kHz with a 2-second effect tail, rendered through the same effect chain used for live playback.

## Getting started (from source)

Requires Node.js **22.18+ or 24+** and npm. The first install needs internet access to download dependencies and the Electron runtime.

```powershell
npm.cmd ci
npm.cmd run dev
```

On PowerShell, `npm.cmd` works even when running `npm.ps1` is blocked. On macOS/Linux use `npm` as usual.

Run a production build:

```powershell
npm.cmd run build
npm.cmd start
```

Build the Windows portable app:

```powershell
npm.cmd run dist
```

The output is `release/Lemix-Studio-<version>.exe`. The first packaging run may download extra electron-builder tooling.

## Quick tour

1. Open the app and press **Space** to hear the "Midnight in motion" demo.
2. Select the drum track and change steps in the Pattern editor, or add an instrument from the Sound Library.
3. Pick bass, keys, piano, guitar, marimba, organ or lead and click note cells to write a melody — or use **Import** to bring in your own song to remix.
4. Drag clips on the timeline to arrange them, then shape the sound with EQ / filter / effects in the channel strip on the right.
5. Open the Mixer to balance the level and stereo position of each track.
6. Press **Ctrl+S** to save the project and **Export WAV** when you are happy with the sound.

| Shortcut | Action |
| --- | --- |
| Space | Play / pause |
| V | Select tool (drag clips) |
| C | Razor tool (click a clip to cut it there) |
| S | Split the selected clip at the playhead |
| Ctrl / ⌘ + D | Duplicate clip |
| Delete / Backspace | Delete the selected clip only |
| Ctrl / ⌘ + S | Save project |
| Ctrl / ⌘ + O | Open project |
| Ctrl / ⌘ + Z | Undo |
| Ctrl / ⌘ + Shift + Z or Ctrl+Y | Redo |

Space and Undo never steal keystrokes from text inputs. When a button has focus, Space activates that button as usual.

## Multi-layer clip editing

1. Click **Add layer** to create an empty layer, or import a file from the sidebar to create a layer with a clip.
2. Drop an audio file at a position on a layer to insert it there, or select a layer and click **Add audio** to insert at the playhead.
3. With **Select (V)**, drag clips left/right or across layers. Moving audio past the end of the timeline extends it within the limits.
4. With **Razor (C)**, click where you want to cut, or place the playhead and press **Split (S)**. Both halves reference the same source audio.
5. Drag a clip's left/right edge to trim, and drag back to restore hidden audio. Turn off **SNAP** for cuts finer than ¼ beat.
6. Select a clip and use **Clip effects** to change gain, mute, EQ, filter, drive, compressor, reverb or delay for that clip only. The **Layer mixer** affects every clip on the layer.
7. **Ctrl+D** duplicates a clip and **Delete** removes it. Undo/Redo covers cuts, moves, trims and effects.

Overlapping clips on the same layer are drawn as stacked rows and mixed together. Split and duplicated clips share the original source, so the project does not store extra copies of the audio. Drum/note patterns are shared sources too: editing notes affects every clip that references that pattern, while per-clip effects and gain stay independent.

Older `.lemix` v1/v2 files are opened and upgraded to v3 automatically, preserving audio, timing, reverse/speed and effects. Files saved by the current version need **0.5 or later** to keep Audio Repair settings, so keep a copy of the old file if you still use an older release.

## Noise and click repair

1. Open the **Audio FX** tab on the left and choose **Noise Reduction**, **Click / Pop Repair** or **Clean Audio** (both combined).
2. Drag the effect card onto a clip. The clip shows a green outline while dragging and a **REPAIR** badge afterwards. You can also select a clip and click the card (keyboard accessible).
3. Adjust **Clip effects → Audio Repair** on the right:
   - **Noise reduction:** how strongly to reduce hiss and low-level background noise. Start around 30–65% and compare.
   - **Noise floor:** the level used to separate background noise, starting at −42 dB. Less negative values filter more but may also thin quiet parts and tails.
   - **Click / pop repair:** how strongly to repair short glitches, detected from waveform changes and replaced with an estimated signal.
4. Use **Bypass / A–B** to compare with the original. The trash button removes only the repair; Undo/Redo covers adding, removing and adjusting it.
5. Play or Export WAV to process the audio. Settings are saved in the project, and split/duplicated clips can be tuned separately.

Processing runs locally in a Web Worker and needs no model download. Mono and stereo are supported, and preparation can be cancelled with Stop. Source files and embedded audio are never overwritten, and the timeline waveform still shows the original.

Noise Reduction uses spectral attenuation based on the chosen noise floor; it does not learn a noise profile automatically. Click / Pop Repair targets glitches shorter than about 3 ms, so it may not fully fix long crackle, wind, overlapping speech or heavy clipping. Over-filtering can remove musical detail — always compare with Bypass. See the [Audacity Noise Removal & Repair manual](https://www.audacityteam.org/manual/effects/noise-removal-and-repair/) for background on each kind of problem.

## Instruments added in 0.4

| Instrument | Character |
| --- | --- |
| Studio piano | Clear piano keys with a natural decay |
| Nylon guitar | Soft, warm plucks in a lower register than the piano |
| Wood marimba | Short, bright wooden strikes |
| Drawbar organ | Sustained organ tone with layered harmonics |
| Synth lead | Bright, sharp lead synth |

Click an instrument in the **Sound Library** to add a layer with a starter pattern, then edit notes in the **Pattern editor** and adjust Clip effects / Layer mixer as usual. The search box and scroll position are kept when you add sounds or edit the project.

All five are synthesized in the app and work offline with no plugins or sample downloads — they are not recordings of real instruments.

## AI vocal removal

1. Import a song and select its track.
2. Click **Vocal Remover** in the sidebar or **Remove vocals** in the editor.
3. Pick a **Separation model** from the **Local** group and click **Remove vocals**. Only the selected model is downloaded, and its SHA-256 is verified before use. Internet is needed the first time each model is used (see sizes below).
4. Watch the progress bar. Press **Cancel separation** or Escape to stop at any time without touching the original.
5. Choose **Save WAV** to save the full instrumental, or **Add instrumental track** to add a new layer and clip. Only the selected source clip is muted, keeping its offset, trim, length, speed, reverse, gain and effects; other clips on that layer are untouched. Undo restores the previous mix.

Separation uses the full source audio before clip tools and effects. To include effects and other tracks, use the studio's Export WAV instead.

Models are stored in `models/` inside the app's userData folder and work offline once downloaded. Inference runs in an Electron utility process on the CPU and **never uploads your music**. No Python or API key is needed. Mono/stereo songs up to 10 minutes are supported; separation can take several minutes and use a lot of RAM depending on song length.

MDX-Net is limited to 30 minutes per job. RoFormer timeouts scale with song length, context and ensemble size to accommodate slow CPUs — a full song may take hours. Start with a short file; Cancel stops without changing the original.

Separation works on the sound itself, so no language setting is needed. Results depend on the song: some vocals or backing vocals may remain, or some instruments may be affected. Try a short section and compare by ear. There is no measurement yet proving which model is best for every song.

| Local option | Approx. first download | Notes |
| --- | ---: | --- |
| MDX-Net Inst HQ 3 | 67 MB | Original engine, lightest on resources |
| BS-RoFormer ViperX uint8 | 166 MB | Default, smaller thanks to quantization |
| BS-RoFormer ViperX FP32 | 645 MB | Full-precision weights, separate graph and weight files |
| Mel-Band RoFormer Kimberley Jensen FP32 | 931 MB | A different architecture to compare |
| Ensemble · ViperX FP32 + Mel-Band FP32 | 1,576 MB | Reuses the two models above, no extra copies |

**Audio context** for RoFormer: 4 seconds limits RAM, 8 seconds matches the model's original context. Longer context may help some songs but uses a great deal of RAM, especially on 16 GB machines with other apps open. FP32 refers to weight precision and is not guaranteed to sound better on every song; the 4-second variant may lose some detail compared with full context. All options use 50% overlap and subtract the estimated vocals from the original.

The Lemix Ensemble runs ViperX FP32 then Mel-Band FP32 sequentially to bound RAM, then averages the instrumentals 50/50 sample-for-sample. It is not MVSEP's BS/Mel/SCNet ensemble and is not guaranteed to beat a single model.

The **MVSEP · opens website** group lists **BS-RoFormer 124 bands** and **MVSEP Ensemble**. **Open MVSEP website** only opens a fixed web page — it sends no files, asks for no API key and does no server processing from Lemix. Uploading is up to you on their site, under MVSEP's own account terms and pricing. These options are not models that run in the app.

Model sources: both ViperX variants come from the [ONNX conversion by xycld](https://huggingface.co/xycld/BS-RoFormer-ONNX) at a pinned revision; Mel-Band uses the [FP32 ONNX export by santiquiroz](https://github.com/santiquiroz/port-bs-roformer-onnx/releases/tag/models-v1.0) of the [Kimberley Jensen checkpoint](https://github.com/KimberleyJensen/Mel-Band-Roformer-Vocal-Model); MDX-Net uses the [original UVR model](https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models) and [UVR FFT/gain data](https://github.com/TRvlvr/application_data/blob/main/mdx_model_data/model_data.json).

Inference uses [ONNX Runtime](https://github.com/microsoft/onnxruntime/tree/main/js/node). The compressed graphs in `electron-assets/` reference weights from the downloaded, hash-verified files, so large weights are not bundled in the installer. Interrupted downloads resume via HTTP Range up to 5 times, and both size and hash are checked before the destination file is replaced. Graphs can be regenerated with `python scripts/prepare-roformer.py path/to/verified-model.onnx` (append `8` for the 8-second ViperX FP32 graph); this needs `onnx` installed in your development environment only. The STFT and mask conversion follow [MSS_ONNX_TensorRT](https://github.com/ZFTurbo/MSS_ONNX_TensorRT/blob/main/models/preprocess.py) and the Mel-Band export driver.

## Testing

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run test:electron
```

Unit tests cover legacy project migration, source/clip references, split/trim/move, independent clip FX, overlapping clip rows, mute/solo, WAV encoding, synthesis, audio repair DSP, STFT/mask processing and resumable model downloads. The Electron smoke test drives the real UI — cutting clips, moving across layers, trimming both edges, duplicating/deleting, undo, per-clip gain/FX, all nine instruments and drag-on repair — then checks the exported WAV PCM against the timeline. Results and screenshots are written to `artifacts/` (not committed). These tests measure signals in software; they do not verify playback on every speaker or audio device.

After `npm.cmd run dist`, rerun the tests against the packaged `app.asar` with `node scripts/test-electron.mjs --packaged`.

Test vocal separation with real models:

```powershell
npm.cmd run build
node scripts/test-electron.mjs --separation
node scripts/test-electron.mjs --packaged --separation
node scripts/test-electron.mjs --roformer
node scripts/test-electron.mjs --packaged --roformer
```

The first run downloads models into `artifacts/test-profile/models/`. Add `--speech` to download a speech sample from [PyTorch / VOiCES](https://github.com/pytorch/audio/blob/main/examples/tutorials/audio_feature_augmentation_tutorial.py) (CC BY 4.0, Lab41 / SRI) and measure voice reduction across several processing windows. Add `--song "C:\path\song.mp3"` to try a local file with ViperX uint8; the output is written to `artifacts/sample-instrumental-bs-roformer.wav`. This verifies the workflow and file integrity, not a quality score.

## Project structure

```text
electron/                 Main process, native save dialogs and a narrowly scoped preload bridge
electron/separation*.ts   Model download, worker and STFT for the AI Vocal Remover
electron/roformer-dsp.ts  STFT, complex mask, overlap-add and vocal subtraction for BS-RoFormer
electron/model-download.ts  Resumable, hash-verified model downloads
electron-assets/          Compressed BS-RoFormer graphs; model weights are downloaded separately
src/model.ts              Data types, validation, project defaults and WAV encoder
src/timeline.ts           Clip ranges, split/trim/move and overlapping clip rows
src/synthesis.ts          PCM synthesis for all 9 instruments
src/cleanup*.ts           Noise/click repair DSP and its worker
src/audio.ts              Web Audio graph, transport and offline rendering
src/main.ts               UI, composition tools and undo/redo history
src/style.css             Studio theme, layout and accessibility states
tests/                    Unit tests
scripts/                  Dev launcher and real Electron tests
```

The renderer runs with `contextIsolation` and sandbox enabled, Node integration and remote navigation disabled, a Content Security Policy, and IPC input validation, following the [Electron security guidelines](https://www.electronjs.org/docs/latest/tutorial/security/).

## Limitations

There is no automatic crossfade, automation, VST/AU plugin support, microphone recording, MIDI hardware, pitch-preserving time-stretch, or multi-stem separation (drums/bass/guitar) yet. There is also no autosave, so save your project regularly.

## Version history

| Version | Highlights |
| --- | --- |
| 0.7.0 | Selectable vocal model library: full-precision BS-RoFormer and Mel-Band RoFormer, local Ensemble, MVSEP shortcuts, resumable verified downloads |
| 0.6.0 | Local BS-RoFormer model with bounded-memory inference |
| 0.5.0 | Drag-on noise reduction and click/pop repair |
| 0.4.0 | Five new synthesized instruments (piano, guitar, marimba, organ, lead) |
| 0.3.0 | Multi-clip layers and non-destructive clip editing |
| 0.2.0 | AI vocal remover (MDX-Net) integrated into the studio |
| 0.1.0 | First release: multitrack synthesis, pattern editor, mixer, effects and WAV export |

## License

[MIT](LICENSE) © 2026 Phattrawut Nachirit
