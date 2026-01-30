import { defineConfig } from 'vite'

// GitHub Pages serves your site from /<repo-name>/
// We set base dynamically so it works for any repo name.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
})
