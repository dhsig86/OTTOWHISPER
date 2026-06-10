"""
Utilitários para processamento e fatiamento (chunking) de áudio.
Usa pydub para fatiar áudios longos em blocos compatíveis com as APIs.
"""
import os
import io
import logging
from typing import List, Tuple
from pydub import AudioSegment

logger = logging.getLogger(__name__)

# Limite de tamanho de arquivo seguro (20 MB)
MAX_SAFE_SIZE_BYTES = 20 * 1024 * 1024

# Duração padrão de cada chunk: 10 minutos (600.000 ms)
DEFAULT_CHUNK_DURATION_MS = 10 * 60 * 1000


def should_chunk_audio(audio_bytes: bytes) -> bool:
    """Retorna True se o áudio exceder o limite seguro de 20MB."""
    return len(audio_bytes) > MAX_SAFE_SIZE_BYTES


def chunk_audio_to_mp3(
    audio_bytes: bytes,
    filename: str,
    chunk_duration_ms: int = DEFAULT_CHUNK_DURATION_MS,
) -> List[Tuple[bytes, str, float]]:
    """
    Fatia um arquivo de áudio em chunks de MP3.
    Retorna uma lista de tuplas: (bytes_do_chunk, nome_do_chunk_com_extensao, offset_segundos).
    """
    suffix = os.path.splitext(filename)[1].lower().lstrip(".")
    if not suffix:
        suffix = "webm"

    try:
        logger.info(f"[Audio Chunker] Lendo áudio para fatiamento ({len(audio_bytes)/(1024*1024):.1f}MB)")
        audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=suffix)
        total_duration_ms = len(audio)
        
        chunks: List[Tuple[bytes, str, float]] = []
        base_name = os.path.splitext(filename)[0]
        
        for index, offset_ms in enumerate(range(0, total_duration_ms, chunk_duration_ms)):
            chunk = audio[offset_ms:offset_ms + chunk_duration_ms]
            out = io.BytesIO()
            chunk.export(out, format="mp3")
            
            chunk_bytes = out.getvalue()
            chunk_filename = f"{base_name}_chunk_{index}.mp3"
            offset_seconds = offset_ms / 1000.0
            
            chunks.append((chunk_bytes, chunk_filename, offset_seconds))
            logger.info(f"[Audio Chunker] Gerado {chunk_filename}: dur={len(chunk)/1000.0:.1f}s offset={offset_seconds:.1f}s tamanho={len(chunk_bytes)/(1024*1024):.2f}MB")
            
        return chunks
    except Exception as e:
        logger.error(f"[Audio Chunker] Erro ao fatiar áudio com pydub: {e}")
        # Se falhar por algum motivo de codec, retorna o arquivo inteiro como chunk único no offset 0
        return [(audio_bytes, filename, 0.0)]
