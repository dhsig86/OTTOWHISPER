import { useState, useEffect } from 'react'
import { Mic2, History, X, Upload } from 'lucide-react'
import { useRecorder } from './hooks/useRecorder'
import { useTranscription } from './hooks/useTranscription'
import ConsentBanner, { useConsent } from './components/ConsentBanner'
import RecorderPanel from './components/RecorderPanel'
import AudioUploader from './components/AudioUploader'
import TranscriptView from './components/TranscriptView'
import SummaryCard from './components/SummaryCard'
import ExportBar from './components/ExportBar'
import ProgressBar from './components/ProgressBar'
import SessionHistory from './components/SessionHistory'
import type { TranscriptSegment, ClinicalSummary, WhisperSession } from './types/whisper'

function getDoctorId(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('doctorId') ?? 'demo-doctor'
}

type InputMode = 'record' | 'upload'

export default function App() {
  const { consentGiven, giveConsent } = useConsent()
  const [showHistory, setShowHistory] = useState(false)
  const [inputMode, setInputMode] = useState<InputMode>('record')

  const [, setSessionId] = useState<string>('')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [summary, setSummary] = useState<ClinicalSummary | null>(null)
  const [cidSugerido, setCidSugerido] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)

  const recorder = useRecorder()
  const transcription = useTranscription()
  const doctorId = getDoctorId()

  // Quando áudio fica pronto → transcrever → resumir
  useEffect(() => {
    if (recorder.state !== 'processing' || !recorder.audioBlob) return

    const run = async () => {
      setApiError(null)

      const result = await transcription.transcribeAudio(recorder.audioBlob!, doctorId)
      if (!result) {
        setApiError(transcription.transcribeError ?? 'Erro na transcrição')
        return
      }

      setSessionId(result.session_id)
      setSegments(result.segments)

      const sumResult = await transcription.summarize(result.session_id, result.full_transcript)
      if (sumResult) {
        setSummary(sumResult.summary)
        setCidSugerido(sumResult.cid_sugerido)
      }
    }

    run()
  }, [recorder.state, recorder.audioBlob]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega sessão histórica
  const loadSession = (session: WhisperSession) => {
    setSessionId(session.id)
    setSegments(session.segments)
    setSummary(session.summary ?? null)
    setCidSugerido('')
    setShowHistory(false)
  }

  const handleReset = () => {
    recorder.reset()
    setSegments([])
    setSummary(null)
    setCidSugerido('')
    setSessionId('')
    setApiError(null)
  }

  // Upload de arquivo de celular → mesma pipeline de transcrição
  const handleFileUpload = async (blob: Blob, filename: string) => {
    setApiError(null)
    setSegments([])
    setSummary(null)

    // Cria um File com o nome original para o backend identificar o formato
    const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' })
    const result = await transcription.transcribeAudio(file, doctorId)
    if (!result) {
      setApiError(transcription.transcribeError ?? 'Erro na transcrição do arquivo')
      return
    }
    setSessionId(result.session_id)
    setSegments(result.segments)

    const sumResult = await transcription.summarize(result.session_id, result.full_transcript)
    if (sumResult) {
      setSummary(sumResult.summary)
      setCidSugerido(sumResult.cid_sugerido)
    }
  }

  const isProcessing = transcription.isTranscribing || transcription.isSummarizing
  const isDone = segments.length > 0
  const fullTranscript = segments.map(s => `${s.speaker}: ${s.text}`).join('\n')

  const recorderState = isProcessing ? 'processing' : isDone ? 'done' : recorder.state

  return (
    <div className="min-h-screen bg-otto-bg">
      {/* Consent Banner */}
      {!consentGiven && <ConsentBanner onConfirm={giveConsent} />}

      {/* Header */}
      <header className="bg-white border-b border-otto-border sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-otto-primary flex items-center justify-center">
              <Mic2 size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-otto-text leading-none">OTTO Whisper</h1>
              <p className="text-xs text-otto-muted">Escrivão Médico Inteligente</p>
            </div>
          </div>

          {/* Ações do header */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(p => !p)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-colors ${
                showHistory
                  ? 'bg-otto-primary text-white'
                  : 'bg-otto-light text-otto-dark hover:bg-otto-border'
              }`}
            >
              {showHistory ? <X size={14} /> : <History size={14} />}
              {showHistory ? 'Fechar' : 'Histórico'}
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Painel de histórico (toggle) */}
        {showHistory && (
          <SessionHistory doctorId={doctorId} onSelect={loadSession} />
        )}

        {!showHistory && (
          <>
            {/* Erros */}
            {apiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                ⚠️ {apiError}
              </div>
            )}
            {recorder.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                🎙️ {recorder.error}
              </div>
            )}

            {/* Toggle Gravar / Enviar arquivo */}
            {!isDone && !isProcessing && recorder.state === 'idle' && (
              <div className="flex bg-otto-light rounded-xl p-1 gap-1">
                <button
                  onClick={() => setInputMode('record')}
                  className={`flex-1 flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors ${
                    inputMode === 'record'
                      ? 'bg-white text-otto-primary shadow-sm'
                      : 'text-otto-muted hover:text-otto-dark'
                  }`}
                >
                  <Mic2 size={13} />
                  Gravar consulta
                </button>
                <button
                  onClick={() => setInputMode('upload')}
                  className={`flex-1 flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-lg transition-colors ${
                    inputMode === 'upload'
                      ? 'bg-white text-otto-primary shadow-sm'
                      : 'text-otto-muted hover:text-otto-dark'
                  }`}
                >
                  <Upload size={13} />
                  Enviar arquivo
                </button>
              </div>
            )}

            {/* Recorder */}
            {inputMode === 'record' && (
            <RecorderPanel
              state={recorderState}
              elapsedSeconds={recorder.elapsedSeconds}
              chunkCount={recorder.chunkCount}
              currentChunkMB={recorder.currentChunkMB}
              onStart={recorder.start}
              onPause={recorder.pause}
              onResume={recorder.resume}
              onStop={recorder.stop}
              onReset={handleReset}
            />
            )}

            {/* Upload de arquivo de celular */}
            {inputMode === 'upload' && !isDone && (
              <AudioUploader
                onAudioReady={handleFileUpload}
                disabled={isProcessing}
              />
            )}

            {/* Progresso SSE */}
            {transcription.progress && (
              <ProgressBar
                progress={transcription.progress}
                onCancel={isProcessing ? transcription.cancelTranscription : undefined}
              />
            )}

            {/* Indicador de sumarização (após transcrição) */}
            {transcription.isSummarizing && !transcription.progress && (
              <div className="bg-otto-light rounded-2xl border border-otto-border px-5 py-4">
                <div className="flex items-center gap-3 text-sm text-otto-dark font-medium">
                  <svg className="animate-spin h-4 w-4 text-otto-primary shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Gerando resumo clínico com GPT-4o...
                </div>
              </div>
            )}

            {/* Transcrição */}
            {segments.length > 0 && <TranscriptView segments={segments} />}

            {/* Resumo editável */}
            {summary && (
              <SummaryCard
                summary={summary}
                cidSugerido={cidSugerido}
                onSummaryChange={setSummary}
              />
            )}

            {/* Exportar */}
            {isDone && (
              <ExportBar
                fullTranscript={fullTranscript}
                summary={summary}
              />
            )}

            {!isDone && recorder.state === 'idle' && (
              <p className="text-xs text-center text-otto-muted pt-2">
                Grave uma consulta para iniciar a transcrição automática
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
