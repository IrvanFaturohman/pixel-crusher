# Pixel Crusher

Idle ball-merge web prototype (Vite + Three.js, all SFX synthesized with Web Audio).

**Play:** https://irvanfaturohman.github.io/pixel-crusher/

```bash
npm install
npm run dev      # then open the URL Vite prints
npm run build    # production build in dist/
npm run deploy   # build + publish to GitHub Pages (gh-pages branch)
```

## Controls
- The game plays itself. **Press & drag** on the board to aim manually (balls get a ×1.5 damage bonus); auto-aim resumes 2 s after release.
- Buttons: **Add Ball**, **Merge** (two lowest equal balls), **Income ×**.
- **D** key (or a three-finger tap) toggles the debug panel: money cheats, game speed ×1/×3/×10, skip picture, add ball of any value, FPS/ball/particle stats, reset save.

## Tuning & content
- Every tunable number lives in `src/config.js` (speeds, costs, HP, splash table, juice, SFX volumes, `returnMode: 'arc' | 'roll'`).
- Built-in pictures are string art in `src/images.js`.
- Drop any PNG into `public/images/` to add a picture (alpha < 128 = empty; images larger than 24×24 are downscaled). `mushroom.png` is included as an example.
