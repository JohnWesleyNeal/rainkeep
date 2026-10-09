# Rainkeep

A small browser landscape puzzle inspired by the water-and-terrain puzzle games of the 1990s. Original name, art, sound, and implementation; no original game assets.

Build banks and enclose lakes, then evaporate connected water for points and drain relief. Water flows across a 32 × 32 terrain grid. Edges and bomb holes fill the drain; at 100%, the run ends.

- **Classic (default):** a flat, dry board and twelve opening Uppers let you build your own enclosures before Water arrives. Pieces visibly descend while you steer and rotate. Ten levels increase the speed every two minutes; ambient rain begins after the opening.
- **Daydream:** practice with a demonstration lake and pieces that wait for Drop. Water still flows and can overflow.
- **Placement:** each old tile now contains four terrain samples. Shift pieces by half a former tile, overlap banks, or accidentally leave a thin gap. Long banks, corners, rings, and smaller shapes share this fine placement grid.
- **Touch:** slide anywhere on the board to steer relatively. Lifting and re-touching preserves your aim. Arrow buttons nudge a fine step; holding repeats. A second thumb can Rotate or Drop while the first keeps steering.
- **Drop:** accelerates the current piece to its landing point, with a short visible descent. The committed landing position locks until impact.
- **Desktop:** point to steer, R to rotate, Space to drop faster; arrows move a fine step, Shift + arrows a larger step. Escape pauses/resumes.
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

## Rules and strategy

- **Upper:** raises each sample, or repairs a whole connected puncture when it touches a hole. Excess land increases earthquake pressure.
- **Downer:** levels its footprint to the lowest ground it touches. Flat land stays flat. Water and ice under it disappear without points or drain relief. Touching a hole expands it.
- **Water:** adds flowing water. Closed banks hold it; gaps, edges, and holes leak. The small map shows current escape points in red and holes in dark ink.
- **Fireball:** evaporates the connected lake it lands in, awards points, and lowers the drain. Dry fire flattens land without punching through the board. Fire thaws frozen lakes without evaporating them; a lake containing a mine detonates instead.
- **Bomb:** punches a leaking hole regardless of terrain height. Landing in an existing hole triggers three falling re-bombs. Active cascades are capped for playability.
- **Bonuses:** separate lakes multiply scores, deep lakes gain ducks, and enough liquid water produces a ×10 rainbow. The visible combined multiplier also includes the level. Frozen water does not count toward ducks or rainbows.
- **Events:** too much land triggers an earthquake. Ice begins at level 2 and freezes a lake temporarily; catching it on dry land earns a bonus. Mines begin at level 4 and expire unless frozen. Five lakes at level-up earn a Smart bomb, which clears the board and drain while retaining the score.

The simulation uses conservative water flux and piece descent at 30 Hz. Rendering is Canvas 2D at up to 2× device pixel ratio, with no runtime dependencies. Runs preserve altitude, holes, frozen water, hazards, and mines. Original prototype saves expand geometrically to the finer grid, retaining score, aim, queue, water volume, and drain percentage. Continuing an older run retains its original board; choose a fresh Classic run to experience the dry opening.

The [Wetrix N64 manual](https://nintendo64.pl/wp-content/uploads/Wetrix-EU-uncomplet.pdf), printed pages 9–11 and 18–23, informed the opening, terrain rules, fire/drain relationship, hazards, and multipliers. This remains an original approximation: the half-tile grid is not a verified match for the original analog placement resolution; piece proportions, scoring values, event timing, water physics, and quake damage are independently tuned. The camera is fixed. Pro/mystery pieces, lessons, challenge/handicap modes, and multiplayer are not implemented.

Phone-sized browser checks verify layout and emulated touch; physical phone performance and subjective control feel require a hands-on check.
