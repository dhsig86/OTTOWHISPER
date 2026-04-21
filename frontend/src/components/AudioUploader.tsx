import { useRef, useState, useCallback } from 'react'
import { Upload, FileAudio, X, CheckCircle } from 'lucide-react'

// Formatos aceitos pelo Whisper API + formatos de celular comuns
// iPhone: .m4a | Samsung/Android: .m4a .mp3 .3gp .amr | genéricos: .wav .ogg .flac .mp4
const ACCEPTED = '.mp3,.m4a,.wav,.ogg,.flac,.mp4,.mpeg,.mpga,.webm,.3gp,.amr,.aac'
const MAX_MB = 200 // pydub converte antes de enviar ao Whisper (limite real 25MB por chunk)

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getDeviceHint(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'm4a') return 'iPhone / Samsung'
  if (ext === '3gp' || ext === 'amr') return 'Android'
  if (ext === 'mp3') return 'Android / gravador genérico'
  if (ext === 'wav') return 'Gravador de voz'
  return ''
}

interface AudioUploaderProps {
  onAudioReady: (blob: Blob, filename: string) => void
  disabled?: boolean
}

export default function AudioUploader({ onAudioReady, disabled }: AudioUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback((f: File) => {
    setError(null)
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Arquivo muito grande (máx ${MAX_MB} MB). Comprima o áudio antes de enviar.`)
      return
    }
    setFile(f)
  }, [])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const handleSubmit = () => {
    if (!file) return
    onAudioReady(file, file.name)
  }

  const handleRemove = () => {
    setFile(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="bg-white rounded-2xl border border-otto-border p-5 space-y-4">
      <p className="text-xs font-semibold text-otto-muted uppercase tracking-wide">
        Enviar arquivo de áudio
      </p>

      {/* Drop zone */}
      {!file && (
        <div
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-8 cursor-pointer transition-colors select-none
            ${dragging ? 'border-otto-primary bg-red-50' : 'border-otto-border bg-otto-bg hover:border-otto-primary hover:bg-red-50'}
            ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
          `}
        >
          <Upload size={28} className="text-otto-primary" />
          <div className="text-center">
            <p className="text-sm font-medium text-otto-dark">
              Arraste ou clique para selecionar
            </p>
            <p className="text-xs text-otto-muted mt-1">
              iPhone (.m4a) · Samsung (.m4a, .mp3, .3gp) · WAV · OGG · FLAC
            </p>
            <p className="text-xs text-otto-muted">Máximo {MAX_MB} MB</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={onInputChange}
        disabled={disabled}
      />

      {/* Arquivo selecionado */}
      {file && (
        <div className="flex items-start gap-3 bg-otto-light rounded-xl px-4 py-3">
          <FileAudio size={20} className="text-otto-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-otto-dark truncate">{file.name}</p>
            <p className="text-xs text-otto-muted">
              {formatBytes(file.size)}
              {getDeviceHint(file.name) && ` · ${getDeviceHint(file.name)}`}
            </p>
          </div>
          <button
            onClick={handleRemove}
            className="text-otto-muted hover:text-red-500 transition-colors"
            title="Remover"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Erro */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠️ {error}
        </p>
      )}

      {/* Botão enviar */}
      {file && !error && (
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 bg-otto-primary text-white text-sm font-semibold py-3 rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors"
        >
          <CheckCircle size={16} />
          Transcrever arquivo
        </button>
      )}
    </div>
  )
}
