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
from services.orl_lexicon import get_whisper_prompt_hint

# Limite da API Whisper: 25 MB
WHISPER_MAX_BYTES = 25 * 1024 * 1024
# Modelo a usar
WHISPER_MODEL = "whisper-1"

# Formatos suportados nativamente pelo Whisper API
WHISPER_SUPPORTED = {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"}


def normalize_audio(audio_bytes: bytes, filename: str) -> tuple[bytes, str]:
    """
    Converte formatos não suportados pelo Whisper (ex: .3gp, .amr) para .mp3 via pydub.
    Retorna (bytes_convertido, novo_filename).
    Se o formato já for suportado, retorna os bytes originais sem conversão.
    """
    suffix = Path(filename).suffix.lower()
    if suffix in WHISPER_SUPPORTED:
        return audio_bytes, filename

    try:
        from pydub import AudioSegment
        import io

        fmt = suffix.lstrip(".")
        audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
        out = io.BytesIO()
        audio.export(out, format="mp3")
        new_name = Path(filename).stem + ".mp3"
        return out.getvalue(), new_name
    except Exception as e:
        # Se pydub não conseguir converter, tenta enviar mesmo assim (Whisper pode aceitar)
        print(f"[OTTO Whisper] Aviso: conversão de {suffix} falhou ({e}), enviando original")
        return audio_bytes, filename


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

    # Converte formatos de celular não suportados (3gp, amr) para mp3
    audio_bytes, filename = normalize_audio(audio_bytes, filename)

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
                prompt=get_whisper_prompt_hint(),
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
    Divide áudio em chunks de ~10 minutos via pydub (time-based slicing)
    e transcreve em sequência. Cada chunk é exportado como MP3 válido,
    evitando corrupção de containers de áudio comprimido (.webm, .mp3).
    Os timestamps são ajustados com offset calculado pela posição temporal real.
    """
    import io
    from pydub import AudioSegment

    suffix = Path(filename).suffix.lstrip(".").lower() or "webm"
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=suffix)

    CHUNK_DURATION_MS = 10 * 60 * 1000  # 10 minutos por chunk
    total_len_ms = len(audio)  # duração total em ms
    num_chunks = math.ceil(total_len_ms / CHUNK_DURATION_MS)

    all_segments: List[TranscriptSegment] = []

    for i in range(num_chunks):
        start_ms = i * CHUNK_DURATION_MS
        end_ms = min((i + 1) * CHUNK_DURATION_MS, total_len_ms)
        chunk_audio = audio[start_ms:end_ms]

        # Exporta como MP3 válido com header íntegro
        buf = io.BytesIO()
        chunk_audio.export(buf, format="mp3")
        chunk_bytes = buf.getvalue()

        chunk_segments, _ = _transcribe_single(
            client, chunk_bytes, f"chunk_{i}.mp3", language
        )

        # Offset = posição real no áudio original (em segundos)
        offset_s = start_ms / 1000.0
        for seg in chunk_segments:
            all_segments.append(
                TranscriptSegment(
                    speaker=seg.speaker,
                    start=seg.start + offset_s,
                    end=seg.end + offset_s,
                    text=seg.text,
                )
            )

    total_duration = total_len_ms / 1000.0
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
