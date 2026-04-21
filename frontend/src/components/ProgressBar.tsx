import type { TranscribeProgress } from '../hooks/useTranscription'

interface ProgressBarProps {
  progress: TranscribeProgress
  onCancel?: () => void
}

const STEP_ICONS: Record<string, string> = {
  enviando:     '📤',
  iniciando:    '⚙️',
  transcrevendo:'🎙️',
  diarizando:   '👥',
  alinhando:    '🔗',
  mesclando:    '📝',
  finalizando:  '✅',
}

export default function ProgressBar({ progress, onCancel }: ProgressBarProps) {
  const icon = STEP_ICONS[progress.step] ?? '⏳'

  return (
    <div className="bg-white rounded-2xl border border-otto-border shadow-sm px-6 py-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-otto-text flex items-center gap-2">
          <span>{icon}</span>
          {progress.message}
        </span>
        <span className="text-xs font-mono text-otto-muted">{progress.pct}%</span>
      </div>

      {/* Barra de progresso */}
      <div className="w-full bg-otto-border rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-otto-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress.pct}%` }}
        />
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-3 text-xs text-otto-muted hover:text-whisper-rec transition-colors"
        >
          Cancelar
        </button>
      )}
    </div>
  )
}
