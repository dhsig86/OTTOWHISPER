from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class Speaker(str, Enum):
    MEDICO = "MÉDICO"
    PACIENTE = "PACIENTE"
    DESCONHECIDO = "DESCONHECIDO"


class TranscriptSegment(BaseModel):
    speaker: Speaker = Speaker.DESCONHECIDO
    start: float = Field(..., description="Início do segmento em segundos")
    end: float = Field(..., description="Fim do segmento em segundos")
    text: str


class TranscribeResponse(BaseModel):
    session_id: str
    duration_seconds: float
    segments: List[TranscriptSegment]
    full_transcript: str


class SummarizeRequest(BaseModel):
    session_id: str
    transcript: str
    specialty: str = "ORL"


class ClinicalSummary(BaseModel):
    queixa_principal: str
    hda: str
    exame_fisico: str
    hipotese_diagnostica: str
    conduta: str


class SummarizeResponse(BaseModel):
    summary: ClinicalSummary
    cid_sugerido: str
    tokens_used: int


class WhisperSession(BaseModel):
    id: str
    doctor_id: str
    patient_id: Optional[str] = None
    created_at: str
    duration_seconds: float
    full_transcript: str
    segments: List[TranscriptSegment]
    summary: Optional[ClinicalSummary] = None
