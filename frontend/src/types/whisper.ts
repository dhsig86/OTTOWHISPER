// ─── Transcrição ────────────────────────────────────────────────────────────

export type Speaker = 'MÉDICO' | 'PACIENTE' | 'DESCONHECIDO'

export interface TranscriptSegment {
  speaker: Speaker
  start: number     // segundos
  end: number
  text: string
}

export interface TranscribeResponse {
  session_id: string
  duration_seconds: number
  segments: TranscriptSegment[]
  full_transcript: string
}

// ─── Resumo Clínico ──────────────────────────────────────────────────────────

export interface ClinicalSummary {
  queixa_principal: string
  hda: string
  exame_fisico: string
  hipotese_diagnostica: string
  conduta: string
}

export interface SummarizeResponse {
  summary: ClinicalSummary
  cid_sugerido: string
  tokens_used: number
}

// ─── Estados do Recorder ────────────────────────────────────────────────────

export type RecorderState = 'idle' | 'recording' | 'paused' | 'processing' | 'done' | 'error'

// ─── Sessão salva ────────────────────────────────────────────────────────────

export interface WhisperSession {
  id: string
  doctor_id: string
  patient_id?: string
  created_at: string
  duration_seconds: number
  full_transcript: string
  segments: TranscriptSegment[]
  summary?: ClinicalSummary
}
