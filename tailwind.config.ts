import type { Config } from "tailwindcss";

// Every value here maps 1:1 to gayflix-design-tokens.html (v1, approved).
// If a token changes, change it here — never hardcode a hex in a component.

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand primary — Flame Pink. Buttons, links, primary actions.
        brand: {
          pink: {
            // #EC008C in the v1 token sheet; deepened a touch so white
            // button text clears WCAG AA (4.5:1).
            DEFAULT: "#E40087",
            light: "#FF5FB0", // hover
            soft: "#C25693", // muted / subtle fills
            dark: "#9E0068", // active / pressed
          },
          // Brand secondary — Sunset Orange. Secondary CTAs, badges.
          orange: {
            DEFAULT: "#FF8200",
            light: "#FFA84D",
            soft: "#D99A5C",
            dark: "#B85E00",
          },
        },

        // Pride spectrum — decorative only. Genre tags, category chips, gradients.
        // Never used for interactive/button states — keeps the UI from competing
        // with itself; the brand color owns "click me."
        pride: {
          red: { DEFAULT: "#E4002B", light: "#FF5C72" },
          yellow: { DEFAULT: "#FFD100", light: "#FFE066" },
          green: { DEFAULT: "#00A651", light: "#4CD684" },
          blue: { DEFAULT: "#0072CE", light: "#5CA8F2" },
          purple: { DEFAULT: "#732982", light: "#A15FB0" },
        },

        // Background — dark, cinematic. Three flat layers, no shadows.
        bg: {
          base: "#0B0B0F", // page background
          surface: "#17171F", // cards, rows, nav
          elevated: "#212129", // modals, dropdowns, hovered/focused card
        },

        border: {
          subtle: "#2A2A34",
          strong: "#3D3D4A",
        },

        // Text — named "ink" so utilities read as text-ink-primary,
        // border-ink-muted, etc. without colliding with Tailwind's text-* sizing utilities.
        ink: {
          primary: "#FFFFFF",
          secondary: "#B7B7C3",
          // #7A7A87 in the v1 token sheet; lightened so muted text clears
          // WCAG AA (4.5:1) on every background layer.
          muted: "#878794",
          disabled: "#4C4C56",
          onBrand: "#FFFFFF",
          // Pink text on dark backgrounds (links, active nav items). The
          // brand pink fill is too dark to read as text at 4.5:1, so text
          // gets its own lighter shade; brand.pink.light stays its hover.
          brand: "#F13DA8",
        },

        status: {
          success: "#22C55E",
          error: "#FF4757",
          warning: "#FFB020",
          info: "#38BDF8",
        },

        // Keyboard focus ring — deliberately NOT brand pink, so focus
        // is never visually confused with hover/active.
        focus: "#FFD100",
      },

      fontFamily: {
        // Wired to next/font/google CSS variables set in app/layout.tsx
        display: ["var(--font-baloo)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },

      ringColor: {
        DEFAULT: "#FFD100",
      },
      ringOffsetColor: {
        DEFAULT: "#0B0B0F",
      },

      borderRadius: {
        card: "10px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};

export default config;
