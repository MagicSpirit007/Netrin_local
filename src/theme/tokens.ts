// Field Console — monochrome dark token mirror (reference only; the runtime
// source of truth is src/styles.css :root). Kept in sync with the Claude Design
// handoff token set: near-black canvas, white ink, signals collapsed to white/grey.
export const tokens = {
  color: {
    ink900: '#0b0c0e', // app background
    ink800: '#141619', // elevated panel
    ink700: '#1b1e22', // card surface
    paper: '#101214', // dark field card / map base
    paperPure: '#0b0c0e', // deepest map base
    lineInk: '#f4f5f2', // white ink stroke / border
    fg: '#f4f5f2',
    fgMuted: 'rgba(244, 245, 242, 0.56)',
    hairline: 'rgba(255, 255, 255, 0.10)',
    // "signals" are monochrome now — all resolve to white/grey
    signalGreen: '#f4f5f2', // live / active route / current location / active tab
    signalAmber: '#c7cac4',
    signalBlue: '#c7cac4',
    signalRed: '#f4f5f2',
    onSignal: '#0b0c0e' // black text on any white fill
  },
  font: {
    sans: '"Space Grotesk", "LXGW WenKai Screen", "LXGW WenKai", KaiTi, serif',
    cjk: '"LXGW WenKai Screen", "LXGW WenKai", KaiTi, STKaiti, "楷体", serif'
  },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32 },
  radius: { xs: 2, sm: 4, md: 6, lg: 8, pill: 999 },
  shadow: { hard: '4px 4px 0 #000000', hardSm: '3px 3px 0 #000000' }
} as const
