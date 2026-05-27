# OTTO WHISPER — CLAUDE.md

> Contexto operacional para agentes LLM. Atualizado: 2025-05-24.

---

## O que é este módulo

Escriba médico inteligente para consultas de Otorrinolaringologia. Pipeline completo:

1. **Gravação** — MediaRecorder API (WebM/Ogg) no browser ou upload de arquivo de áudio
2. **Transcrição** — OpenAI Whisper API (`whisper-1`) com suporte a chunking para arquivos > 25 MB
3. **Diarização** — pyannote.audio (`speaker-diarization-3.1`) para separar MÉDICO vs PACIENTE
4. **Sumarização** — GPT-4o gera resumo estruturado (QP, HDA, exame físico, hipótese, conduta, CID-10)
5. **Persistência** — Sessões salvas no Firebase Firestore com ownership check por médico

---

## Deploy

| Camada | Plataforma | URL | Porta dev |
|--------|-----------|-----|-----------|
| Frontend | Netlify / Vercel | `https://otto-whisper.netlify.app` | 5179 |
| Backend | Render / Cloud Run (Docker) | `https://otto-whisper.onrender.com` | 8003 |

### Configs de deploy
- **Netlify:** `netlify.toml` na raiz — base: `frontend`, build: `npm run build`, publish: `dist`
- **Vercel:** `frontend/vercel.json` — SPA rewrite + CSP headers
- **Render:** `backend/render.yaml` — Docker, starter plan, Oregon, autodeploy
- **Cloud Run:** `backend/Dockerfile` — python:3.11-slim + ffmpeg, PORT=8080

---

## Build & Test Commands

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # preencher OPENAI_API_KEY, HUGGINGFACE_TOKEN
uvicorn main:app --reload --port 8003
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env   # ajustar VITE_API_URL=http://localhost:8003/api
npm run dev            # → http://localhost:5179
npm run build          # tsc && vite build
npm run lint           # eslint src --ext ts,tsx
```

---

## Estrutura de Pastas

```
OTTO WHISPER/
├── backend/
│   ├── main.py                              ← FastAPI: CORS, middleware CSP, todas as rotas
│   ├── services/
│   │   ├── whisper_service.py               ← transcribe_audio(), chunking > 25MB, normalize_audio()
│   │   ├── diarization_service.py           ← apply_diarization(), merge_consecutive_speaker()
│   │   └── summary_service.py               ← summarize_transcript() via GPT-4o
│   ├── models/
│   │   └── schemas.py                       ← Pydantic: Speaker enum, TranscriptSegment, ClinicalSummary,
│   │                                           TranscribeResponse, SummarizeRequest/Response, WhisperSession
│   ├── middleware/
│   │   └── require_auth.py                  ← verify_firebase_token() — GOOGLE_APPLICATION_CREDENTIALS
│   ├── firebase_db.py                       ← Firestore CRUD: save/get/list/delete session
│   ├── Dockerfile                           ← python:3.11-slim + ffmpeg
│   ├── render.yaml                          ← Config Render (starter plan, Docker)
│   ├── requirements.txt                     ← 12 deps (fastapi, openai, pyannote, torch, firebase-admin)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx                          ← Root: postMessage handler, gravação, transcrição, sumarização
│   │   ├── components/
│   │   │   ├── RecorderPanel.tsx            ← Controle de gravação (start/pause/resume/stop)
│   │   │   ├── AudioUploader.tsx            ← Upload de arquivo de áudio (celular)
│   │   │   ├── TranscriptView.tsx           ← Exibição de transcrição diarizada
│   │   │   ├── SummaryCard.tsx              ← Resumo clínico editável
│   │   │   ├── ExportBar.tsx                ← Exportação (copiar, download)
│   │   │   ├── ProgressBar.tsx              ← Barra de progresso SSE
│   │   │   ├── SessionHistory.tsx           ← Lista de sessões anteriores
│   │   │   └── ConsentBanner.tsx            ← Consentimento LGPD para gravação
│   │   ├── hooks/
│   │   │   ├── useRecorder.ts               ← MediaRecorder + chunk management
│   │   │   ├── useTranscription.ts          ← SSE stream + fetch transcribe/summarize
│   │   │   └── useSessions.ts               ← Fetch sessões do backend
│   │   ├── services/
│   │   │   └── api.ts                       ← Axios client + auth interceptor + setAuthToken()
│   │   └── types/
│   │       └── whisper.ts                   ← TypeScript interfaces (Speaker, Segment, Summary, Session)
│   ├── vercel.json                          ← CSP: frame-ancestors + SPA rewrite
│   ├── netlify.toml                         ← Build config + CSP + nosniff + referrer-policy
│   ├── package.json                         ← React 18 + Vite + Tailwind + Axios + lucide-react
│   └── tailwind.config.js
├── DEPLOY.md                                ← Guia completo de deploy (Netlify + Cloud Run + Firebase)
├── PLANO_OTTO_WHISPER.md                    ← Planejamento de sprints
└── netlify.toml                             ← Config raiz Netlify (duplicata do frontend)
```

---

## API — Endpoints

### `GET /health`
Health check. Retorna `{ "status": "ok", "service": "otto-whisper", "version": "0.2.0" }`.

---

### `POST /api/transcribe` 🔒 Firebase Auth
Transcrição síncrona — para clientes sem suporte a SSE.

```
Content-Type: multipart/form-data
Authorization: Bearer <firebase_id_token>

Campos:
  audio_file: File (WebM, MP3, WAV, OGG, FLAC, M4A, MP4; 3GP/AMR convertidos para MP3 via pydub)
  patient_id: string (opcional)
  language: string (default: "pt")

Response: TranscribeResponse
{
  "session_id": "uuid",
  "duration_seconds": 123.4,
  "segments": [
    { "speaker": "MÉDICO", "start": 0.0, "end": 5.2, "text": "..." },
    { "speaker": "PACIENTE", "start": 5.3, "end": 12.1, "text": "..." }
  ],
  "full_transcript": "MÉDICO: ... \nPACIENTE: ..."
}
```

Validação: arquivo < 1000 bytes → HTTP 400.

---

### `POST /api/transcribe/stream` 🔒 Firebase Auth
Transcrição com Server-Sent Events (SSE) — emite progresso em tempo real.

```
Content-Type: multipart/form-data
Authorization: Bearer <firebase_id_token>

Mesmos campos de /api/transcribe.

Response: text/event-stream

Eventos SSE:
  event: progress
  data: { "step": "transcrevendo", "pct": 15, "message": "Transcrevendo áudio com Whisper AI..." }

  event: progress
  data: { "step": "diarizando", "pct": 55, "message": "Identificando falantes (Médico / Paciente)..." }

  event: progress
  data: { "step": "mesclando", "pct": 80, "message": "Mesclando blocos de fala..." }

  event: result
  data: { "session_id": "...", "duration_seconds": ..., "segments": [...], "full_transcript": "..." }

  event: done
  data: { "session_id": "uuid" }

  event: error  (em caso de falha)
  data: { "message": "..." }
```

Fluxo SSE: `iniciando(5%) → transcrevendo(15%) → diarizando(55%) → mesclando(80%) → finalizando(95%) → result → done`

---

### `POST /api/summarize` 🔒 Firebase Auth
Gera resumo clínico estruturado da transcrição via GPT-4o.

```json
// Request: SummarizeRequest
{
  "session_id": "uuid",
  "transcript": "MÉDICO: Boa tarde...\nPACIENTE: Doutor, estou com...",
  "specialty": "ORL"
}

// Response: SummarizeResponse
{
  "summary": {
    "queixa_principal": "Obstrução nasal bilateral há 6 meses",
    "hda": "Paciente refere obstrução progressiva...",
    "exame_fisico": "Rinoscopia anterior: desvio septal...",
    "hipotese_diagnostica": "Desvio de septo nasal (J34.2)",
    "conduta": "Solicitado TC de seios da face..."
  },
  "cid_sugerido": "J34.2",
  "tokens_used": 1250
}
```

---

### `GET /api/sessions` 🔒 Firebase Auth
Lista sessões mais recentes do médico autenticado.

```
Query: ?limit=20 (default)

Response:
{
  "sessions": [...],
  "total": 15
}
```

Filtra automaticamente por `doctor_id` do token.

---

### `GET /api/session/{session_id}` 🔒 Firebase Auth
Retorna sessão específica. **Ownership check:** `data.doctor_id != uid → 403`.

---

### `DELETE /api/session/{session_id}` 🔒 Firebase Auth
Remove sessão (LGPD Art. 18 — direito ao esquecimento). **Ownership check:** `data.doctor_id != uid → 403`.

---

## Pydantic Schemas

```python
class Speaker(str, Enum):
    MEDICO = "MÉDICO"
    PACIENTE = "PACIENTE"
    DESCONHECIDO = "DESCONHECIDO"

class TranscriptSegment(BaseModel):
    speaker: Speaker
    start: float       # segundos
    end: float
    text: str

class TranscribeResponse(BaseModel):
    session_id: str
    duration_seconds: float
    segments: List[TranscriptSegment]
    full_transcript: str

class SummarizeRequest(BaseModel):
    session_id: str
    transcript: str
    specialty: str = "ORL"

class ClinicalSummary(BaseModel):
    queixa_principal: str
    hda: str
    exame_fisico: str
    hipotese_diagnostica: str
    conduta: str

class SummarizeResponse(BaseModel):
    summary: ClinicalSummary
    cid_sugerido: str
    tokens_used: int

class WhisperSession(BaseModel):
    id: str
    doctor_id: str
    patient_id: Optional[str]
    created_at: str
    duration_seconds: float
    full_transcript: str
    segments: List[TranscriptSegment]
    summary: Optional[ClinicalSummary]
```

---

## Fluxo Completo

```
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite)                                         │
│                                                                  │
│  1. Médico grava consulta (MediaRecorder WebM)                  │
│     OU envia arquivo de áudio do celular (MP3, M4A, etc.)       │
│                                                                  │
│  2. Frontend envia via POST /api/transcribe/stream              │
│     → multipart/form-data com Bearer token Firebase              │
│     → Recebe SSE events de progresso (ProgressBar.tsx)           │
│                                                                  │
│  3. Após transcrição, chama POST /api/summarize                 │
│     → Recebe resumo estruturado (SummaryCard.tsx editável)      │
│                                                                  │
│  4. Médico pode exportar (ExportBar.tsx) ou ver histórico       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  BACKEND (FastAPI)                                               │
│                                                                  │
│  POST /api/transcribe/stream                                    │
│  ├─ verify_firebase_token() → doctor_id (uid)                   │
│  ├─ normalize_audio() → converte 3GP/AMR → MP3                  │
│  ├─ Whisper API (whisper-1) → segmentos + timestamps            │
│  │   └─ Se > 25MB: chunking em blocos de 23MB                  │
│  ├─ pyannote.audio → diarização → MÉDICO/PACIENTE              │
│  │   └─ Regra: quem fala primeiro = MÉDICO                     │
│  ├─ merge_consecutive_speaker() → blocos contíguos              │
│  ├─ build_full_transcript() → texto corrido                     │
│  └─ Persiste no Firestore (otto_whisper_sessions)               │
│                                                                  │
│  POST /api/summarize                                            │
│  ├─ verify_firebase_token()                                     │
│  ├─ GPT-4o (json_object, temp=0.2, max_tokens=1500)            │
│  └─ → ClinicalSummary + cid_sugerido                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Serviço de Diarização — Detalhes

### Estratégia de Atribuição de Papéis
- O speaker que aparece primeiro na timeline → **MÉDICO** (quem abre a consulta)
- O segundo speaker → **PACIENTE**
- Speakers adicionais → **DESCONHECIDO**

### Alinhamento Whisper ↔ pyannote
Para cada segmento Whisper, usa o **ponto médio do timestamp** (`(start + end) / 2`) para consultar qual speaker estava ativo naquele instante no resultado da diarização.

### Graceful Degradation
Se `pyannote.audio` não estiver instalado ou `HUGGINGFACE_TOKEN` não configurado → diarização é pulada silenciosamente, todos os segmentos ficam como `DESCONHECIDO`.

---

## Segurança & Auth

### Firebase Auth
- **Dependency:** `middleware/require_auth.py → verify_firebase_token()`
- **Env var:** `GOOGLE_APPLICATION_CREDENTIALS` (path para arquivo .json do service account)
- **Todos os endpoints de API são protegidos** — transcrição, sumarização, sessões, deleção
- `uid` extraído SEMPRE do token Firebase verificado, NUNCA do request body ✅

### Ownership Check
- `GET /api/session/{id}` e `DELETE /api/session/{id}` verificam `data.doctor_id != uid → HTTP 403`
- `GET /api/sessions` filtra automaticamente por `doctor_id` do token

### CORS
Allowlist explícita (NÃO usa `*`):
```python
ALLOWED_ORIGINS = [
    "http://localhost:5174",
    "http://localhost:5173",
    "https://otto-whisper.netlify.app",
    "https://otto.drdariohart.com",
    "https://ottopwa.vercel.app",
]
# + EXTRA_ALLOWED_ORIGINS (env var, separado por vírgula)
```

### CSP / iframe
- **Backend middleware:** `frame-ancestors 'self' https://otto.drdariohart.com https://ottopwa.vercel.app` ✅
- **Frontend vercel.json:** mesma policy ✅
- **Frontend netlify.toml:** mesma policy + `nosniff` + `strict-origin-when-cross-origin` ✅

### LGPD
- Áudio NÃO é persistido no servidor — processamento stateless (tempfile + unlink)
- Transcrição persistida no Firestore vinculada ao `doctor_id`
- `DELETE /api/session/{id}` implementa direito ao esquecimento (Art. 18)
- `ConsentBanner.tsx` no frontend exige consentimento antes de gravar

---

## postMessage API (PWA Shell Integration)

### Recebe do PWA Shell:
```json
{
  "type": "otto-context",
  "payload": {
    "userName": "Dr. Dario",
    "userId": "uid-firebase",
    "firebaseToken": "eyJ..."
  }
}
```
→ `setAuthToken(token)` configura o Axios interceptor para todas as chamadas.

### Envia para o PWA Shell:
```json
{ "type": "otto-whisper-ready" }
```
→ Enviado no mount do App para sinalizar que está pronto para receber contexto.

---

## Firestore — Coleção

**Coleção:** `otto_whisper_sessions`

**Documento:** `{session_id}`

```json
{
  "id": "uuid",
  "doctor_id": "firebase-uid",
  "patient_id": "opcional",
  "created_at": "2024-01-15T14:30:00Z",
  "duration_seconds": 312.5,
  "full_transcript": "MÉDICO: Boa tarde...\nPACIENTE: ...",
  "segments": [
    { "speaker": "MÉDICO", "start": 0.0, "end": 5.2, "text": "..." }
  ]
}
```

**Índice composto necessário:**
- Campo 1: `doctor_id` (Crescente)
- Campo 2: `created_at` (Decrescente)

---

## Variáveis de Ambiente

### Backend

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `OPENAI_API_KEY` | ✅ | Chave API OpenAI para Whisper e GPT-4o |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅ prod | Path para JSON do service account Firebase |
| `HUGGINGFACE_TOKEN` | ✅ prod | Token HuggingFace para pyannote speaker-diarization-3.1 |
| `EXTRA_ALLOWED_ORIGINS` | Não | Origens adicionais CORS, separadas por vírgula |
| `PORT` | Não | Porta do servidor (default: 8080 no Docker) |

### Frontend

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `VITE_API_URL` | Não | URL do backend (default: `/api` — usa proxy do vercel.json) |

---

## Dependências principais

### Backend
```
fastapi==0.111.0, uvicorn[standard]==0.30.1, python-multipart
openai==1.57.0                   ← Whisper API + GPT-4o
pydantic==2.7.4                  ← Schemas de request/response
pydub==0.25.1                    ← Conversão de áudio (3GP/AMR → MP3)
pyannote.audio==3.3.1            ← Diarização de falantes
torch==2.3.1, torchaudio==2.3.1  ← Backend do pyannote
firebase-admin==6.5.0            ← Auth + Firestore
huggingface_hub>=0.19.0          ← Download do modelo pyannote
```

**Dependência de sistema (Docker):** `ffmpeg` (necessário para pydub).

> ⚠️ pyannote.audio + torch requerem pelo menos **2GB RAM**. Cloud Run Starter suporta até 4GB.

### Frontend
```
react@18.3.1, react-dom@18.3.1
axios@1.7.2                      ← HTTP client com interceptors
lucide-react@0.383.0             ← Ícones
tailwindcss@3.4.4                ← Estilização
typescript@5.4.5                 ← Type safety
vite@5.3.1                       ← Build tool
```

---

## Funcionalidades do Frontend

| Componente | Função |
|-----------|--------|
| `RecorderPanel` | Gravação com MediaRecorder (start/pause/resume/stop), timer, chunk management |
| `AudioUploader` | Upload de arquivo de áudio (arrastar ou selecionar) |
| `ProgressBar` | Barra de progresso SSE com status em tempo real |
| `TranscriptView` | Exibição da transcrição diarizada (MÉDICO/PACIENTE) |
| `SummaryCard` | Resumo clínico editável (QP, HDA, exame, hipótese, conduta) |
| `ExportBar` | Copiar para clipboard, download |
| `SessionHistory` | Lista de sessões anteriores do médico |
| `ConsentBanner` | Consentimento LGPD antes de iniciar gravação |

### Persistência local
- Auto-save em `localStorage` (`otto_whisper_draft`) — rascunho da sessão atual
- Carregamento automático do rascunho ao abrir o app

---

## Git & Deploy

```bash
# Backend
cd "OTTO WHISPER/backend" && git push origin main

# Frontend (Netlify autodeploy)
cd "OTTO WHISPER" && git push origin main
```

Consultar `DEPLOY.md` para guia completo de deploy (Netlify + Cloud Run + Firebase + HuggingFace).

---

## Status das Sprints

- ✅ Sprint 1 — Gravação + Whisper API + tela principal
- ✅ Sprint 2 — Diarização pyannote (MÉDICO/PACIENTE)
- ✅ Sprint 3 — Summarização GPT-4o → campos HDA estruturados
- ✅ Sprint 4 — Firebase Firestore + sessões + ownership check + LGPD delete

---

## Pontos de Atenção para Curadoria

1. **Porta dev no AGENTS.md** — WHISPER frontend deveria ser `5179` e backend `8003` (e não 5174/8001 como estava documentado)
2. **CORS backend** — lista de origens inclui `localhost:5174` mas a porta convencionada é `5179`
3. **EXTRA_ALLOWED_ORIGINS** no `render.yaml` está vazio — precisa ser preenchido com URLs de produção
4. **HUGGINGFACE_TOKEN** não está no `render.yaml` — precisa ser adicionado manualmente no painel
5. **Consentimento LGPD** — `ConsentBanner` usa `localStorage` para lembrar o consentimento; para compliance total, considerar armazenar no Firestore
6. **getDoctorId()** no frontend usa `?doctorId` da URL como fallback → `'demo-doctor'` — em produção depende do postMessage do PWA Shell para token real
