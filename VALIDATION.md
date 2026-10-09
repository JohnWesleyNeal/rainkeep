# Prototype validation

Version 1.1.0, validated on 2026-10-08 using Node.js 24 and desktop Chromium. This is an original prototype inspired by terrain-and-water puzzle games, not a complete recreation of Wetrix.

- **Simulation and controls:** 19 passing Node tests. Water conservation, leakage, terrain edits, evaporation, deterministic saves, malformed saves, relative touch re-grips, jitter resistance, edge overshoot, rotated/nudged drag anchors, actual descent, delayed landing effects, automatic Classic contact, accelerated drops, mid-fall restoration, and legacy save migration.
- **Interactive browser:** 29 passing checks. Continuous touch drags, stationary fingers over moving water, re-gripping, jitter, held nudge repeat/release, a second thumb rotating/dropping while the steering pointer remains captured, aim continuity across landing, contact-only terrain edits, natural Classic falls, rotation during descent, pause/reload of altitude, and responsive controls.
- **Viewports:** 1440 × 900 desktop, 390 × 844 portrait, 844 × 390 landscape, and 320 × 568 small portrait. Screenshots inspected, including two phases of the same falling piece. The board and Drop control fit without horizontal scrolling.
- **Production browser:** 16 passing checks. Continuous touch steering, second-thumb actions, physical descent/contact, mid-fall reload, natural Classic landing, offline reload, legacy save migration, and absence of runtime errors are checked against the built app. Repeat these checks on the deployed URL after Pages completes.
- **Build:** Vite production build passes. Runtime JavaScript is approximately 22 kB before compression. No runtime package dependencies, external images, remote fonts, or analytics.

The previous prototype used height-dependent absolute touch picking and a countdown followed by an instantaneous edit. Version 1.1.0 replaces those with relative movement and a real falling-piece state. Drop commits the current aim and accelerates to impact; the next piece keeps that aim. Existing runs preserve their board, score, aim, and queue when upgraded.

Physical phone frame rate, browser-specific home-screen installation, subjective audio mix, long-session balance, and thumb-placement comfort still require a hands-on check. The tests above use touch emulation and do not establish physical-phone acceptance. Background auto-pause uses the Page Visibility API; the automated browser did not mark the other tab hidden, so that behavior is not claimed as verified here.

Browser QA scripts and screenshots are retained locally under the ignored `output/playwright/` directory. The current scripts are `v2-checks.js` and `v2-production.js`; earlier scripts describe the original timer-based prototype and are not current acceptance checks.
