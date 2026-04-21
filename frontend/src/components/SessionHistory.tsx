import { useEffect } from 'react'
import { Clock, Trash2, ChevronRight, Loader2 } from 'lucide-react'
import { useSessions } from '../hooks/useSessions'
import type { WhisperSession } from '../types/whisper'

interface SessionHistoryProps {
  doctorId: string
  onSelect: (session: WhisperSession) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}min ${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function SessionHistory({ doctorId, onSelect }: SessionHistoryProps) {
  const { sessions, isLoading, error, fetchSessions, deleteSession } = useSessions()

  useEffect(() => {
    if (doctorId) fetchSessions(doctorId)
  }, [doctorId, fetchSessions])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-otto-muted gap-2 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Carregando histórico...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 py-4 text-center">
        Não foi possível carregar o histórico.
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="text-sm text-otto-muted py-8 text-center">
        Nenhuma consulta gravada ainda.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-otto-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-otto-border">
        <h2 className="text-sm font-semibold text-otto-muted uppercase tracking-wider flex items-center gap-2">
          <Clock size={14} /> Consultas Anteriores
        </h2>
      </div>

      <ul className="divide-y divide-otto-border">
        {sessions.map(session => (
          <li key={session.id} className="flex items-center gap-3 px-5 py-3 hover:bg-otto-bg transition-colors group">
            <button
              onClick={() => onSelect(session)}
              className="flex-1 text-left"
            >
              <p className="text-sm font-medium text-otto-text">
                {formatDate(session.created_at)}
              </p>
              <p className="text-xs text-otto-muted mt-0.5 flex items-center gap-2">
                <span>{formatDuration(session.duration_seconds)}</span>
                {session.summary?.queixa_principal && (
                  <span className="truncate max-w-[200px]">
                    · {session.summary.queixa_principal}
                  </span>
                )}
              </p>
            </button>

            {/* Ações */}
            <button
              onClick={() => onSelect(session)}
              className="text-otto-muted hover:text-otto-primary transition-colors"
              title="Abrir"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation()
                if (confirm('Deletar esta consulta? Ação irreversível.')) {
                  await deleteSession(session.id)
                }
              }}
              className="opacity-0 group-hover:opacity-100 text-otto-muted hover:text-whisper-rec transition-all"
              title="Deletar (LGPD)"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
