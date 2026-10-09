# Rainkeep

A small browser landscape puzzle inspired by the water-and-terrain puzzle games of the 1990s. Original name, art, sound, and implementation; no original game assets.

Raise banks, lower terrain, place rain, and evaporate nearby water for points. Water flows across a 16 × 16 terrain grid. Anything leaving an edge fills the overflow gauge. At 100%, the run ends.

- **Daydream:** pieces hang above the landscape until you press Drop. Water still flows and can overflow.
- **Classic:** pieces visibly descend while you steer and rotate them. They affect the landscape on contact. Falls gradually get faster.
- **Touch:** slide anywhere on the board to steer relatively. Lifting and re-touching preserves your aim. The four arrow buttons nudge one tile; holding repeats. A second thumb can Rotate or Drop while the first keeps steering.
- **Drop:** accelerates the current piece to its landing point, with a short visible descent. The committed landing position locks until impact.
- **Desktop:** point to steer, R to rotate, Space to drop faster; arrow keys also move the piece. Escape pauses/resumes.
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

The simulation uses conservative water flux and piece descent at 30 Hz. Rendering is Canvas 2D at up to 2× device pixel ratio, with no runtime dependencies. Runs preserve the mid-fall altitude. Original prototype saves upgrade without losing their board, score, aim, or queue.

The [Wetrix N64 manual](https://nintendo64.pl/wp-content/uploads/Wetrix-EU-uncomplet.pdf) describes steering and rotating a falling piece and accelerating it with Drop. Rainkeep follows that interaction here, adapted to relative touch movement and precise nudge buttons. Its terrain, piece set, scoring, and modes remain a simplified original implementation.

Phone-sized browser checks verify layout and emulated touch; physical phone performance and subjective control feel require a hands-on check.
