// Tailwind v4 走独立的 PostCSS 插件；autoprefixer 已内置在 @tailwindcss/postcss 里
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
