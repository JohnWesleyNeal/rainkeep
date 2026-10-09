# Rainkeep art

Edition 04 uses original real-time Three.js geometry for the terrain, cliff layers, banks, pieces, ducks, mines, rainbow, and impact effects. A custom water shader adds reflected light, moving highlights, shoreline foam, and ice tint. The scene is lit with a warm sun and cool sky; the interface shares its teal, sage, and coral palette.

## Generated ground material

Final asset: `src/assets/ground.webp`. Generated with the built-in imagegen tool on 2026-10-09, then encoded as WebP for browser delivery. The bitmap is used as an albedo map on the moving terrain, rather than as a static game background. No original Wetrix art was used.

Final prompt:

> Create one original square seamless tiling diffuse/albedo texture for a stylized 3D floating-island water puzzle browser game. Use case: stylized-concept, game ground texture. View: perfectly top down orthographic flat 2D texture, evenly lit, absolutely no perspective, no 3D scene, no cast shadows, no frame. Surface: fine hand-painted mossy grass with soft sage and olive green patches, subtle pale lichen and occasional tiny grass strokes. Warm restrained natural palette, medium value muted moss greens, small creamy flecks sparingly. Soft painted gouache finish with very low contrast so it supports player-built banks and water without looking noisy. Uniform density across the whole square, tileable matching opposite edges, no focal center, no large rocks, no flowers, no objects, no visible grid, no text, no symbols, no border. This is a material texture to map onto a dynamic game terrain, not a screenshot or concept scene.

The lightweight Canvas fallback retains continuous gameplay when WebGL is unavailable. It has simpler lighting, terrain, and tokens.
