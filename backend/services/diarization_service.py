"""
Serviço de diarização de falantes via pyannote.audio.
Identifica Médico vs Paciente no áudio da consulta.

Estratégia de atribuição de papéis:
  - O médico geralmente fala primeiro (abre a consulta).
  - Detectamos qual speaker_label aparece mais cedo → MÉDICO.
  - O outro speaker_label → PACIENTE.
  - Se houver mais de 2 speakers, os demais ficam como DESCONHECIDO.
"""
import os
import tempfile
from pathlib import Path
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

# Importação condicional — pyannote é pesado e pode não estar instalado no Sprint 1
try:
    from pyannote.audio import Pipeline as PyannotePipeline
    PYANNOTE_AVAILABLE = True
except ImportError:
    PYANNOTE_AVAILABLE = False
    logger.warning("pyannote.audio não disponível — diarização desativada (Sprint 1 mode)")

from models.schemas import TranscriptSegment, Speaker

# Cache do pipeline (carregamento caro — ~8s na primeira vez)
_pipeline: Optional[object] = None


def _get_pipeline():
    """Carrega o pipeline pyannote uma única vez e reutiliza."""
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    if not PYANNOTE_AVAILABLE:
        return None

    token = os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        logger.warning("HUGGINGFACE_TOKEN não configurado — diarização desativada")
        return None

    try:
        # Tenta parâmetro novo 'token' (huggingface_hub >= 0.20)
        # Fallback para 'use_auth_token' se versão antiga
        try:
            _pipeline = PyannotePipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                token=token,
            )
        except TypeError:
            _pipeline = PyannotePipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=token,
            )
        logger.info("Pipeline pyannote carregado com sucesso")
        return _pipeline
    except Exception as e:
        logger.error(f"Erro ao carregar pipeline pyannote: {e}")
        return None


def _assign_roles(diarization) -> dict[str, Speaker]:
    """
    Mapeia speaker_labels do pyannote para MÉDICO/PACIENTE.
    O speaker que aparece primeiro é o MÉDICO (quem abre a consulta).
    """
    first_seen: dict[str, float] = {}
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        if speaker not in first_seen:
            first_seen[speaker] = turn.start

    # Ordena por tempo de primeira aparição
    ordered = sorted(first_seen.items(), key=lambda x: x[1])

    role_map: dict[str, Speaker] = {}
    for i, (label, _) in enumerate(ordered):
        if i == 0:
            role_map[label] = Speaker.MEDICO
        elif i == 1:
            role_map[label] = Speaker.PACIENTE
        else:
            role_map[label] = Speaker.DESCONHECIDO

    return role_map


def _find_speaker_at(diarization, timestamp: float, role_map: dict[str, Speaker]) -> Speaker:
    """
    Retorna qual speaker (com papel mapeado) está falando no timestamp dado.
    Usa o centro do segmento Whisper como referência.
    """
    for turn, _, label in diarization.itertracks(yield_label=True):
        if turn.start <= timestamp <= turn.end:
            return role_map.get(label, Speaker.DESCONHECIDO)
    return Speaker.DESCONHECIDO


def apply_diarization(
    segments: List[TranscriptSegment],
    audio_bytes: bytes,
    progress_callback=None,
) -> List[TranscriptSegment]:
    """
    Aplica diarização pyannote sobre os segmentos Whisper.

    Para cada segmento Whisper, usa o ponto médio do timestamp para
    consultar qual speaker estava ativo naquele instante.

    Se pyannote não estiver disponível, retorna os segmentos sem alteração.
    """
    pipeline = _get_pipeline()

    if pipeline is None:
        logger.info("Diarização pulada — retornando segmentos sem label de speaker")
        return segments

    if progress_callback:
        progress_callback("diarizando")

    suffix = ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        diarization = pipeline(tmp_path, num_speakers=2)
    except Exception as e:
        logger.error(f"Erro na diarização: {e} — retornando segmentos sem label")
        return segments
    finally:
        import os as _os
        _os.unlink(tmp_path)

    role_map = _assign_roles(diarization)
    logger.info(f"Papéis mapeados: {role_map}")

    if progress_callback:
        progress_callback("alinhando")

    # Alinha cada segmento Whisper com o speaker do pyannote
    labeled: List[TranscriptSegment] = []
    for seg in segments:
        midpoint = (seg.start + seg.end) / 2
        speaker = _find_speaker_at(diarization, midpoint, role_map)
        labeled.append(
            TranscriptSegment(
                speaker=speaker,
                start=seg.start,
                end=seg.end,
                text=seg.text,
            )
        )

    return labeled


def merge_consecutive_speaker(segments: List[TranscriptSegment]) -> List[TranscriptSegment]:
    """
    Une segmentos consecutivos do mesmo speaker em um único bloco de texto.
    Melhora a legibilidade da transcrição final.
    """
    if not segments:
        return []

    merged: List[TranscriptSegment] = []
    current = segments[0]

    for seg in segments[1:]:
        if seg.speaker == current.speaker:
            current = TranscriptSegment(
                speaker=current.speaker,
                start=current.start,
                end=seg.end,
                text=current.text + " " + seg.text,
            )
        else:
            merged.append(current)
            current = seg

    merged.append(current)
    return merged
