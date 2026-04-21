import { useState, useCallback, useRef } from 'react'
import { apiClient } from '../services/api'
import type { TranscribeResponse, SummarizeResponse } from '../types/whisper'

export interface TranscribeProgress {
  step: string
  pct: number
  message: string
}

interface UseTranscriptionReturn {
  transcribeAudio: (blob: Blob, doctorId: string, patientId?: string) => Promise<TranscribeResponse | null>
  summarize: (sessionId: string, transcript: string) => Promise<SummarizeResponse | null>
  isTranscribing: boolean
  isSummarizing: boolean
  progress: TranscribeProgress | null
  transcribeError: string | null
  summarizeError: string | null
  cancelTranscription: () => void
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export function useTranscription(): UseTranscriptionReturn {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [progress, setProgress] = useState<TranscribeProgress | null>(null)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)
  const [summarizeError, setSummarizeError] = useState<string | null>(null)

  // Ref para abortar o fetch SSE se o usuário cancelar
  const abortRef = useRef<AbortController | null>(null)

  const cancelTranscription = useCallback(() => {
    abortRef.current?.abort()
    setIsTranscribing(false)
    setProgress(null)
  }, [])

  /**
   * Transcreve áudio via SSE (/api/transcribe/stream).
   * Emite progresso em tempo real e resolve com o resultado completo.
   */
  const transcribeAudio = useCallback(async (
    blob: Blob,
    doctorId: string,
    patientId?: string,
  ): Promise<TranscribeResponse | null> => {
    setIsTranscribing(true)
    setTranscribeError(null)
    setProgress({ step: 'enviando', pct: 2, message: 'Enviando áudio...' })

    const controller = new AbortController()
    abortRef.current = controller

    const formData = new FormData()
    // Se for File (upload de celular), preserva nome original; senão nomeia como consulta gravada
    const filename = blob instanceof File
      ? blob.name
      : blob.type.includes('webm') ? 'consulta.webm' : 'consulta.mp4'
    formData.append('audio_file', blob, filename)
    formData.append('doctor_id', doctorId)
    if (patientId) formData.append('patient_id', patientId)
    formData.append('language', 'pt')

    try {
      const response = await fetch(`${API_BASE}/transcribe/stream`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => 'Erro desconhecido')
        throw new Error(`Erro ${response.status}: ${text}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let result: TranscribeResponse | null = null

      // Parse SSE line-by-line
      const parseSSE = (chunk: string) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            try {
              const data = JSON.parse(raw)
              if (currentEvent === 'progress') {
                setProgress(data as TranscribeProgress)
              } else if (currentEvent === 'result') {
                result = data as TranscribeResponse
              } else if (currentEvent === 'error') {
                throw new Error(data.message ?? 'Erro na transcrição')
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                // JSON incompleto — aguarda próximo chunk
              } else {
                throw e
              }
            }
            currentEvent = ''
          }
        }
      }

      // Lê stream até EOF
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parseSSE(decoder.decode(value, { stream: true }))
      }

      return result

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return null
      const msg = err instanceof Error ? err.message : 'Erro ao transcrever áudio'
      setTranscribeError(msg)
      return null
    } finally {
      setIsTranscribing(false)
      setProgress(null)
    }
  }, [])

  const summarize = useCallback(async (
    sessionId: string,
    transcript: string,
  ): Promise<SummarizeResponse | null> => {
    setIsSummarizing(true)
    setSummarizeError(null)

    try {
      const res = await apiClient.post<SummarizeResponse>('/summarize', {
        session_id: sessionId,
        transcript,
        specialty: 'ORL',
      })
      return res.data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar resumo clínico'
      setSummarizeError(msg)
      return null
    } finally {
      setIsSummarizing(false)
    }
  }, [])

  return {
    transcribeAudio,
    summarize,
    isTranscribing,
    isSummarizing,
    progress,
    transcribeError,
    summarizeError,
    cancelTranscription,
  }
}
