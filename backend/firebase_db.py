"""
Persistência de sessões OTTO Whisper no Firebase Firestore.
Segue o padrão já estabelecido no OTTO CALC-HUB.

Coleção: otto_whisper_sessions
Documento: session_id
"""
import os
import logging
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)

_db = None


def get_firestore_client():
    """Singleton do Firestore — seguro para reloads do uvicorn."""
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        # Usa GOOGLE_APPLICATION_CREDENTIALS (env var com path ou JSON inline)
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not cred_path:
            logger.warning(
                "GOOGLE_APPLICATION_CREDENTIALS não configurado — "
                "sessões não serão persistidas no Firebase"
            )
            return None

        try:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        except Exception as e:
            logger.error(f"Erro ao inicializar Firebase: {e}")
            return None

    _db = firestore.client()
    return _db


COLLECTION = "otto_whisper_sessions"


def save_session(session_data: dict) -> bool:
    """
    Salva ou atualiza uma sessão no Firestore.
    Retorna True se salvou com sucesso, False caso contrário.
    """
    db = get_firestore_client()
    if db is None:
        return False

    try:
        session_id = session_data.get("id") or session_data.get("session_id")
        if not session_id:
            logger.error("session_data sem 'id'")
            return False

        db.collection(COLLECTION).document(session_id).set(session_data)
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar sessão: {e}")
        return False


def get_sessions_by_doctor(doctor_id: str, limit: int = 20) -> list[dict]:
    """
    Retorna as sessões mais recentes de um médico.
    """
    db = get_firestore_client()
    if db is None:
        return []

    try:
        docs = (
            db.collection(COLLECTION)
            .where("doctor_id", "==", doctor_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        # Índice ainda não criado → retorna lista vazia (não quebra o app)
        logger.warning(f"Query Firebase falhou (índice pendente?): {e}")
        return []


def get_session(session_id: str) -> Optional[dict]:
    """Retorna uma sessão específica."""
    db = get_firestore_client()
    if db is None:
        return None

    try:
        doc = db.collection(COLLECTION).document(session_id).get()
        return doc.to_dict() if doc.exists else None
    except Exception as e:
        logger.error(f"Erro ao buscar sessão {session_id}: {e}")
        return None


def delete_session(session_id: str) -> bool:
    """Remove uma sessão (direito ao esquecimento — LGPD Art. 18)."""
    db = get_firestore_client()
    if db is None:
        return False

    try:
        db.collection(COLLECTION).document(session_id).delete()
        return True
    except Exception as e:
        logger.error(f"Erro ao deletar sessão {session_id}: {e}")
        return False
