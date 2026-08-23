# Weekly Planner

A colorful weekly **time-blocking** planner. Plan your week on an hourly grid,
drag blocks to reschedule them, and watch each day's header fill with water as
you check tasks off. Everything is saved in your browser — no account, no server.

![built with React + Vite](https://img.shields.io/badge/React-Vite-blue)

## Features

- **Time-blocking week view** — seven day columns on an hourly grid (6 AM–midnight).
- **Click to plan** — click any empty slot to drop a task right at that time, then type its name.
- **Drag & resize** — drag a block to move it (any day, any time); drag its bottom edge to change duration. Snaps to 15 minutes.
- **Colorful tasks** — every task gets its own color; cycle it anytime.
- **Liquid completion gauge** — each day's header fills with gently bobbing water as you complete tasks, and turns green when the day is done.
- **Habit tracker with streaks** — tick daily habits across the week and keep a 🔥 streak going.
- **Roll over** — sweep unfinished past tasks into today with one click.
- **Week in review** — a recap card (tasks done, completion rate, best day, streaks) that unlocks once a week has finished.
- **Fits your screen** — the timeline sizes itself so a full day is visible without scrolling on desktop.
- **Local & private** — data lives in `localStorage`; respects `prefers-reduced-motion`.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Build for production

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

Deploy the `dist/` folder to any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages, etc.).

## Tech

- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [lucide-react](https://lucide.dev/) icons

## Data & privacy

All tasks and habits are stored in your browser's `localStorage` under the keys
`planner:tasks` and `planner:habits`. Clearing site data or using a different
browser/device starts fresh. To reset, clear completed via the footer, or clear
the site's storage in your browser settings.

## Project structure

```
weekly-planner/
├─ index.html
├─ package.json
├─ vite.config.js
└─ src/
   ├─ main.jsx      # app entry
   ├─ App.jsx       # the planner (all UI + logic)
   ├─ storage.js    # localStorage persistence adapter
   └─ index.css     # base reset
```

## License

MIT — do whatever you like with it.
