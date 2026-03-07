/**
 * Design tokens centralisés
 * Couleurs, espacements, typographie pour cohérence
 */

// === SPACING ===
export const spacing = {
  xs: "0.5rem",   // 8px
  sm: "0.75rem",  // 12px
  md: "1rem",     // 16px
  lg: "1.5rem",   // 24px
  xl: "2rem",     // 32px
  "2xl": "3rem",  // 48px
  "3xl": "4rem",  // 64px
  "4xl": "6rem",  // 96px
  "5xl": "8rem",  // 128px
} as const;

// === COLORS (HSL values for dynamic manipulation) ===
export const colors = {
  primary: {
    50: "221 83% 98%",
    100: "221 83% 95%",
    200: "221 83% 85%",
    300: "221 83% 75%",
    400: "221 83% 65%",
    500: "221 83% 53%",  // Main primary
    600: "221 83% 45%",
    700: "221 83% 35%",
    800: "221 83% 25%",
    900: "221 83% 15%",
  },
  accent: {
    blue: "210 100% 60%",
    violet: "262 83% 58%",
    emerald: "142 76% 36%",
    amber: "47 96% 53%",
    pink: "340 82% 52%",
  },
  gradient: {
    primary: "linear-gradient(135deg, hsl(221 83% 53%) 0%, hsl(262 83% 58%) 100%)",
    warm: "linear-gradient(135deg, hsl(47 96% 53%) 0%, hsl(340 82% 52%) 100%)",
    cool: "linear-gradient(135deg, hsl(210 100% 60%) 0%, hsl(142 76% 36%) 100%)",
    mesh: "radial-gradient(at 40% 20%, hsl(221 83% 53%) 0%, transparent 50%), radial-gradient(at 80% 0%, hsl(262 83% 58%) 0%, transparent 50%), radial-gradient(at 0% 50%, hsl(142 76% 36%) 0%, transparent 50%)",
  },
} as const;

// === TYPOGRAPHY ===
export const typography = {
  fontFamily: {
    sans: "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
    mono: "var(--font-geist-mono), 'Courier New', monospace",
  },
  fontSize: {
    xs: "0.75rem",    // 12px
    sm: "0.875rem",   // 14px
    base: "1rem",     // 16px
    lg: "1.125rem",   // 18px
    xl: "1.25rem",    // 20px
    "2xl": "1.5rem",  // 24px
    "3xl": "1.875rem",// 30px
    "4xl": "2.25rem", // 36px
    "5xl": "3rem",    // 48px
    "6xl": "3.75rem", // 60px
    "7xl": "4.5rem",  // 72px
  },
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: "1.2",
    normal: "1.5",
    relaxed: "1.75",
  },
} as const;

// === ANIMATION DURATIONS ===
export const duration = {
  fast: "0.15s",
  normal: "0.3s",
  slow: "0.5s",
  slower: "0.7s",
  slowest: "1s",
} as const;

// === EASING FUNCTIONS ===
export const easing = {
  default: "cubic-bezier(0.4, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  smooth: "cubic-bezier(0.45, 0, 0.15, 1)",
  elastic: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
} as const;

// === Z-INDEX LAYERS ===
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modal: 40,
  popover: 50,
  tooltip: 60,
  notification: 70,
} as const;

// === BORDER RADIUS ===
export const radius = {
  sm: "0.25rem",  // 4px
  md: "0.5rem",   // 8px
  lg: "0.75rem",  // 12px
  xl: "1rem",     // 16px
  "2xl": "1.5rem",// 24px
  "3xl": "2rem",  // 32px
  full: "9999px",
} as const;

// === SHADOWS ===
export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  base: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
  glow: "0 0 20px 0 rgb(139 92 246 / 0.3)",
  glowPrimary: "0 0 30px 0 hsl(221 83% 53% / 0.4)",
} as const;

// === BREAKPOINTS ===
export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;
