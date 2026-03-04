# CutIt — Plywood Cut Calculator

A plywood cut optimizer for cabinet construction. Enter your space dimensions, number of cabinets, and stock thickness — get optimized cut diagrams with step-by-step instructions for your tracksaw and MFT.

## Features

- **Space-based layout** — enter total opening width, divide into cabinets, multiply for repeated sets
- **Cabinet groups** — different dimensions per group (A, B, C), each with its own reference diagram
- **Pocket hole construction** — automatic panel sizing (sides, top/bottom, back, stringers)
- **Two stock thicknesses** — cabinet stock and back stock with actual (not nominal) dimensions
- **Strip-based bin packing** — optimizes panel layout across 4×8 sheets to minimize waste
- **Step-by-step cut guides** — rip first (tracksaw), then crosscuts per strip (MFT)
- **Visual blueprints** — SVG diagrams with dimensions, color-coded by panel type
- **Print-friendly** — dedicated print mode with page breaks per section
- **Project save/load** — localStorage persistence for managing multiple projects
- **Scrap inventory** — track offcuts and reuse them in future projects
- **Shopping list** — checkbox list of sheets to buy, grouped by nominal thickness
- **PWA support** — install on iPhone/iPad home screen, works offline

## Setup

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Set `base: "/your-repo-name/"` in `vite.config.js`
2. Push to GitHub — the included GitHub Actions workflow builds and deploys automatically
3. Enable Pages in repo Settings → Pages → Source → GitHub Actions

## Install as App (PWA)

Visit the deployed URL on your phone, tap Share → "Add to Home Screen". The app works offline after the first visit.

## Tech

React 18, Vite, SVG rendering, localStorage, Service Worker. Single-file component (~1000 lines).
