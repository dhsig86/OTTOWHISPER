from fastapi.testclient import TestClient
import pytest
from unittest.mock import MagicMock, patch
from main import app
from middleware.require_auth import verify_firebase_token
from models.schemas import ClinicalSummary

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "otto-whisper",
        "version": "1.0.0"
    }

@patch('main.get_session')
def test_get_session_not_found(mock_get_session):
    mock_get_session.return_value = None
    app.dependency_overrides[verify_firebase_token] = lambda: "doc-123"
    
    response = client.get("/api/session/non-existent-session")
    
    app.dependency_overrides.clear()
    
    assert response.status_code == 404
    assert response.json()["detail"] == "Sessão não encontrada"

@patch('main.get_session')
def test_get_session_authorized(mock_get_session):
    mock_get_session.return_value = {"id": "session-1", "doctor_id": "doc-123", "full_transcript": "test"}
    app.dependency_overrides[verify_firebase_token] = lambda: "doc-123"
    
    response = client.get("/api/session/session-1")
    
    app.dependency_overrides.clear()
    
    assert response.status_code == 200
    assert response.json()["id"] == "session-1"

@patch('main.get_session')
def test_get_session_unauthorized(mock_get_session):
    mock_get_session.return_value = {"id": "session-1", "doctor_id": "other-doc", "full_transcript": "test"}
    app.dependency_overrides[verify_firebase_token] = lambda: "doc-123"
    
    response = client.get("/api/session/session-1")
    
    app.dependency_overrides.clear()
    
    assert response.status_code == 403
    assert response.json()["detail"] == "Acesso não autorizado"

@patch('main.summarize_transcript')
def test_summarize_endpoint(mock_summarize):
    mock_summary = ClinicalSummary(
        queixa_principal="Dor de ouvido",
        hda="Paciente refere dor no ouvido direito",
        exame_fisico="Hiperemia de conduto",
        hipotese_diagnostica="Otite externa",
        conduta="Gotas otologicas"
    )
    mock_summarize.return_value = (mock_summary, "H60.9", 150)
    app.dependency_overrides[verify_firebase_token] = lambda: "doc-123"
    
    payload = {
        "session_id": "session-123",
        "transcript": "Paciente com obstrução nasal e coriza",
        "specialty": "orl"
    }
    
    response = client.post("/api/summarize", json=payload)
    
    app.dependency_overrides.clear()
    
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["summary"]["queixa_principal"] == "Dor de ouvido"
    assert res_data["cid_sugerido"] == "H60.9"
    assert res_data["tokens_used"] == 150
