/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Public Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      colors: {
        surface: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#030712'
        },
        // Warm welcoming green — replaces the cooler #22C55E. See STYLE_GUIDE.md §2.1.
        brand: {
          50:  '#EDF9F1',
          100: '#D3F1DD',
          200: '#A8E3BB',
          300: '#7CD195',
          400: '#5BC683',
          500: '#37B86C',
          600: '#2A9D5A',
          700: '#22804A',
          800: '#1B6539',
          900: '#144A2C'
        },
        // Aliases — existing components use `accent.*`; resolving to brand keeps
        // them working without edits while shifting to the warmer green.
        accent: {
          DEFAULT: '#37B86C',
          light:   '#5BC683',
          dark:    '#2A9D5A',
          glow:    'rgba(55, 184, 108, 0.3)'
        },
        gain: {
          DEFAULT: '#10B981',
          light: '#10B981',
          bg: 'rgba(16, 185, 129, 0.1)'
        },
        loss: {
          DEFAULT: '#EF4444',
          light: '#EF4444',
          bg: 'rgba(239, 68, 68, 0.1)'
        },
        warn: {
          DEFAULT: '#F59E0B',
          bg: 'rgba(245, 158, 11, 0.1)'
        },
        info: {
          DEFAULT: '#0EA5E9',
          bg: 'rgba(14, 165, 233, 0.1)'
        },
        // Sidebar tokens (see STYLE_GUIDE.md §5). Light values; the dark theme
        // overrides land in index.css via [data-theme="dark"].
        sidebar: {
          bg:                 '#FFFFFF',
          border:             '#EAEBE6',
          item:               '#4B5563',
          'item-hover':       'rgba(0, 0, 0, 0.04)',
          'item-active':      '#D3F1DD',
          'item-active-text': '#1B6539',
          'section-label':    '#9CA3AF'
        },
        // Donut / breakdown chart palette (see STYLE_GUIDE.md §2.4).
        chart: {
          1: '#37B86C',
          2: '#F59E0B',
          3: '#EC4899',
          4: '#8B5CF6',
          5: '#0EA5E9',
          6: '#EF4444'
        }
      },
      boxShadow: {
        'sm-soft': '0 1px 2px rgba(17, 24, 39, 0.04), 0 1px 1px rgba(17, 24, 39, 0.03)',
        'md-soft': '0 4px 14px rgba(17, 24, 39, 0.05), 0 1px 4px rgba(17, 24, 39, 0.04)',
        'lg-soft': '0 12px 32px rgba(17, 24, 39, 0.07), 0 2px 8px rgba(17, 24, 39, 0.04)',
        'xl-soft': '0 24px 56px rgba(17, 24, 39, 0.10), 0 4px 12px rgba(17, 24, 39, 0.05)',
        'glow':    '0 0 0 1px rgba(55, 184, 108, 0.35), 0 8px 28px rgba(55, 184, 108, 0.25)'
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(55, 184, 108, 0.2)' },
          '50%': { boxShadow: '0 0 30px rgba(55, 184, 108, 0.4)' }
        }
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
}
