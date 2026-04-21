import { Mic, Pause, Play, Square, RotateCcw } from 'lucide-react'
import type { RecorderState } from '../types/whisper'

interface RecorderPanelProps {
  state: RecorderState
  elapsedSeconds: number
  chunkCount?: number
  currentChunkMB?: number
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onReset: () => void
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const STATE_LABELS: Record<RecorderState, string> = {
  idle:       'Pronto para gravar',
  recording:  'Gravando...',
  paused:     'Pausado',
  processing: 'Transcrevendo...',
  done:       'Transcrição concluída',
  error:      'Erro na gravação',
}

export default function RecorderPanel({
  state, elapsedSeconds, chunkCount = 0, currentChunkMB = 0,
  onStart, onPause, onResume, onStop, onReset,
}: RecorderPanelProps) {
  const isRecording = state === 'recording'
  const isPaused    = state === 'paused'
  const isProcessing = state === 'processing'
  const isDone      = state === 'done'
  const isActive    = isRecording || isPaused

  return (
    <div className="bg-white rounded-2xl border border-otto-border shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-otto-muted uppercase tracking-wider">
          Gravação
        </h2>
        {isActive && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-whisper-rec">
            <span className="w-2 h-2 rounded-full bg-whisper-rec animate-pulse-slow" />
            REC
          </span>
        )}
      </div>

      {/* Timer */}
      <div className="text-center my-6">
        <span
          className={`text-5xl font-mono font-bold tracking-tight transition-colors ${
            isRecording ? 'text-otto-text' : 'text-otto-muted'
          }`}
        >
          {formatTime(elapsedSeconds)}
        </span>
        <p className="text-sm text-otto-muted mt-2">{STATE_LABELS[state]}</p>

        {/* Indicador de tamanho e chunks — aparece durante gravação */}
        {isActive && (
          <div className="flex items-center justify-center gap-3 mt-3">
            {/* Barra de uso do chunk atual */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-otto-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    currentChunkMB > 22 ? 'bg-red-500' : 'bg-otto-primary'
                  }`}
                  style={{ width: `${Math.min((currentChunkMB / 24.5) * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs text-otto-muted">
                {currentChunkMB.toFixed(1)} MB
              </span>
            </div>
            {chunkCount > 0 && (
              <span className="text-xs bg-otto-light text-otto-dark px-2 py-0.5 rounded-full font-medium">
                {chunkCount} segmento{chunkCount > 1 ? 's' : ''} salvo{chunkCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Barra de ondas animada (decorativa durante gravação) */}
      {isRecording && (
        <div className="flex items-center justify-center gap-1 mb-6 h-8">
          {[...Array(12)].map((_, i) => (
            <span
              key={i}
              className="w-1 bg-otto-primary rounded-full animate-pulse-slow"
              style={{
                height: `${Math.random() * 24 + 8}px`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Botões */}
      <div className="flex items-center justify-center gap-3 mt-2">
        {/* Botão principal: iniciar / retomar */}
        {(state === 'idle' || isDone) && (
          <button
            onClick={state === 'idle' ? onStart : onReset}
            className="flex items-center gap-2 px-6 py-3 bg-otto-primary text-white rounded-xl font-semibold hover:bg-otto-dark transition-colors shadow-sm"
          >
            {state === 'idle' ? (
              <><Mic size={18} /> Iniciar gravação</>
            ) : (
              <><RotateCcw size={18} /> Nova consulta</>
            )}
          </button>
        )}

        {/* Pausar */}
        {isRecording && (
          <button
            onClick={onPause}
            className="flex items-center gap-2 px-5 py-3 bg-otto-light text-otto-dark rounded-xl font-semibold hover:bg-otto-border transition-colors"
          >
            <Pause size={18} /> Pausar
          </button>
        )}

        {/* Retomar */}
        {isPaused && (
          <button
            onClick={onResume}
            className="flex items-center gap-2 px-5 py-3 bg-otto-light text-otto-dark rounded-xl font-semibold hover:bg-otto-border transition-colors"
          >
            <Play size={18} /> Retomar
          </button>
        )}

        {/* Encerrar */}
        {isActive && (
          <button
            onClick={onStop}
            className="flex items-center gap-2 px-5 py-3 bg-whisper-rec text-white rounded-xl font-semibold hover:bg-red-600 transition-colors shadow-sm"
          >
            <Square size={18} /> Encerrar
          </button>
        )}

        {/* Processando */}
        {isProcessing && (
          <div className="flex items-center gap-3 text-otto-primary font-semibold">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Aguarde — transcrevendo áudio...
          </div>
        )}
      </div>
    </div>
  )
}
