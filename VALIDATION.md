# Prototype validation

Version 1.2.0 / edition 03, validated on 2026-10-08 with Node.js 24 and desktop Chromium. This pass follows the Wetrix manual more closely, while remaining an independently tuned browser game.

- **Simulation and controls:** 32 passing Node tests. Flat/dry Classic opening, safe introduction sequence, fine overlapping placement, all shape rotations, conservation and leakage, leveling Downers, punctures and repairs, re-bomb waves, connected-lake Fire and drain relief, dry Fire, lake/duck/rainbow multipliers, earthquakes, freezing/thawing, mines, Smart bombs, level/event progression, actual descent and contact, deterministic saves, geometric legacy migration, and corrupt-save rejection.
- **Playable browser route:** 31 passing checks. Actual touch gestures build an enclosure from the empty Classic board, stack ring banks, add Water, produce a duck, and evaporate the lake for points. Also checks fine offsets, re-gripping, two-thumb steering/Rotate/Drop, landing continuity, restore, Daydream, and four viewport layouts. Twelve opening-piece checks are included in this total.
- **Production browser:** 25 passing checks against the built app. Touch control, physical descent, bonus displays, Fire scoring/drain relief, Smart bomb reset, bomb-hole repair, ice thawing, mine detonation, quake feedback, a later falling ice event, old-save migration, mid-fall restore, offline reload, absence of errors, and layouts with an earned Smart bomb. Later-state checks load deterministic save fixtures; they do not establish long-session balance. Repeat the production checks against the deployed URL after Pages completes.
- **Viewports:** 390 × 844 portrait, 320 × 568 small portrait, 844 × 390 landscape, and 1440 × 900 desktop. Screenshots inspected for empty starts, constructed lakes, ducks/rainbow, holes, and later events. Drop, steering, and mechanics fit, including an available Smart bomb. The leakage map and drain percentage have separate space in landscape.
- **Build:** Vite build passes. Runtime JavaScript is approximately 33 kB before compression, with no runtime package dependencies, external images, remote fonts, or analytics. The service worker precaches the current hashed assets.

Legacy runs preserve their score, aim, queue, board geometry, water, and drain percentage as the 16 × 16 map expands to 32 × 32. Continue retains the old landscape; a fresh Classic run is needed to experience the dry start. New saves also retain holes, ice timers, mines, incoming hazards, and Smart bombs.

## Fidelity boundaries

The original manual informed the dry opening, piece behavior, hazards, and scoring relationships. Half-former-tile placement is a finer-grid approximation; the original analog placement increment has not been measured. Shapes, level timing, scoring values, lake/duck/rainbow thresholds, fluid simulation, quake damage, and bounded re-bomb cascades are independent tuning choices. Fire evaporation applies at impact rather than progressively burning through a lake. Camera rotation/zoom, Pro/mystery pieces, original lessons/challenges/handicaps, and multiplayer remain absent.

Physical-phone frame rate, thumb comfort, browser-specific home-screen installation, subjective audio mix, and long-session difficulty still need hands-on acceptance. Touch emulation does not establish those. Visibility auto-pause is implemented, but the automated browser did not expose a reliable hidden-tab transition, so that behavior is not claimed as verified.

QA scripts and screenshots remain in ignored `output/playwright/`: `v3-checks.js`, `v3-production-template.js`, `create-v3-qa.mjs`, and the generated production/live scripts. The earlier v1/v2 scripts are historical.
