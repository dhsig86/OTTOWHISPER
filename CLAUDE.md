# OTTO WHISPER — CLAUDE.md

> Contexto operacional para sessões Claude/IA.

## O que é este módulo

Escriba médico inteligente. Grava a consulta ORL, transcreve com Whisper (OpenAI), diariza por locutor (médico vs. paciente) e gera um resumo estruturado pronto para prontuário.

## Deploy

| Camada | Plataforma | URL | Porta dev |
|---|---|---|---|
| Frontend | Vercel | (verificar `vercel.json`) | 5174 |
| Backend | Render | `https://otto-whisper.onrender.com` | 8001 |

## Estrutura

```
OTTO WHISPER/
├── backend/
│   ├── main.py                  ← FastAPI entry, CORS
│   ├── routers/
│   │   ├── transcribe.py        ← POST /api/transcribe (Whisper)
│   │   └── summarize.py         ← POST /api/summarize (GPT-4o)
│   ├── services/
│   │   ├── whisper_service.py   ← openai.audio.transcriptions.create
│   │   └── diarize.py           ← pyannote.audio (speaker diarization)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.tsx / main.tsx
    │   ├── components/
    │   │   ├── Recorder.tsx     ← MediaRecorder API, WebM/ogg
    │   │   ├── Transcript.tsx   ← exibição diarizada por locutor
    │   │   └── Summary.tsx      ← resumo estruturado HDA + conduta
    │   └── services/
    │       └── api.ts           ← fetch → backend Render
    └── package.json
```

## Variáveis de Ambiente

### Backend (`.env`)
```
OPENAI_API_KEY=
FRONTEND_URL=https://otto-whisper.vercel.app
FIREBASE_SERVICE_ACCOUNT_JSON=   # para auth (se ativado)
```

### Frontend (`.env.local`)
```
VITE_API_URL=http://localhost:8001
```

## Fluxo principal

```
Médico grava → frontend: MediaRecorder (WebM)
→ POST /api/transcribe (multipart/form-data, audio blob)
→ Whisper → texto + timestamps
→ POST /api/summarize (texto diarizado)
→ GPT-4o → { queixa, hda, exame_fisico, conduta }
→ exibe no frontend como prontuário estruturado
```

## Regras de Segurança

- CORS explícito — sem `*`
- `uid` do Firebase, nunca do body (se auth ativado)
- Áudio não é persistido no servidor — processamento stateless

## Git

```bash
cd "OTTO WHISPER/backend"  && git push origin main
cd "OTTO WHISPER/frontend" && git push origin main
```

## Integração com PROTTO

WHISPER pode exportar o prontuário estruturado diretamente para o PROTTO (via postMessage ou deep link com token de consulta).

## Status das Sprints

- Sprint 1: gravação + transcrição Whisper ✅
- Sprint 2: diarização por locutor (pyannote) ⏳
- Sprint 3: summarização GPT-4o → campos HDA ⏳
- Sprint 4: export para PROTTO ⏳
