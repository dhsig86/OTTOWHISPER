"""
OTTO WHISPER — Middleware de autenticação Firebase
Padrão: Bearer token do Firebase Auth no header Authorization

Uso:
    from middleware.require_auth import verify_firebase_token
    from fastapi import Depends

    @app.post("/rota-protegida")
    async def rota(uid: str = Depends(verify_firebase_token)):
        ...  # uid é o Firebase UID verificado do médico

Retorna HTTP 401 para tokens ausentes, malformados ou inválidos.
"""
import os
import logging

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)


def _ensure_firebase_initialized() -> None:
    """Garante que o Firebase Admin SDK está inicializado antes de verificar tokens.
    Reutiliza a app já inicializada pelo firebase_db.py se existir."""
    if firebase_admin._apps:
        return

    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        logger.error("[auth] GOOGLE_APPLICATION_CREDENTIALS não configurado")
        raise RuntimeError(
            "Firebase não inicializado — GOOGLE_APPLICATION_CREDENTIALS ausente"
        )
    try:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        logger.info("[auth] Firebase Admin SDK inicializado pelo middleware")
    except Exception as e:
        logger.error(f"[auth] Falha ao inicializar Firebase: {e}")
        raise RuntimeError(f"Erro ao inicializar Firebase: {e}")


async def verify_firebase_token(authorization: str = Header(...)) -> str:
    """
    FastAPI Dependency — verifica Bearer token do Firebase Auth.

    Retorna o uid (str) do médico autenticado.
    Lança HTTPException 401 para qualquer falha de autenticação.

    Uso: uid: str = Depends(verify_firebase_token)
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token Bearer ausente ou mal formatado. "
                   "Use: Authorization: Bearer <firebase_id_token>",
        )

    token = authorization.split("Bearer ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token vazio")

    try:
        _ensure_firebase_initialized()
        decoded = firebase_auth.verify_id_token(token)
        uid: str = decoded["uid"]
        logger.debug(f"[auth] Token válido — uid={uid[:8]}...")
        return uid
    except HTTPException:
        raise
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token Firebase expirado")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Token Firebase inválido")
    except RuntimeError as e:
        logger.error(f"[auth] Erro de configuração: {e}")
        raise HTTPException(status_code=503, detail="Serviço de autenticação indisponível")
    except Exception as e:
        logger.warning(f"[auth] Falha na verificação do token: {e}")
        raise HTTPException(status_code=401, detail="Token Firebase inválido ou expirado")
