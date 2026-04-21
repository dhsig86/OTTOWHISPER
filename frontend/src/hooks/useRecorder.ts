import { useState, useRef, useCallback, useEffect } from 'react'
import type { RecorderState } from '../types/whisper'

interface UseRecorderReturn {
  state: RecorderState
  elapsedSeconds: number
  audioBlob: Blob | null
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
  error: string | null
}

/**
 * Hook que encapsula MediaRecorder para captura de áudio WebM/Opus.
 * Suporta gravar → pausar → retomar → parar.
 * O blob final é acumulado de todos os chunks (incluindo pausas).
 */
export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const accumulatedRef = useRef<number>(0) // segundos acumulados antes de pausas

  // Limpa timer ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const delta = Math.floor((Date.now() - startTimeRef.current) / 1000)
      setElapsedSeconds(accumulatedRef.current + delta)
    }, 500)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    const delta = Math.floor((Date.now() - startTimeRef.current) / 1000)
    accumulatedRef.current += delta
  }, [])

  const start = useCallback(async () => {
    setError(null)
    chunksRef.current = []
    accumulatedRef.current = 0
    setElapsedSeconds(0)
    setAudioBlob(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Prefere WebM/Opus; fallback para o que o browser suportar
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        })
        setAudioBlob(blob)
        // Libera microfone
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      recorder.start(1000) // coleta chunk a cada 1s
      setState('recording')
      startTimer()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao acessar microfone'
      setError(msg)
      setState('error')
    }
  }, [startTimer])

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      setState('paused')
      stopTimer()
    }
  }, [stopTimer])

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      setState('recording')
      startTimer()
    }
  }, [startTimer])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopTimer()
      mediaRecorderRef.current.stop()
      setState('processing')
    }
  }, [stopTimer])

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    mediaRecorderRef.current = null
    streamRef.current = null
    chunksRef.current = []
    accumulatedRef.current = 0
    setState('idle')
    setElapsedSeconds(0)
    setAudioBlob(null)
    setError(null)
  }, [])

  return { state, elapsedSeconds, audioBlob, start, pause, resume, stop, reset, error }
}
