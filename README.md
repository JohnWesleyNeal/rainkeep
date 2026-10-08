# Rainkeep

A small browser landscape puzzle inspired by the water-and-terrain puzzle games of the 1990s. Original name, art, sound, and implementation; no original game assets.

Raise banks, lower terrain, place rain, and evaporate nearby water for points. Water flows across a 16 × 16 terrain grid. Anything leaving an edge fills the overflow gauge. At 100%, the run ends.

- **Daydream:** untimed piece placement. Water still flows and can overflow.
- **Classic:** pieces automatically drop at the current preview when the timer expires; the timer gradually shortens.
- **Touch:** drag on the board to aim (preview is offset above your finger); use Rotate and Drop.
- **Desktop:** point to aim, R to rotate, Space to drop; arrow keys also move the preview. Escape pauses/resumes.
- Runs, personal bests per mode, and sound preference save on this browser. Leaving the tab pauses. Start Fresh requires a separate screen before replacing a run.
- Offline service worker and home-screen manifest. No accounts, analytics, or remote saves.

## Develop

Node.js 24 recommended.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## Publish

The GitHub Actions workflow tests, builds, and publishes `dist` to GitHub Pages on pushes to `main`. Configure the repository's Pages source as GitHub Actions. Vite uses relative asset paths, so the project works beneath a repository URL.

The simulation uses conservative water flux at 30 Hz. Rendering is Canvas 2D at up to 2× device pixel ratio, with no runtime dependencies. Tests cover conservation, leakage, bank breaches, evaporation, deterministic save/restore, malformed saves, clocks, and terrain bounds.

Phone-sized browser checks verify layout and emulated touch; physical phone performance and subjective control feel require a hands-on check.
