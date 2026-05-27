import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 品牌色
        primary: {
          DEFAULT: '#ff6b35',
          dark: '#e55a2b',
          light: '#ff8c5a',
        },
        accent: '#ffc107',
        // 功能色
        success: '#4caf50',
        error: '#f44336',
        info: '#2196f3',
        warning: '#ffc107',
        // 使用 CSS 变量
        bg: 'var(--bg)',
        'bg-card': 'var(--bg-card)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-hover': 'var(--bg-hover)',
        text: 'var(--text)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        border: 'var(--border)',
        'border-light': 'var(--border-light)',
        // Surface colors (灰度色系)
        surface: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
        },
        // 勋章等级色
        'badge-lv1': 'var(--badge-lv1)',
        'badge-lv2': 'var(--badge-lv2-start)',
        'badge-lv3': 'var(--badge-lv3-start)',
        'badge-lv4': 'var(--badge-lv4-start)',
        // 称号色
        'title-active': 'var(--title-active)',
        'title-core': 'var(--title-core)',
        'title-mod': 'var(--title-mod)',
        'title-admin': 'var(--title-admin)',
        'title-contributor': 'var(--title-contributor)',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        lg: '8px',
        card: '8px',
        badge: '6px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        modal: 'var(--shadow-modal)',
      },
      fontFamily: {
        sans: 'var(--font-family)',
        mono: 'var(--font-mono)',
      },
      spacing: {
        sidebar: '200px',
        'sidebar-sm': '180px',
        'sidebar-collapsed': '60px',
        'content-max': '640px',
      },
      maxWidth: {
        'content': '640px',
      },
    },
  },
  plugins: [],
  // 使用 CSS 变量的 dark 模式
  darkMode: ['class', '[data-theme="dark"]'],
};

export default config;