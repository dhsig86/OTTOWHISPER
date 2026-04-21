import { useState } from 'react'
import { Copy, Check, ExternalLink, FileText } from 'lucide-react'
import type { ClinicalSummary, TranscriptSegment } from '../types/whisper'

interface ExportBarProps {
  fullTranscript: string
  summary: ClinicalSummary | null
  segments: TranscriptSegment[]
  sessionId?: string
}

function buildPlainText(transcript: string, summary: ClinicalSummary | null): string {
  let text = `OTTO WHISPER — Transcrição de Consulta\n${'─'.repeat(40)}\n\n${transcript}`
  if (summary) {
    text += `\n\n${'─'.repeat(40)}\nRESUMO CLÍNICO\n${'─'.repeat(40)}\n`
    text += `QP: ${summary.queixa_principal}\n`
    text += `HDA: ${summary.hda}\n`
    text += `Exame Físico: ${summary.exame_fisico}\n`
    text += `Hipótese Diagnóstica: ${summary.hipotese_diagnostica}\n`
    text += `Conduta: ${summary.conduta}\n`
  }
  return text
}

/**
 * Monta a URL do ProCod com a transcrição pré-preenchida no campo de relatório.
 * O ProCod aceita query param ?report=... para pré-preencher o campo de texto.
 */
function buildProCodUrl(summary: ClinicalSummary | null): string {
  const base = 'https://procod.drdariohart.com'
  if (!summary) return base
  const report = [
    `QP: ${summary.queixa_principal}`,
    `HDA: ${summary.hda}`,
    `Exame Físico: ${summary.exame_fisico}`,
    `HD: ${summary.hipotese_diagnostica}`,
    `Conduta: ${summary.conduta}`,
  ].join('\n')
  return `${base}?report=${encodeURIComponent(report)}`
}

/**
 * Abre o OTTO Cases com a transcrição como rascunho de caso clínico.
 */
function buildCasesUrl(transcript: string, summary: ClinicalSummary | null): string {
  const base = 'https://cases.drdariohart.com/new'
  const payload = summary
    ? `Diagnóstico: ${summary.hipotese_diagnostica}\n\n${summary.hda}`
    : transcript.slice(0, 500)
  return `${base}?draft=${encodeURIComponent(payload)}`
}

export default function ExportBar({ fullTranscript, summary, segments, sessionId }: ExportBarProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = buildPlainText(fullTranscript, summary)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="bg-white rounded-2xl border border-otto-border shadow-sm p-5">
      <p className="text-xs font-semibold text-otto-muted uppercase tracking-wider mb-3">
        Exportar / Enviar para
      </p>
      <div className="flex flex-wrap gap-2">

        {/* Copiar texto completo */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-otto-light text-otto-dark hover:bg-otto-border transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copiado!' : 'Copiar texto'}
        </button>

        {/* ProCod — relatório médico */}
        <a
          href={buildProCodUrl(summary)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          title="Abrir no OTTO ProCod com resumo pré-preenchido"
        >
          <FileText size={13} />
          ProCod
        </a>

        {/* Cases — relato de caso */}
        <a
          href={buildCasesUrl(fullTranscript, summary)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
          title="Criar rascunho de caso clínico no OTTO Cases"
        >
          <ExternalLink size={13} />
          Cases
        </a>

        {/* LAUDO-IA — em breve */}
        <span
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-violet-50 text-violet-400 cursor-not-allowed"
          title="OTTO LAUDO-IA — disponível em breve"
        >
          <ExternalLink size={13} />
          Laudo IA
          <span className="text-xs bg-violet-100 text-violet-500 px-1.5 py-0.5 rounded-full ml-1">em breve</span>
        </span>

      </div>
    </div>
  )
}
