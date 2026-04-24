/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ───────────────────────────────────────────────
        // SEMANTIC TOKENS — resolve from CSS vars,
        // so every utility reads the active theme.
        // The `<alpha-value>` placeholder lets us keep
        // using bg-x/X and text-x/X opacity modifiers.
        // ───────────────────────────────────────────────

        // `white` is overridden so that every existing
        // `text-white/X` and `bg-white/X` becomes the
        // theme's ink color (white on dark, dark on light).
        white: 'rgb(var(--ink) / <alpha-value>)',

        // Page & surface tokens. The `dark-*` names are
        // kept for back-compat with existing code: in dark
        // mode they resolve to the green-tinted dark palette;
        // in light mode they become soft off-white surfaces.
        dark: {
          950: 'rgb(var(--surface-4) / <alpha-value>)',
          900: 'rgb(var(--surface-3) / <alpha-value>)',
          850: 'rgb(var(--surface-2) / <alpha-value>)',
          800: 'rgb(var(--surface-1) / <alpha-value>)',
          700: 'rgb(var(--surface-0) / <alpha-value>)',
          600: 'rgb(var(--surface--1) / <alpha-value>)',
        },

        // Glass surface tint. In dark mode it is white at low
        // alpha (classic glass); in light mode it is a dark-green
        // ink tint, still low alpha, so cards read as subtle frosted
        // panels over a luminous background.
        surface: {
          DEFAULT: 'rgb(var(--glass-ink) / 0.07)',
          hover: 'rgb(var(--glass-ink) / 0.11)',
          active: 'rgb(var(--glass-ink) / 0.15)',
          border: 'rgb(var(--glass-ink) / 0.12)',
          'border-hover': 'rgb(var(--glass-ink) / 0.18)',
          'glass': 'rgb(var(--glass-ink) / 0.05)',
          'glass-strong': 'rgb(var(--glass-ink) / 0.09)',
        },

        // Brand colors — identical in both themes.
        mint: {
          DEFAULT: '#49DC7A',
          light: '#6BE896',
          dark: '#2DB85C',
          ink: 'rgb(var(--mint-ink) / <alpha-value>)',
          glow: 'rgba(73, 220, 122, 0.15)',
          'glow-strong': 'rgba(73, 220, 122, 0.25)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          bg: 'rgb(var(--color-success-bg) / <alpha-value>)',
          border: 'rgb(var(--color-success-border) / <alpha-value>)',
          text: 'rgb(var(--color-success-text) / <alpha-value>)',
          glow: 'rgb(var(--color-success-glow) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          bg: 'rgb(var(--color-warning-bg) / <alpha-value>)',
          border: 'rgb(var(--color-warning-border) / <alpha-value>)',
          text: 'rgb(var(--color-warning-text) / <alpha-value>)',
          glow: 'rgb(var(--color-warning-glow) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          bg: 'rgb(var(--color-danger-bg) / <alpha-value>)',
          border: 'rgb(var(--color-danger-border) / <alpha-value>)',
          text: 'rgb(var(--color-danger-text) / <alpha-value>)',
          glow: 'rgb(var(--color-danger-glow) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          bg: 'rgb(var(--color-info-bg) / <alpha-value>)',
          border: 'rgb(var(--color-info-border) / <alpha-value>)',
          text: 'rgb(var(--color-info-text) / <alpha-value>)',
          glow: 'rgb(var(--color-info-glow) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          bg: 'rgb(var(--color-accent-bg) / <alpha-value>)',
          border: 'rgb(var(--color-accent-border) / <alpha-value>)',
          text: 'rgb(var(--color-accent-text) / <alpha-value>)',
          glow: 'rgb(var(--color-accent-glow) / <alpha-value>)',
          orange: '#F97316',
          'orange-light': '#FB923C',
          'orange-dark': '#EA580C',
          'orange-glow': 'rgba(249, 115, 22, 0.15)',
          cyan: '#22F2EF',
          'cyan-light': '#67F5F3',
          'cyan-dark': '#0DD5D2',
          'cyan-glow': 'rgba(34, 242, 239, 0.15)',
          blue: '#3B82F6',
          'blue-light': '#60A5FA',
          purple: '#A855F7',
          'purple-light': '#C084FC',
          red: '#EF4444',
          amber: '#F59E0B',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'hero': ['3.5rem', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        'display': ['2.75rem', { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.02em' }],
        'heading': ['1.875rem', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.01em' }],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
        '5xl': '2rem',
      },
      boxShadow: {
        'glow-mint': '0 0 20px rgba(73, 220, 122, 0.15), 0 0 60px rgba(73, 220, 122, 0.05)',
        'glow-mint-strong': '0 0 30px rgba(73, 220, 122, 0.2), 0 0 80px rgba(73, 220, 122, 0.08)',
        'glow-orange': '0 0 20px rgba(249, 115, 22, 0.15), 0 0 60px rgba(249, 115, 22, 0.05)',
        'glow-orange-strong': '0 0 30px rgba(249, 115, 22, 0.2), 0 0 80px rgba(249, 115, 22, 0.08)',
        'glow-cyan': '0 0 20px rgba(34, 242, 239, 0.12)',
        'glow-cyan-strong': '0 0 30px rgba(34, 242, 239, 0.18), 0 0 80px rgba(34, 242, 239, 0.06)',
        // Theme-aware shadow using the shadow ink var
        'glass': '0 8px 32px rgb(var(--shadow-ink) / 0.18)',
        'glass-lg': '0 16px 48px rgb(var(--shadow-ink) / 0.22)',
        'glass-xl': '0 24px 64px rgb(var(--shadow-ink) / 0.28)',
        'inner-light': 'inset 0 1px 0 rgb(var(--highlight-ink) / 0.06)',
        'inner-light-strong': 'inset 0 1px 0 rgb(var(--highlight-ink) / 0.10), inset 0 -1px 0 rgb(var(--highlight-ink) / 0.02)',
        'liquid': '0 8px 32px rgb(var(--shadow-ink) / 0.18), inset 0 1px 0 rgb(var(--highlight-ink) / 0.08), inset 0 -1px 0 rgb(var(--highlight-ink) / 0.02)',
        'liquid-hover': '0 16px 48px rgb(var(--shadow-ink) / 0.22), inset 0 1px 0 rgb(var(--highlight-ink) / 0.12), inset 0 -1px 0 rgb(var(--highlight-ink) / 0.03)',
      },
      backgroundImage: {
        'glass-gradient':
          'linear-gradient(135deg, rgb(var(--glass-ink) / 0.10) 0%, rgb(var(--glass-ink) / 0.04) 100%)',
        'glass-gradient-hover':
          'linear-gradient(135deg, rgb(var(--glass-ink) / 0.14) 0%, rgb(var(--glass-ink) / 0.06) 100%)',
        'glass-gradient-strong':
          'linear-gradient(135deg, rgb(var(--glass-ink) / 0.12) 0%, rgb(var(--glass-ink) / 0.05) 100%)',
        'liquid-glass':
          'linear-gradient(145deg, rgb(var(--glass-ink) / 0.10) 0%, rgb(var(--glass-ink) / 0.04) 50%, rgb(var(--glass-ink) / 0.07) 100%)',
        'liquid-glass-hover':
          'linear-gradient(145deg, rgb(var(--glass-ink) / 0.14) 0%, rgb(var(--glass-ink) / 0.06) 50%, rgb(var(--glass-ink) / 0.10) 100%)',
        'glow-radial': 'radial-gradient(ellipse at 50% 0%, rgba(73, 220, 122, 0.08) 0%, transparent 70%)',
        'glow-radial-orange': 'radial-gradient(ellipse at 50% 0%, rgba(249, 115, 22, 0.06) 0%, transparent 70%)',
        'glow-radial-cyan': 'radial-gradient(ellipse at 50% 0%, rgba(34, 242, 239, 0.06) 0%, transparent 70%)',
        'specular-highlight':
          'linear-gradient(180deg, rgb(var(--highlight-ink) / 0.08) 0%, transparent 40%)',
        'edge-light':
          'linear-gradient(135deg, rgb(var(--highlight-ink) / 0.12) 0%, transparent 30%, transparent 70%, rgb(var(--highlight-ink) / 0.04) 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(73, 220, 122, 0.1)' },
          '50%': { boxShadow: '0 0 30px rgba(73, 220, 122, 0.2)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
