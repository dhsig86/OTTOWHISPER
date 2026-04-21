# OTTO Whisper — Escrivão Médico Inteligente

Módulo do ecossistema AOTTO para gravação, transcrição e sumarização de consultas médicas em ORL.

## Como rodar localmente

### Backend (FastAPI)
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # preencher OPENAI_API_KEY
uvicorn main:app --reload --port 8001
```

### Frontend (Vite + React)
```bash
cd frontend
npm install
cp .env.example .env   # ajustar VITE_API_URL se necessário
npm run dev   # → http://localhost:5174
```

## Status dos Sprints

- [x] **Sprint 1** — Gravação, Whisper API, tela principal
- [ ] **Sprint 2** — Diarização pyannote (MÉDICO/PACIENTE)
- [ ] **Sprint 3** — Resumo GPT-4o + exportação ProCod/Cases/LAUDO-IA
- [ ] **Sprint 4** — Firebase, histórico de sessões, embed OTTO PWA
