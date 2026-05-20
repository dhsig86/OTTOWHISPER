import { useState } from 'react'
import { Copy, Check, ExternalLink, FileText } from 'lucide-react'
import type { ClinicalSummary } from '../types/whisper'

interface ExportBarProps {
  fullTranscript: string
  summary: ClinicalSummary | null
}

// Normaliza \n literal (backslash+n) para newline real — pode vir do LLM ou SSE
function clean(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, ' ').trim()
}

// Copia apenas o resumo estruturado (sem transcrição bruta)
// Fallback para transcrição bruta se o resumo ainda não foi gerado
function buildCopyText(transcript: string, summary: ClinicalSummary | null): string {
  if (!summary) return clean(transcript)
  const NAO_MENCIONADO = 'Não mencionado'
  const lines: string[] = []
  if (summary.queixa_principal !== NAO_MENCIONADO)
    lines.push(`QP: ${clean(summary.queixa_principal)}`)
  if (summary.hda !== NAO_MENCIONADO)
    lines.push(`HDA: ${clean(summary.hda)}`)
  if (summary.exame_fisico !== NAO_MENCIONADO)
    lines.push(`Exame Físico: ${clean(summary.exame_fisico)}`)
  if (summary.hipotese_diagnostica !== NAO_MENCIONADO)
    lines.push(`HD: ${clean(summary.hipotese_diagnostica)}`)
  if (summary.conduta !== NAO_MENCIONADO)
    lines.push(`Conduta: ${clean(summary.conduta)}`)
  return lines.join('\n\n')
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
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const base = isDev ? 'http://localhost:5176' : 'https://otto-cases.vercel.app'
  const payload = summary
    ? `Diagnóstico: ${summary.hipotese_diagnostica}\n\n${summary.hda}`
    : transcript.slice(0, 800)
  return `${base}?draft=${encodeURIComponent(payload)}`
}

export default function ExportBar({ fullTranscript, summary }: ExportBarProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = buildCopyText(fullTranscript, summary)
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
          {copied ? 'Copiado!' : summary ? 'Copiar resumo' : 'Copiar transcrição'}
        </button>

        {/* Enviar ao PROTTO */}
        <button
          onClick={() => {
            const text = buildCopyText(fullTranscript, summary);
            window.parent.postMessage({ type: 'otto-inject-protto', text }, '*');
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          title="Injetar texto no rascunho do OTTO PROTTO"
        >
          <FileText size={13} />
          Enviar ao PROTTO
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
