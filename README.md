# Pixel Crusher

Idle ball-merge web prototype (Vite + Three.js, all SFX synthesized with Web Audio).

**Play:** https://irvanfaturohman.github.io/pixel-crusher/

```bash
npm install
npm run dev      # then open the URL Vite prints
npm run build    # production build in dist/
npm run deploy   # build + publish to GitHub Pages (gh-pages branch)
```

## How to play
- **Hold** anywhere on the board to drop balls, **drag** to aim, release to stop. You start with one ball.
- Balls bounce off the floating pixel picture (every bounce deals damage), fall past it, roll down the sloped floor into the inlet and ride the pipe back up to the dropper.
- Buttons: **Add Ball**, **Merge** (two lowest equal balls → one of double value), **Income ×**.
- **D** key (or a three-finger tap) toggles the debug panel: money cheats, game speed ×1/×3/×10, skip picture, add ball of any value, FPS/ball/particle stats, reset save.

## Tuning & content
- Every tunable number lives in `src/config.js` (physics, speeds, costs, HP, splash table, juice, SFX volumes).
- Built-in pictures are string art in `src/images.js`.
- Drop any PNG into `public/images/` to add a picture (alpha < 128 = empty; images larger than 24×24 are downscaled). `mushroom.png` is included as an example.
