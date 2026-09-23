# 💎 THE DIAMOND — Casino & Resort

Official modern web portal and landing experience for **The Diamond Casino & Resort**. Built with high-performance monochrome aesthetics, fluid cinematic video backdrops, and interactive modules.

---

## ⚡ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Tooling**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Streaming**: [HLS.js](https://github.com/video-dev/hls.js/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Typography**: Instrument Serif, Geist Mono, Inter Tight

---

## 📁 Project Architecture

```
casino gta/
├── public/
│   └── diamond_casino_logo.png     # Official Faceted Chrome Diamond Logo
├── src/
│   ├── components/                 # Modular UI sections
│   │   ├── Architecture.tsx        # System specs & 4-column capability grid
│   │   ├── CtaStream.tsx           # HLS live stream & brand CTA
│   │   ├── Discovery.tsx           # AI search evolution nodes (ChatGPT, Perplexity, Gemini)
│   │   ├── Footer.tsx              # Brand footer & status links
│   │   ├── Gallery.tsx             # Vault visual archive & suites
│   │   ├── Hero.tsx                # Hero cinematic loop & subscription bar
│   │   ├── Mission.tsx             # Scroll-driven kinetic typography
│   │   ├── Navbar.tsx              # Orbit precision header & mobile drawer
│   │   └── NotFound.tsx            # Standalone 404 recovery view
│   ├── constants/
│   │   ├── animations.ts           # Framer motion transition presets
│   │   └── gallery.ts              # Visual archive records
│   ├── App.tsx                     # Main page orchestrator
│   ├── index.css                   # Liquid-glass styles & custom tokens
│   └── main.tsx                    # React DOM entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🚀 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Development Server

Runs the local development server at `http://localhost:5179/`:

```bash
npm run dev
```

### 3. Production Build

Compiles TypeScript and creates optimized production assets in `/dist`:

```bash
npm run build
```

### 4. Production Preview

Previews the compiled build locally:

```bash
npm run preview
```

---

## 🛡️ License & Rights

© 2026 The Diamond Casino & Resort. All rights reserved.
