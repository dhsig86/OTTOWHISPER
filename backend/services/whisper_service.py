"""
Serviço de transcrição via OpenAI Whisper API (V1).
Realiza a transcrição simples de áudio sem diarização nativa.
Suporta fatiamento automático (chunking) se o áudio exceder 20MB.
"""
import os
import io
import logging
from typing import List, Tuple

from openai import OpenAI

from models.schemas import TranscriptSegment, Speaker
from services.audio_utils import should_chunk_audio, chunk_audio_to_mp3

logger = logging.getLogger(__name__)


def _get_openai_api_key() -> str:
    """Retorna a chave da API OpenAI ou levanta erro claro."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY não configurada nas variáveis de ambiente. "
            "Configure a chave no arquivo .env."
        )
    return api_key


async def transcribe_with_whisper(
    audio_bytes: bytes,
    filename: str,
    language: str = "pt",
) -> Tuple[List[TranscriptSegment], float]:
    """
    Transcreve áudio usando a API oficial OpenAI Whisper (model='whisper-1').
    Suporta fatiamento automático (chunking) se o áudio exceder 20MB.
    Retorna segmentos consolidados (speaker=DESCONHECIDO) e a duração total em segundos.
    """
    api_key = _get_openai_api_key()
    client = OpenAI(api_key=api_key)

    # Verifica se deve fatiar o áudio
    if should_chunk_audio(audio_bytes):
        logger.info(f"[Whisper V1] Áudio excede 20MB. Fatiando sequencialmente...")
        chunks = chunk_audio_to_mp3(audio_bytes, filename)
        
        all_text_parts = []
        total_duration = 0.0
        
        for chunk_bytes, chunk_filename, offset_seconds in chunks:
            chunk_file = io.BytesIO(chunk_bytes)
            chunk_file.name = chunk_filename
            
            logger.info(f"[Whisper V1] Enviando chunk {chunk_filename} (offset={offset_seconds:.1f}s)...")
            response = client.audio.transcriptions.create(
                model="whisper-1",
                file=chunk_file,
                language=language if language and len(language) == 2 else "pt",
            )
            
            text = response.text.strip()
            if text:
                all_text_parts.append(text)
                
            # Calcula a duração do chunk via pydub de forma segura
            try:
                from pydub import AudioSegment
                chunk_audio = AudioSegment.from_file(io.BytesIO(chunk_bytes), format="mp3")
                total_duration = max(total_duration, offset_seconds + (len(chunk_audio) / 1000.0))
            except Exception:
                total_duration += 600.0 # aproximadamente 10 min por chunk se falhar
                
        full_transcript = " ".join(all_text_parts).strip()
        segments = [
            TranscriptSegment(
                speaker=Speaker.DESCONHECIDO,
                start=0.0,
                end=round(total_duration, 1),
                text=full_transcript,
            )
        ]
        return segments, total_duration

    # Fluxo normal (sem fatiamento)
    duration_seconds = 0.0
    try:
        from pydub import AudioSegment
        suffix = os.path.splitext(filename)[1].lower().lstrip(".")
        if not suffix:
            suffix = "webm"
        
        audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=suffix)
        duration_seconds = len(audio) / 1000.0
        logger.info(f"[Whisper V1] Áudio lido via pydub: {duration_seconds:.1f}s")
    except Exception as e:
        logger.warning(f"[Whisper V1] Falha ao ler duração com pydub ({e}), estimando pelo tamanho")
        duration_seconds = len(audio_bytes) / 16000.0 / 2.0

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    logger.info(f"[Whisper V1] Enviando para OpenAI Whisper API: {filename} ({len(audio_bytes)/(1024*1024):.1f}MB)")
    response = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        language=language if language and len(language) == 2 else "pt",
    )

    transcript_text = response.text.strip()
    logger.info(f"[Whisper V1] Transcrição concluída: {len(transcript_text)} caracteres")

    segments = [
        TranscriptSegment(
            speaker=Speaker.DESCONHECIDO,
            start=0.0,
            end=round(duration_seconds, 1),
            text=transcript_text,
        )
    ]

    return segments, duration_seconds
