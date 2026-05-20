import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

let authToken: string | null = null

export const setAuthToken = (token: string | null) => {
  authToken = token
}

export const getAuthToken = () => {
  return authToken
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Accept': 'application/json' },
})

// Interceptor: adiciona Bearer token de autenticação
apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`
  }
  return config
})

// Interceptor: loga erros de API no console em dev
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (import.meta.env.DEV) {
      console.error('[OTTO WHISPER API]', error?.response?.data ?? error.message)
    }
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  },
)

