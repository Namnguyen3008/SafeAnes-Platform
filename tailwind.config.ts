import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          default: "var(--safe-background-default)",
          surface: "var(--safe-background-surface)",
          elevated: "var(--safe-background-elevated)",
        },
        accent: {
          cyan: "var(--safe-accent-cyan)",
          blue: "var(--safe-accent-blue)",
        },
        semantic: {
          success: "var(--safe-semantic-success)",
          info: "var(--safe-semantic-info)",
          warning: "var(--safe-semantic-warning)",
          high: "var(--safe-semantic-high)",
          critical: "var(--safe-semantic-critical)",
        },
        quality: {
          good: "var(--safe-quality-good)",
          degraded: "var(--safe-quality-degraded)",
          unavailable: "var(--safe-quality-unavailable)",
        },
        safe: {
          bg: "var(--safe-bg)",
          surface: "var(--safe-surface)",
          "surface-secondary": "var(--safe-surface-secondary)",
          "surface-elevated": "var(--safe-surface-elevated)",
          border: "var(--safe-border)",
          "border-light": "var(--safe-border-light)",
          "border-subtle": "var(--safe-border-subtle)",
          text: "var(--safe-text)",
          "text-muted": "var(--safe-text-muted)",
          "text-dim": "var(--safe-text-dim)",
          cyan: "var(--safe-cyan)",
          green: "var(--safe-green)",
          yellow: "var(--safe-yellow)",
          red: "var(--safe-red)",
          orange: "var(--safe-orange)",
          blue: "var(--safe-blue)",
        },
        provenance: {
          direct: "var(--safe-provenance-direct)",
          derived: "var(--safe-provenance-derived)",
          inferred: "var(--safe-provenance-inferred)",
          confirmed: "var(--safe-provenance-confirmed)",
          rejected: "var(--safe-provenance-rejected)",
          review: "var(--safe-provenance-review)",
        },
        clinical: {
          etco2: "var(--safe-etco2)",
          spo2: "var(--safe-spo2)",
          map: "var(--safe-map)",
          "alert-critical": "var(--safe-alert-critical)",
          "alert-warning": "var(--safe-alert-warning)",
        },
      },
      fontSize: {
        xs: ["11px", { lineHeight: "14px" }],
        sm: ["12px", { lineHeight: "16px" }],
        base: ["13px", { lineHeight: "18px" }],
        "app-title": [
          "var(--safe-type-app-title-size)",
          { lineHeight: "var(--safe-type-app-title-line-height)" },
        ],
        "panel-title": [
          "var(--safe-type-panel-heading-size)",
          {
            lineHeight: "var(--safe-type-panel-heading-line-height)",
            fontWeight: "600",
            letterSpacing: "0.05em",
          },
        ],
        "section-title": [
          "var(--safe-type-section-heading-size)",
          { lineHeight: "var(--safe-type-section-heading-line-height)" },
        ],
        "clinical-body": [
          "var(--safe-type-body-size)",
          { lineHeight: "var(--safe-type-body-line-height)" },
        ],
        "secondary-label": [
          "var(--safe-type-secondary-size)",
          { lineHeight: "var(--safe-type-secondary-line-height)" },
        ],
        "table-header": [
          "var(--safe-type-table-header-size)",
          { lineHeight: "var(--safe-type-table-header-line-height)" },
        ],
        "table-cell": [
          "var(--safe-type-table-cell-size)",
          { lineHeight: "var(--safe-type-table-cell-line-height)" },
        ],
        "clinical-compact": [
          "var(--safe-type-clinical-compact-size)",
          {
            lineHeight: "var(--safe-type-clinical-compact-line-height)",
            fontWeight: "700",
          },
        ],
        "clinical-large": [
          "var(--safe-type-clinical-compact-size)",
          {
            lineHeight: "var(--safe-type-clinical-compact-line-height)",
            fontWeight: "700",
          },
        ],
        "clinical-numeric-compact": [
          "var(--safe-type-clinical-compact-size)",
          {
            lineHeight: "var(--safe-type-clinical-compact-line-height)",
            fontWeight: "700",
          },
        ],
        "clinical-numeric-large": [
          "var(--safe-type-clinical-large-size)",
          {
            lineHeight: "var(--safe-type-clinical-large-line-height)",
            fontWeight: "800",
          },
        ],
        "clinical-xlarge": [
          "var(--safe-type-clinical-large-size)",
          {
            lineHeight: "var(--safe-type-clinical-large-line-height)",
            fontWeight: "800",
          },
        ],
        timestamp: [
          "var(--safe-type-timestamp-size)",
          { lineHeight: "var(--safe-type-timestamp-line-height)" },
        ],
        identifier: [
          "var(--safe-type-identifier-size)",
          { lineHeight: "var(--safe-type-identifier-line-height)" },
        ],
      },
      spacing: {
        "safe-header": "var(--safe-header-height)",
        "safe-nav": "var(--safe-nav-width)",
        "safe-gap": "var(--safe-panel-gap)",
        "safe-padding": "var(--safe-panel-padding)",
        "safe-row": "var(--safe-row-height)",
        "safe-space-1": "var(--safe-space-1)",
        "safe-space-2": "var(--safe-space-2)",
        "safe-space-3": "var(--safe-space-3)",
        "safe-space-4": "var(--safe-space-4)",
        "safe-space-5": "var(--safe-space-5)",
        "safe-space-6": "var(--safe-space-6)",
        "safe-button": "var(--safe-button-height)",
        "safe-control": "var(--safe-control-height)",
      },
      backgroundColor: {
        default: "var(--safe-background-default)",
        surface: "var(--safe-background-surface)",
        elevated: "var(--safe-background-elevated)",
      },
      textColor: {
        primary: "var(--safe-text-primary)",
        secondary: "var(--safe-text-secondary)",
        muted: "var(--safe-text-tertiary)",
      },
      borderColor: {
        default: "var(--safe-border-default)",
        strong: "var(--safe-border-strong)",
      },
      minWidth: {
        "safe-control": "var(--safe-control-min-width)",
        "safe-drawer": "var(--safe-drawer-min-width)",
      },
      maxWidth: {
        "safe-drawer": "var(--safe-drawer-max-width)",
      },
      width: {
        "safe-drawer": "var(--safe-drawer-preferred-width)",
      },
      screens: {
        "safe-wide": "1640px",
        "safe-compact": "1440px",
        "safe-min": "1280px",
      },
      borderRadius: {
        DEFAULT: "var(--safe-radius)",
        none: "var(--safe-radius-none)",
        sm: "var(--safe-radius-compact)",
        md: "var(--safe-radius)",
        lg: "var(--safe-radius-emphasis)",
        tight: "var(--safe-radius-tight)",
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '"IBM Plex Sans"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"IBM Plex Mono"',
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
