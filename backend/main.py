"""
OTTO WHISPER — Backend FastAPI
Sprint 4: sessões Firebase + rotas GET/DELETE + persistência pós-transcrição
"""
import os
import uuid
import json
import asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models.schemas import (
    TranscribeResponse,
    SummarizeRequest,
    SummarizeResponse,
    WhisperSession,
)
from services.whisper_service import transcribe_audio, build_full_transcript
from services.diarization_service import apply_diarization, merge_consecutive_speaker
from services.summary_service import summarize_transcript
from firebase_db import save_session, get_sessions_by_doctor, get_session, delete_session

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="OTTO Whisper API",
    version="0.2.0",
    description="Escrivão médico inteligente — transcrição e sumarização de consultas ORL",
)

# ─── CORS ────────────────────────────────────────────────────────────────────

ALLOWED_ORIGINS = [
    "http://localhost:5174",
    "http://localhost:5173",
    "https://otto-whisper.netlify.app",
    "https://otto.drdariohart.com",
    "https://ottopwa.vercel.app",
]
extra = os.environ.get("EXTRA_ALLOWED_ORIGINS", "")
if extra:
    ALLOWED_ORIGINS.extend(o.strip() for o in extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ─── Iframe headers ───────────────────────────────────────────────────────────

@app.middleware("http")
async def add_iframe_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "ALLOW-FROM https://ottopwa.vercel.app"
    response.headers["Content-Security-Policy"] = (
        "frame-ancestors 'self' https://otto.drdariohart.com https://ottopwa.vercel.app"
    )
    return response

# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "otto-whisper", "version": "0.2.0"}

# ─── Helpers SSE ─────────────────────────────────────────────────────────────

def sse_event(event: str, data: dict) -> str:
    """Formata um evento SSE."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _process_audio_stream(
    audio_bytes: bytes,
    filename: str,
    doctor_id: str,
    patient_id: str | None,
    language: str,
) -> AsyncGenerator[str, None]:
    """
    Generator SSE que emite eventos de progresso enquanto processa o áudio.
    Eventos: progress → result → done | error
    """
    import traceback
    import logging
    logger = logging.getLogger(__name__)

    def progress(step: str, pct: int, message: str):
        return sse_event("progress", {"step": step, "pct": pct, "message": message})

    try:
        size_mb = len(audio_bytes) / (1024 * 1024)
        logger.info(f"[STREAM] Iniciando: arquivo={filename} tamanho={size_mb:.1f}MB doctor={doctor_id}")
        print(f"[STREAM] Iniciando: arquivo={filename} tamanho={size_mb:.1f}MB", flush=True)

        yield progress("iniciando", 5, "Iniciando processamento...")

        if len(audio_bytes) == 0:
            raise ValueError("Arquivo de áudio vazio — nenhum dado recebido")

        # Etapa 1: Transcrição Whisper
        yield progress("transcrevendo", 15, "Transcrevendo áudio com Whisper AI...")
        print(f"[STREAM] Chamando Whisper para {filename}...", flush=True)

        loop = asyncio.get_event_loop()
        segments, duration = await loop.run_in_executor(
            None,
            lambda: transcribe_audio(audio_bytes, filename, language),
        )

        print(f"[STREAM] Whisper OK: {len(segments)} segmentos, {duration:.1f}s", flush=True)
        yield progress("diarizando", 55, "Identificando falantes (Médico / Paciente)...")

        # Etapa 2: Diarização pyannote
        segments = await loop.run_in_executor(
            None,
            lambda: apply_diarization(segments, audio_bytes, lambda s: None),
        )

        yield progress("mesclando", 80, "Mesclando blocos de fala...")
        segments = merge_consecutive_speaker(segments)
        full_transcript = build_full_transcript(segments)

        yield progress("finalizando", 95, "Finalizando transcrição...")

        session_id = str(uuid.uuid4())

        # Persiste no Firebase
        try:
            save_session({
                "id": session_id,
                "doctor_id": doctor_id,
                "patient_id": patient_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": round(duration, 1),
                "full_transcript": full_transcript,
                "segments": [s.model_dump() for s in segments],
            })
        except Exception as db_err:
            print(f"[STREAM] Aviso Firebase: {db_err}", flush=True)

        result = TranscribeResponse(
            session_id=session_id,
            duration_seconds=round(duration, 1),
            segments=segments,
            full_transcript=full_transcript,
        )

        print(f"[STREAM] Concluído: session_id={session_id}", flush=True)
        yield sse_event("result", result.model_dump())
        yield sse_event("done", {"session_id": session_id})

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[STREAM] ERRO: {e}\n{tb}", flush=True)
        logger.error(f"Erro no stream de transcrição: {e}\n{tb}")
        yield sse_event("error", {"message": str(e)})


# ─── POST /api/transcribe (sync — para clientes sem suporte a SSE) ────────────

@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe_endpoint(
    audio_file: UploadFile = File(...),
    doctor_id: str = Form(...),
    patient_id: str = Form(None),
    language: str = Form("pt"),
):
    audio_bytes = await audio_file.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Arquivo de áudio vazio ou muito pequeno")

    try:
        segments, duration = transcribe_audio(
            audio_bytes=audio_bytes,
            filename=audio_file.filename or "consulta.webm",
            language=language,
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro Whisper: {str(e)}")

    segments = apply_diarization(segments, audio_bytes)
    segments = merge_consecutive_speaker(segments)
    full_transcript = build_full_transcript(segments)

    session_id = str(uuid.uuid4())
    result = TranscribeResponse(
        session_id=session_id,
        duration_seconds=round(duration, 1),
        segments=segments,
        full_transcript=full_transcript,
    )

    # Persiste no Firebase (não bloqueia a resposta)
    save_session({
        "id": session_id,
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(duration, 1),
        "full_transcript": full_transcript,
        "segments": [s.model_dump() for s in segments],
    })

    return result


# ─── POST /api/transcribe/stream (SSE com progresso) ─────────────────────────

@app.post("/api/transcribe/stream")
async def transcribe_stream_endpoint(
    audio_file: UploadFile = File(...),
    doctor_id: str = Form(...),
    patient_id: str = Form(None),
    language: str = Form("pt"),
):
    """
    Versão SSE de /api/transcribe.
    Emite eventos de progresso enquanto processa.
    Útil para consultas longas onde o usuário precisa de feedback visual.
    """
    audio_bytes = await audio_file.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Arquivo de áudio muito pequeno")

    return StreamingResponse(
        _process_audio_stream(
            audio_bytes=audio_bytes,
            filename=audio_file.filename or "consulta.webm",
            doctor_id=doctor_id,
            patient_id=patient_id,
            language=language,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # desativa buffer no Nginx/Render
        },
    )


# ─── POST /api/summarize ─────────────────────────────────────────────────────

@app.post("/api/summarize", response_model=SummarizeResponse)
async def summarize_endpoint(body: SummarizeRequest):
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcrição vazia")

    try:
        summary, cid, tokens = summarize_transcript(
            transcript=body.transcript,
            specialty=body.specialty,
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro GPT-4o: {str(e)}")

    return SummarizeResponse(summary=summary, cid_sugerido=cid, tokens_used=tokens)


# ─── GET /api/sessions/{doctor_id} ───────────────────────────────────────────

@app.get("/api/sessions/{doctor_id}")
async def list_sessions(doctor_id: str, limit: int = 20):
    """Lista as sessões mais recentes de um médico."""
    sessions = get_sessions_by_doctor(doctor_id, limit=limit)
    return {"sessions": sessions, "total": len(sessions)}


# ─── GET /api/session/{session_id} ───────────────────────────────────────────

@app.get("/api/session/{session_id}")
async def get_session_endpoint(session_id: str):
    """Retorna uma sessão específica."""
    data = get_session(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return data


# ─── DELETE /api/session/{session_id} ────────────────────────────────────────

@app.delete("/api/session/{session_id}")
async def delete_session_endpoint(session_id: str):
    """Remove uma sessão (direito ao esquecimento — LGPD Art. 18)."""
    ok = delete_session(session_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Erro ao deletar sessão")
    return {"deleted": session_id}
