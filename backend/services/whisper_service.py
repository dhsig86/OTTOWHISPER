"""
Serviço de transcrição via OpenAI Whisper API.
Sprint 1: Whisper puro (sem diarização) — retorna segmentos com speaker DESCONHECIDO.
Sprint 2: será substituído por diarização pyannote + Whisper alinhados.
"""
import os
import tempfile
import math
from pathlib import Path
from typing import List

from openai import OpenAI

from models.schemas import TranscriptSegment, Speaker

# Limite da API Whisper: 25 MB
WHISPER_MAX_BYTES = 25 * 1024 * 1024
# Modelo a usar
WHISPER_MODEL = "whisper-1"


def get_openai_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY não configurada nas variáveis de ambiente")
    return OpenAI(api_key=api_key)


def transcribe_audio(
    audio_bytes: bytes,
    filename: str,
    language: str = "pt",
) -> tuple[List[TranscriptSegment], float]:
    """
    Transcreve áudio usando Whisper API.
    Retorna (segments, duration_seconds).

    Sprint 1: todos os segmentos com speaker=DESCONHECIDO.
    Sprint 2: diarização pyannote mapeia MÉDICO/PACIENTE.

    Lida com arquivos maiores que 25MB fazendo split em chunks.
    """
    client = get_openai_client()
    size = len(audio_bytes)

    if size > WHISPER_MAX_BYTES:
        # Divide em chunks e transcreve sequencialmente
        return _transcribe_chunked(client, audio_bytes, filename, language)

    return _transcribe_single(client, audio_bytes, filename, language)


def _transcribe_single(
    client: OpenAI,
    audio_bytes: bytes,
    filename: str,
    language: str,
) -> tuple[List[TranscriptSegment], float]:
    """Transcreve um único arquivo (< 25 MB)."""

    suffix = Path(filename).suffix or ".webm"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            response = client.audio.transcriptions.create(
                model=WHISPER_MODEL,
                file=f,
                language=language,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

        segments: List[TranscriptSegment] = []
        duration = float(response.duration or 0)

        for seg in (response.segments or []):
            segments.append(
                TranscriptSegment(
                    speaker=Speaker.DESCONHECIDO,
                    start=float(seg.start),
                    end=float(seg.end),
                    text=seg.text.strip(),
                )
            )

        return segments, duration

    finally:
        os.unlink(tmp_path)


def _transcribe_chunked(
    client: OpenAI,
    audio_bytes: bytes,
    filename: str,
    language: str,
) -> tuple[List[TranscriptSegment], float]:
    """
    Divide áudio em chunks de ~23 MB e transcreve em sequência.
    Os timestamps são ajustados com offset acumulado.
    """
    chunk_size = 23 * 1024 * 1024
    num_chunks = math.ceil(len(audio_bytes) / chunk_size)
    suffix = Path(filename).suffix or ".webm"

    all_segments: List[TranscriptSegment] = []
    total_duration = 0.0

    for i in range(num_chunks):
        chunk = audio_bytes[i * chunk_size : (i + 1) * chunk_size]
        chunk_segments, chunk_duration = _transcribe_single(
            client, chunk, f"chunk_{i}{suffix}", language
        )

        # Ajusta timestamps com offset
        for seg in chunk_segments:
            all_segments.append(
                TranscriptSegment(
                    speaker=seg.speaker,
                    start=seg.start + total_duration,
                    end=seg.end + total_duration,
                    text=seg.text,
                )
            )

        total_duration += chunk_duration

    return all_segments, total_duration


def build_full_transcript(segments: List[TranscriptSegment]) -> str:
    """Constrói o texto corrido a partir dos segmentos."""
    lines = []
    current_speaker = None
    for seg in segments:
        if seg.speaker != current_speaker:
            current_speaker = seg.speaker
            lines.append(f"\n{seg.speaker}: {seg.text}")
        else:
            lines[-1] += f" {seg.text}"
    return "\n".join(lines).strip()
