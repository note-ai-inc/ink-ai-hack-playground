# Ink Playground

React + TypeScript + Vite prototyping app for interactive ink-based elements
with handwriting recognition.

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Environment Setup
Copy the example env file and configure:
```bash
cp .env.example .env
```

Required variables:
| Variable | Description | Default |
|----------|-------------|---------|
| `INK_RECOGNITION_API_URL` | Handwriting recognition API endpoint | `https://strokes.hack.ink.ai` |

The default value in `.env.example` points to the hack recognition API and works out of the box.

### Running
```bash
npm run dev      # Start dev server at http://localhost:5173
npm run build    # TypeScript compile + Vite production bundle
npm run lint     # ESLint check
npm run preview  # Preview production build locally
```

### How It Works
Draw on the canvas with a pointer device. Strokes are captured, clustered,
and sent to the handwriting recognition API. Recognized content is converted
into interactive elements (text, shapes, TicTacToe grids, coordinate planes).

See `docs/New element HOWTO.md` for a guide on adding new element types.

See `ink-prototyping-app-plan.md` for the original design document.
