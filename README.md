# Framebuffer Texture Image Converter

A small Three.js + Vite web application that lets users upload images and view them through framebuffer-based shader effects similar to the Three.js `webgl_framebuffer_texture` example.

## Features
- Multiple image upload with thumbnail selector
- Interactive pan & zoom
- Several GPU shader effects (luma displacement, edge pulse, RGB warp)
- Adjustable intensity, speed, scale
- Adjustable framebuffer size (future multi-pass capability)
- Download the processed view as a PNG
- Optional Hilbert fractal path rendering sampling image colors (animated rainbow hue shift)

## Getting Started

Install dependencies:
```bash
npm install
```

Run dev server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
npm run preview
```

## Structure
- `index.html` Root HTML shell + UI
- `src/main.js` App bootstrap, Three.js setup & shader logic

## Roadmap / Ideas
- Add real offscreen framebuffer pass (ping-pong) for iterative effects
- Drag & drop support
- Additional GLSL effects (bloom, glitch, pixel sort simulation, etc.)
- Export sequence as GIF / MP4
- GPU-based color quantization
- More fractal types (Gosper, Peano, Sierpinski curve) and density control

## License
MIT

## GitHub Pages Deployment

This project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds the site and deploys the `dist` output to GitHub Pages whenever you push to `main` or `master`.

Steps:
1. Ensure the default branch is `main` or `master`.
2. Push the repo to GitHub.
3. In the repository Settings → Pages, choose "GitHub Actions" as the source (if prompted).
4. After a push, the action will build and publish. The URL will be printed in the workflow summary (typically `https://<user>.github.io/<repo>/`).

The `vite.config.js` sets `base` automatically when running inside GitHub Actions so relative asset paths work under a subpath repo.

If your repository is a user/organization page named `<user>.github.io`, the base remains `/`.
