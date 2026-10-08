# Prototype validation

Validated on 2026-10-08 using Node.js 24 and desktop Chromium. This is an original prototype inspired by terrain-and-water puzzle games, not a complete recreation of Wetrix.

- **Simulation:** 9 passing Node tests covering conservation (including overflow), nonnegative depth, a bank breach, rain volume, evaporation/scoring, placement atomicity, shape rotations, deterministic queue/save restoration, malformed saves, clocks, game over, and terrain limits.
- **Interactive browser:** 27 passing checks covering keyboard, mouse, and emulated touch; placement/rotation; onboarding rain; sound toggle; pause freeze; save/reload of score, queue, and aim; confirmed fresh start and cancellation; Classic timer expiry; game over/replay; and responsive layout after orientation changes.
- **Viewports:** 1440 × 900 desktop, 390 × 844 portrait, 844 × 390 landscape, and 320 × 568 small portrait. Screenshots inspected. The board and Drop control remain usable without horizontal scrolling.
- **Production build:** 9 passing browser checks for startup, omission of developer hooks, touch scoring, reload recovery, cached assets, service-worker control, offline reload/play, corrupt-save recovery, and no runtime errors.
- **Build:** Vite production build passes; runtime JavaScript is approximately 19 kB before compression. No runtime package dependencies, external images, remote fonts, or analytics.

Physical phone frame rate, browser-specific home-screen installation, subjective audio mix, long-session balance, and thumb-placement comfort still need a hands-on check. Background auto-pause is implemented with the Page Visibility API; the automated browser did not mark the other tab hidden, so that behavior is not claimed as verified here.

Browser QA scripts and screenshots from this session are retained locally under the ignored `output/playwright/` directory.
