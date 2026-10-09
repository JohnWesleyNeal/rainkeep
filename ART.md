# Rainkeep art

Edition 06 uses original real-time Three.js geometry for the terrain, irregular rock underside, hanging roots, banks, solid beveled pieces, ducks, mines, rainbow, and impact effects. Decorative edge grass and raised direction spikes have been removed. Flat cream chevrons identify Upper/Downer pieces. Quiet sage ground, lighter elevated tops, and earth-colored slopes with restrained strata make height changes readable without a bitmap ground texture.

Bombs have a shaped metal shell, brass band and fittings, curved fuse, and animated sparks. Fireballs use a luminous core and several curved, layered flame volumes with a warm color gradient and subtle motion. Water is a smooth teardrop with a glossy highlight; ice uses a beveled crystalline block. These are modeled geometry rather than generated sprites. Previews render the same models as the board.

Bomb holes remove the corresponding terrain and water triangles, cut through the rock and edge skirt, and expose the sky beneath dark walls and an earth rim. Repairs restore the mesh opening. The soft landing footprint conforms to the ground/water and clips out over holes. Raised banks cast filtered 2048-pixel terrain shadows; falling pieces use the conforming footprint to avoid a second misleading offset shadow.

A custom water shader adds view-dependent reflections, impact ripples, shoreline foam, and ice tint. Warm sun/cool sky lighting connects the island to the painted distant backdrop. Turns ease around the piece center, and terrain grows toward its committed height after contact; reduced-motion mode removes these transitions and token flicker.

## Generated sky backdrop

Final asset: `src/assets/sky.webp` (74,120 bytes). Generated with the built-in imagegen tool on 2026-10-09, then encoded as WebP for browser delivery. This is distant scenery behind the dynamic 3D board. The source remains in the Codex generated-images folder; no original Wetrix art was used.

Final prompt:

> Use case: stylized-concept. Create an original production background painting for a cozy miniature 3D floating-island water puzzle browser game. A square image, no text, no interface, no foreground game board. Art direction: beautifully art-directed hand-painted sky diorama, soft cel shading and gouache, restrained details, warm sunlight from upper left, airy blue-green sky with a pale peach golden glow high at the left. Composition for gameplay overlay: the middle 65 percent of the image must be mostly clear open sky, quiet muted blue-green gradients, absolutely no focal object or large island in the center. Place a few tiny distant floating rock islands with little tree silhouettes ONLY near far left and far right edges, small and softly misted, middle distance below the horizon. Along the bottom corners and very bottom edge, layered soft painterly cloud banks in warm off-white with blue-green shaded undersides. Depth and atmosphere, painterly brush detail, sophisticated and playful, like a high-quality indie miniature world. Plenty of clean central negative space for a dynamic 3D playable island placed over this image. No main island, no water puzzle, no characters, no buildings, no symbols, no letters, no logos, no border. This image is distant scenery, never a game screenshot.

## Historical generated ground material

Asset: `src/assets/ground.webp`. Generated with the built-in imagegen tool on 2026-10-09, then encoded as WebP for browser delivery. Editions 04 and 05 used it as a terrain albedo map. Edition 06 keeps the source asset for history but removes it from the runtime and offline bundle to improve height readability. No original Wetrix art was used.

Final prompt:

> Create one original square seamless tiling diffuse/albedo texture for a stylized 3D floating-island water puzzle browser game. Use case: stylized-concept, game ground texture. View: perfectly top down orthographic flat 2D texture, evenly lit, absolutely no perspective, no 3D scene, no cast shadows, no frame. Surface: fine hand-painted mossy grass with soft sage and olive green patches, subtle pale lichen and occasional tiny grass strokes. Warm restrained natural palette, medium value muted moss greens, small creamy flecks sparingly. Soft painted gouache finish with very low contrast so it supports player-built banks and water without looking noisy. Uniform density across the whole square, tileable matching opposite edges, no focal center, no large rocks, no flowers, no objects, no visible grid, no text, no symbols, no border. This is a material texture to map onto a dynamic game terrain, not a screenshot or concept scene.

The lightweight Canvas fallback retains continuous gameplay when WebGL is unavailable. It has simpler lighting, terrain, and tokens.
