/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // OTTO Design Tokens
        'otto-primary':   '#1D9E75',
        'otto-dark':      '#0F6E56',
        'otto-light':     '#E8F7F2',
        'otto-bg':        '#F8FAFA',
        'otto-surface':   '#FFFFFF',
        'otto-border':    '#D1EAE3',
        'otto-muted':     '#6B8E83',
        'otto-text':      '#1A2E2A',
        // OTTO WHISPER — cores específicas
        'whisper-rec':    '#EF4444',   // vermelho de gravação
        'whisper-doc':    '#1D9E75',   // balão médico (verde OTTO)
        'whisper-pat':    '#6366F1',   // balão paciente (indigo)
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
