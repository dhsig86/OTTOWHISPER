import { useState, useCallback } from 'react'
import { apiClient } from '../services/api'
import type { WhisperSession } from '../types/whisper'

interface UseSessionsReturn {
  sessions: WhisperSession[]
  isLoading: boolean
  error: string | null
  fetchSessions: (doctorId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<boolean>
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<WhisperSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async (doctorId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<{ sessions: WhisperSession[] }>(
        `/sessions/${doctorId}`,
      )
      setSessions(res.data.sessions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      await apiClient.delete(`/session/${sessionId}`)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      return true
    } catch {
      return false
    }
  }, [])

  return { sessions, isLoading, error, fetchSessions, deleteSession }
}
