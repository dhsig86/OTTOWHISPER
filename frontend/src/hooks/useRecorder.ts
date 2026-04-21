import { useState, useRef, useCallback, useEffect } from 'react'
import type { RecorderState } from '../types/whisper'

// ─── Constantes ───────────────────────────────────────────────────────────────
// 32kbps = qualidade excelente para voz, ~14MB por hora de áudio
const VOICE_BITRATE = 32_000
// Limite seguro: 24.5MB → força novo chunk antes dos 25MB do Whisper
const CHUNK_SIZE_LIMIT = 24.5 * 1024 * 1024

interface UseRecorderReturn {
  state: RecorderState
  elapsedSeconds: number
  audioBlob: Blob | null
  chunkCount: number          // quantos chunks foram auto-gerados
  currentChunkMB: number      // tamanho do chunk atual em MB (para UI)
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void
  error: string | null
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chunkCount, setChunkCount] = useState(0)
  const [currentChunkMB, setCurrentChunkMB] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const allChunksRef = useRef<Blob[]>([])        // todos os chunks finais (após auto-split)
  const currentChunksRef = useRef<Blob[]>([])    // chunks do segmento atual
  const currentSizeRef = useRef<number>(0)        // bytes acumulados no segmento atual
  const mimeTypeRef = useRef<string>('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const accumulatedRef = useRef<number>(0)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const isStoppingRef = useRef<boolean>(false)    // flag para distinguir stop manual vs auto-chunk

  // ─── Wake Lock ─────────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // Wake Lock negado (bateria crítica, etc.) — gravação continua normalmente
      }
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  // Reativa Wake Lock ao retornar do background (iOS/Android)
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && state === 'recording') {
        await requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [state, requestWakeLock])

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      releaseWakeLock()
    }
  }, [releaseWakeLock])

  // ─── Timer ─────────────────────────────────────────────────────────────────
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
    accumulatedRef.current += Math.floor((Date.now() - startTimeRef.current) / 1000)
  }, [])

  // ─── Inicia novo segmento MediaRecorder (reutiliza stream existente) ────────
  const startSegment = useCallback((stream: MediaStream, mime: string) => {
    currentChunksRef.current = []
    currentSizeRef.current = 0
    setCurrentChunkMB(0)

    const opts: MediaRecorderOptions = { mimeType: mime || undefined }
    if (mime.includes('opus') || mime.includes('webm')) {
      opts.audioBitsPerSecond = VOICE_BITRATE
    }

    const recorder = new MediaRecorder(stream, mime ? opts : { audioBitsPerSecond: VOICE_BITRATE })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return

      currentChunksRef.current.push(e.data)
      currentSizeRef.current += e.data.size
      setCurrentChunkMB(currentSizeRef.current / (1024 * 1024))

      // Auto-chunk: tamanho do segmento atual chegou ao limite
      if (currentSizeRef.current >= CHUNK_SIZE_LIMIT && !isStoppingRef.current) {
        isStoppingRef.current = true
        recorder.stop()  // dispara onstop → salva chunk → inicia próximo segmento
      }
    }

    recorder.onstop = () => {
      if (currentChunksRef.current.length === 0) return

      // Salva segmento como blob completo
      const segBlob = new Blob(currentChunksRef.current, { type: mime || 'audio/webm' })
      allChunksRef.current.push(segBlob)

      if (isStoppingRef.current && streamRef.current?.active) {
        // Foi um auto-chunk — inicia próximo segmento automaticamente
        isStoppingRef.current = false
        setChunkCount(allChunksRef.current.length)
        startSegment(stream, mime)
      } else {
        // Stop manual — consolida tudo
        finalizeRecording(mime)
      }
    }

    recorder.start(1000) // chunk a cada 1s para monitorar tamanho
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finalizeRecording = useCallback((mime: string) => {
    // Concatena todos os segmentos em um único blob para processamento
    const finalBlob = new Blob(allChunksRef.current, { type: mime || 'audio/webm' })
    setAudioBlob(finalBlob)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    releaseWakeLock()
  }, [releaseWakeLock])

  // ─── API pública ────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setError(null)
    allChunksRef.current = []
    isStoppingRef.current = false
    accumulatedRef.current = 0
    setElapsedSeconds(0)
    setAudioBlob(null)
    setChunkCount(0)
    setCurrentChunkMB(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,   // 16kHz suficiente para voz médica
        }
      })
      streamRef.current = stream

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''
      mimeTypeRef.current = mime

      await requestWakeLock()
      startSegment(stream, mime)
      setState('recording')
      startTimer()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao acessar microfone'
      setError(msg)
      setState('error')
    }
  }, [startSegment, startTimer, requestWakeLock])

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
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      isStoppingRef.current = false  // marca como stop manual (não auto-chunk)
      stopTimer()
      mr.stop()
      setState('processing')
    }
  }, [stopTimer])

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    mediaRecorderRef.current = null
    streamRef.current = null
    allChunksRef.current = []
    currentChunksRef.current = []
    currentSizeRef.current = 0
    accumulatedRef.current = 0
    isStoppingRef.current = false
    releaseWakeLock()
    setState('idle')
    setElapsedSeconds(0)
    setAudioBlob(null)
    setError(null)
    setChunkCount(0)
    setCurrentChunkMB(0)
  }, [releaseWakeLock])

  return {
    state, elapsedSeconds, audioBlob,
    chunkCount, currentChunkMB,
    start, pause, resume, stop, reset, error,
  }
}
