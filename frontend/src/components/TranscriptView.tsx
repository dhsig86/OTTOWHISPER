import { Stethoscope, User } from 'lucide-react'
import type { TranscriptSegment } from '../types/whisper'

interface TranscriptViewProps {
  segments: TranscriptSegment[]
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function SpeakerBadge({ speaker }: { speaker: TranscriptSegment['speaker'] }) {
  const isDoctor = speaker === 'MÉDICO'
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        isDoctor
          ? 'bg-otto-light text-otto-dark'
          : 'bg-indigo-50 text-indigo-700'
      }`}
    >
      {isDoctor ? <Stethoscope size={11} /> : <User size={11} />}
      {speaker}
    </span>
  )
}

export default function TranscriptView({ segments }: TranscriptViewProps) {
  if (segments.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-otto-border shadow-sm p-6">
      <h2 className="text-sm font-semibold text-otto-muted uppercase tracking-wider mb-4">
        Transcrição
      </h2>

      <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
        {segments.map((seg, i) => (
          <div key={i} className="animate-fade-in">
            <div className="flex items-center gap-2 mb-1">
              <SpeakerBadge speaker={seg.speaker} />
              <span className="text-xs text-otto-muted font-mono">
                {formatTime(seg.start)}
              </span>
            </div>
            <p className="text-sm text-otto-text leading-relaxed pl-1">
              {seg.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
