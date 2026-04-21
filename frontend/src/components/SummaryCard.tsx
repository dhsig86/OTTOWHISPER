import { useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react'
import type { ClinicalSummary } from '../types/whisper'

interface SummaryCardProps {
  summary: ClinicalSummary
  cidSugerido?: string
  onSummaryChange?: (updated: ClinicalSummary) => void
}

const SECTIONS: { key: keyof ClinicalSummary; label: string; emoji: string }[] = [
  { key: 'queixa_principal',     label: 'Queixa Principal',         emoji: '🩺' },
  { key: 'hda',                  label: 'História da Doença Atual',  emoji: '📋' },
  { key: 'exame_fisico',         label: 'Exame Físico',              emoji: '🔍' },
  { key: 'hipotese_diagnostica', label: 'Hipótese Diagnóstica',      emoji: '🧠' },
  { key: 'conduta',              label: 'Conduta',                   emoji: '💊' },
]

function EditableSection({
  sectionKey, label, emoji, value, onChange,
}: {
  sectionKey: keyof ClinicalSummary
  label: string
  emoji: string
  value: string
  onChange: (key: keyof ClinicalSummary, val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const save = () => {
    onChange(sectionKey, draft.trim() || value)
    setEditing(false)
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (value === 'Não mencionado' && !editing) return null

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-otto-muted">
          {emoji} {label}
        </p>
        {!editing && (
          <button
            onClick={() => { setDraft(value); setEditing(true) }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-otto-muted hover:text-otto-primary"
            title="Editar"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={sectionKey === 'hda' || sectionKey === 'conduta' ? 4 : 2}
            className="w-full text-sm text-otto-text bg-otto-bg border border-otto-primary rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-otto-primary/30"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-otto-primary text-white rounded-lg hover:bg-otto-dark transition-colors"
            >
              <Check size={12} /> Salvar
            </button>
            <button
              onClick={cancel}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-otto-border text-otto-muted rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X size={12} /> Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-otto-text leading-relaxed bg-otto-bg rounded-lg px-3 py-2">
          {value}
        </p>
      )}
    </div>
  )
}

export default function SummaryCard({ summary, cidSugerido, onSummaryChange }: SummaryCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [localSummary, setLocalSummary] = useState<ClinicalSummary>(summary)

  const handleChange = (key: keyof ClinicalSummary, val: string) => {
    const updated = { ...localSummary, [key]: val }
    setLocalSummary(updated)
    onSummaryChange?.(updated)
  }

  return (
    <div className="bg-white rounded-2xl border border-otto-border shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-otto-bg transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-otto-muted uppercase tracking-wider">
            Resumo Clínico
          </span>
          {cidSugerido && (
            <span className="text-xs font-mono bg-otto-light text-otto-dark px-2 py-0.5 rounded-full">
              {cidSugerido}
            </span>
          )}
          <span className="text-xs text-otto-muted italic">(passe o mouse para editar)</span>
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-otto-muted" />
          : <ChevronDown size={16} className="text-otto-muted" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4 animate-fade-in">
          {SECTIONS.map(({ key, label, emoji }) => (
            <EditableSection
              key={key}
              sectionKey={key}
              label={label}
              emoji={emoji}
              value={localSummary[key]}
              onChange={handleChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
