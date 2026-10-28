// Vite build tool settings.
// react()       -> lets Vite understand JSX
// tailwindcss() -> turns the Tailwind classes we use into real CSS
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
