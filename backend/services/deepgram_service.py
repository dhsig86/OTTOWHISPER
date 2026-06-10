"""
Serviço de transcrição + diarização via Deepgram Nova-2 API.
Substitui AMBOS whisper_service.py + diarization_service.py.

O Deepgram faz transcrição e diarização em uma única chamada API,
eliminando a necessidade de pyannote.audio e torch.

Estratégia de atribuição de papéis (mantida da versão pyannote):
  - speaker 0 (primeiro a falar) → MÉDICO (quem abre a consulta)
  - speaker 1 → PACIENTE
  - demais → DESCONHECIDO
"""
import os
import io
import logging
from pathlib import Path
from typing import List

import httpx

from models.schemas import TranscriptSegment, Speaker
from services.orl_lexicon import get_orl_keywords_for_deepgram
from services.audio_utils import should_chunk_audio, chunk_audio_to_mp3

logger = logging.getLogger(__name__)

# Formatos suportados nativamente pelo Deepgram
DEEPGRAM_SUPPORTED = {".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"}

# Mapeamento de extensão para content-type
CONTENT_TYPE_MAP = {
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".mpeg": "audio/mpeg",
    ".mpga": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
}

# Deepgram API
DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen"
DEEPGRAM_TIMEOUT = 300.0  # 5 minutos — áudios longos de consulta


def _get_deepgram_api_key() -> str:
    """Retorna a chave da API Deepgram ou levanta erro claro."""
    api_key = os.environ.get("DEEPGRAM_API_KEY")
    if not api_key:
        raise ValueError(
            "DEEPGRAM_API_KEY não configurada nas variáveis de ambiente. "
            "Configure a variável no .env ou nas configurações de deploy."
        )
    return api_key


def normalize_audio(audio_bytes: bytes, filename: str) -> tuple[bytes, str]:
    """
    Converte formatos não suportados pelo Deepgram (ex: .3gp, .amr) para .mp3 via pydub.
    Retorna (bytes_convertido, novo_filename).
    Se o formato já for suportado, retorna os bytes originais sem conversão.
    """
    suffix = Path(filename).suffix.lower()
    if suffix in DEEPGRAM_SUPPORTED:
        return audio_bytes, filename

    try:
        from pydub import AudioSegment

        fmt = suffix.lstrip(".")
        audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
        out = io.BytesIO()
        audio.export(out, format="mp3")
        new_name = Path(filename).stem + ".mp3"
        converted_bytes = out.getvalue()
        logger.info(f"Áudio convertido de {suffix} para .mp3 ({len(converted_bytes)} bytes)")
        return converted_bytes, new_name
    except Exception as e:
        # Se pydub não conseguir converter, tenta enviar mesmo assim
        logger.warning(f"Conversão de {suffix} falhou ({e}), enviando original")
        return audio_bytes, filename


def _get_content_type(filename: str) -> str:
    """Retorna o content-type correto baseado na extensão do arquivo."""
    suffix = Path(filename).suffix.lower()
    return CONTENT_TYPE_MAP.get(suffix, "audio/mpeg")


def _build_deepgram_params(language: str) -> dict:
    """
    Constrói os parâmetros da query string para a API Deepgram.
    Inclui keywords ORL para boost de termos médicos.
    """
    params = {
        "model": "nova-2",
        "language": language if language and len(language) > 2 else "pt-BR",
        "diarize": "true",
        "punctuate": "true",
        "utterances": "true",
        "smart_format": "true",
    }

    # Normaliza códigos de idioma curtos para formato BCP-47
    lang_map = {
        "pt": "pt-BR",
        "en": "en-US",
        "es": "es-ES",
    }
    if language in lang_map:
        params["language"] = lang_map[language]

    # Injetar keywords ORL do lexicon para melhor reconhecimento de termos médicos
    keywords = get_orl_keywords_for_deepgram()
    if keywords:
        params["keywords"] = keywords

    return params


def _assign_speaker_role(speaker_id: int) -> Speaker:
    """
    Mapeia speaker ID do Deepgram para role clínico.
    Speaker 0 (primeiro a falar) = MÉDICO (quem abre a consulta).
    Speaker 1 = PACIENTE.
    Demais = DESCONHECIDO.
    """
    if speaker_id == 0:
        return Speaker.MEDICO
    elif speaker_id == 1:
        return Speaker.PACIENTE
    else:
        return Speaker.DESCONHECIDO


def _parse_deepgram_response(response_json: dict) -> tuple[List[TranscriptSegment], float]:
    """
    Parseia a resposta da API Deepgram e retorna segmentos com speaker attribution.

    Usa 'utterances' (blocos de fala) em vez de 'words' para criar
    segmentos mais naturais e legíveis.
    """
    results = response_json.get("results", {})
    metadata = response_json.get("metadata", {})

    # Duração total do áudio
    duration = float(metadata.get("duration", 0))

    # Utterances contêm blocos de fala já segmentados pelo Deepgram
    utterances = results.get("utterances", [])

    segments: List[TranscriptSegment] = []

    if utterances:
        for utt in utterances:
            speaker_id = int(utt.get("speaker", -1))
            text = utt.get("transcript", "").strip()
            if not text:
                continue

            segments.append(
                TranscriptSegment(
                    speaker=_assign_speaker_role(speaker_id),
                    start=float(utt.get("start", 0.0)),
                    end=float(utt.get("end", 0.0)),
                    text=text,
                )
            )
    else:
        # Fallback: se utterances não disponíveis, usar transcript completo
        channels = results.get("channels", [])
        if channels:
            alt = channels[0].get("alternatives", [{}])[0]
            full_text = alt.get("transcript", "").strip()
            if full_text:
                segments.append(
                    TranscriptSegment(
                        speaker=Speaker.DESCONHECIDO,
                        start=0.0,
                        end=duration,
                        text=full_text,
                    )
                )
                logger.warning("Utterances não disponíveis — usando transcript completo sem diarização")

async def transcribe_and_diarize(
    audio_bytes: bytes,
    filename: str,
    language: str = "pt",
) -> tuple[List[TranscriptSegment], float]:
    """
    Transcreve e diariza áudio usando Deepgram Nova-2 em uma única chamada API.
    Suporta fatiamento automático (chunking) se o áudio exceder 20MB.
    Retorna (segments, duration_seconds).
    """
    # Verifica se deve fatiar o áudio
    if should_chunk_audio(audio_bytes):
        logger.info(f"[Deepgram Nova-2] Áudio excede 20MB. Fatiando sequencialmente...")
        chunks = chunk_audio_to_mp3(audio_bytes, filename)
        
        all_segments: List[TranscriptSegment] = []
        total_duration = 0.0
        
        for chunk_bytes, chunk_filename, offset_seconds in chunks:
            logger.info(f"[Deepgram Nova-2] Processando chunk {chunk_filename} (offset={offset_seconds:.1f}s)...")
            try:
                # Chama a si mesmo recursivamente para processar o chunk sem fatiar novamente
                chunk_segments, chunk_duration = await _transcribe_single_chunk(chunk_bytes, chunk_filename, language)
                
                # Ajusta as timestamps dos segmentos do chunk
                for seg in chunk_segments:
                    seg.start += offset_seconds
                    seg.end += offset_seconds
                    all_segments.append(seg)
                    
                total_duration = max(total_duration, offset_seconds + chunk_duration)
            except Exception as e:
                logger.error(f"[Deepgram Nova-2] Erro no processamento do chunk {chunk_filename}: {e}")
                
        return all_segments, total_duration

    return await _transcribe_single_chunk(audio_bytes, filename, language)


async def _transcribe_single_chunk(
    audio_bytes: bytes,
    filename: str,
    language: str = "pt",
) -> tuple[List[TranscriptSegment], float]:
    """
    Processamento de um único chunk de áudio (tamanho seguro) na API do Deepgram.
    """
    api_key = _get_deepgram_api_key()

    # Converte formatos de celular não suportados (3gp, amr) para mp3
    audio_bytes, filename = normalize_audio(audio_bytes, filename)

    content_type = _get_content_type(filename)
    params = _build_deepgram_params(language)

    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": content_type,
    }

    size_mb = len(audio_bytes) / (1024 * 1024)
    logger.info(
        f"Enviando para Deepgram: {filename} ({size_mb:.1f}MB) "
        f"content-type={content_type} language={params.get('language')}"
    )

    async with httpx.AsyncClient(timeout=DEEPGRAM_TIMEOUT) as client:
        try:
            response = await client.post(
                DEEPGRAM_API_URL,
                headers=headers,
                params=params,
                content=audio_bytes,
            )
        except httpx.TimeoutException:
            raise ValueError(
                f"Timeout ao processar áudio ({size_mb:.1f}MB). "
                f"O áudio pode ser muito longo. Tente um trecho menor."
            )
        except httpx.ConnectError as e:
            raise ValueError(f"Erro de conexão com Deepgram API: {e}")

    if response.status_code != 200:
        error_detail = response.text[:500] if response.text else "Sem detalhes"
        logger.error(f"Deepgram API erro {response.status_code}: {error_detail}")
        raise ValueError(
            f"Erro na API Deepgram (HTTP {response.status_code}): {error_detail}"
        )

    response_json = response.json()
    segments, duration = _parse_deepgram_response(response_json)

    logger.info(f"Deepgram OK: {len(segments)} segmentos, {duration:.1f}s de áudio")

    return segments, duration


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
