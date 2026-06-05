# OTTO WHISPER — CLAUDE.md

> Contexto operacional para agentes LLM. Atualizado: 2026-06-03. Versão 1.0.0 (Deepgram Nova-2).

---

## O que é este módulo

Escriba médico inteligente para consultas de Otorrinolaringologia. Pipeline completo:

1. **Gravação** — MediaRecorder API (WebM/Ogg) no browser ou upload de arquivo de áudio
2. **Transcrição + Diarização** — **Deepgram Nova-2** (chamada única: transcrição + separação MÉDICO/PACIENTE)
3. **Sumarização** — GPT-4o gera resumo estruturado (QP, HDA, exame físico, hipótese, conduta, CID-10)
4. **Persistência** — Sessões salvas no Firebase Firestore com ownership check por médico

> **Migração v1.0.0:** Substituição de OpenAI Whisper API + pyannote.audio por Deepgram Nova-2.
> Ver `DEEPGRAM_MIGRATION.md` para detalhes completos da migração.

---

## Deploy

| Camada | Plataforma | URL | Porta dev |
|--------|-----------|-----|-----------|
| Frontend | Netlify / Vercel | `https://otto-whisper.netlify.app` | 5179 |
| Backend | **Google Cloud Run** | `https://otto-whisper-api-<hash>.run.app` (pendente deploy) | 8003 |

### Configs de deploy
- **Netlify:** `netlify.toml` na raiz — base: `frontend`, build: `npm run build`, publish: `dist`
- **Vercel:** `frontend/vercel.json` — SPA rewrite + CSP headers
- **Cloud Run:** `backend/Dockerfile` — python:3.11-slim + ffmpeg, PORT=8080, ~200MB imagem
- ~~**Render:** Descontinuado (RAM insuficiente para pyannote — não mais necessário)~~

---

## Build & Test Commands

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # preencher DEEPGRAM_API_KEY, OPENAI_API_KEY
uvicorn main:app --reload --port 8003
python -m pytest tests/                           # Executar testes unitários (Pytest)
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env   # ajustar VITE_API_URL=http://localhost:8003/api
npm run dev            # → http://localhost:5179
npm run build          # tsc && vite build
npm run lint           # eslint src --ext ts,tsx
npm run test           # Executar testes unitários (Vitest)
```

---

## Estrutura de Pastas

```
OTTO WHISPER/
├── backend/
│   ├── main.py                              ← FastAPI v1.0.0: CORS, middleware CSP, todas as rotas
│   ├── services/
│   │   ├── deepgram_service.py              ← transcribe_and_diarize() via Deepgram Nova-2 (PRINCIPAL)
│   │   ├── orl_lexicon.py                   ← Vocabulário ORL para enriquecimento de transcrição
│   │   └── summary_service.py               ← summarize_transcript() via GPT-4o
│   ├── models/
│   │   └── schemas.py                       ← Pydantic: Speaker enum, TranscriptSegment, ClinicalSummary,
│   │                                           TranscribeResponse, SummarizeRequest/Response, WhisperSession
│   ├── middleware/
│   │   └── require_auth.py                  ← verify_firebase_token() — GOOGLE_APPLICATION_CREDENTIALS
│   ├── firebase_db.py                       ← Firestore CRUD: save/get/list/delete session
│   ├── data/
│   │   └── orl_vocabulary.json              ← Léxico ORL (34 KB)
│   ├── Dockerfile                           ← python:3.11-slim + ffmpeg
│   ├── requirements.txt                     ← 8 deps (todas pinadas)
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
│   │   │   ├── ConsentBanner.tsx            ← Consentimento LGPD para gravação
│   │   │   └── Skeleton.tsx                ← Loading skeleton placeholder
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
└── PLANO_OTTO_WHISPER.md                    ← Planejamento de sprints
```

---

## API — Endpoints

### `GET /health`
Health check. Retorna `{ "status": "ok", "service": "otto-whisper", "version": "1.0.0" }`.

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
│  ├─ Deepgram Nova-2 (chamada única) → transcrição + diarização  │
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

## Serviço de Diarização — Deepgram Nova-2

### Estratégia de Atribuição de Papéis
- O speaker que aparece primeiro na timeline → **MÉDICO** (quem abre a consulta)
- O segundo speaker → **PACIENTE**
- Speakers adicionais → **DESCONHECIDO**

### Chamada Única
Deepgram Nova-2 fornece transcrição + diarização em uma única chamada de API, substituindo a pipeline anterior de Whisper API + pyannote.audio.

### Graceful Degradation
Se `DEEPGRAM_API_KEY` não estiver configurado → transcreverá sem diarização, todos os segmentos ficam como `DESCONHECIDO`.

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
    "http://localhost:5179",
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

### Origin Validation (Sprint 2026-06-05)
Todas as mensagens `postMessage` recebidas são validadas contra uma allowlist explícita de origens antes de serem processadas:

```typescript
const ALLOWED_ORIGINS = [
  'https://otto.drdariohart.com',
  'https://ottopwa.vercel.app',
  'https://ottos-plum.vercel.app',
  'http://localhost:5173',
];

// Receber — App.tsx message handler:
if (!ALLOWED_ORIGINS.includes(event.origin)) return;

// Enviar — ready signal:
ALLOWED_ORIGINS.forEach(origin => {
  try { window.parent.postMessage({ type: 'otto-whisper-ready' }, origin); } catch {}
});
```

> ⚠️ **Regra de segurança:** NUNCA usar `'*'` como targetOrigin em `postMessage`. Sempre validar `event.origin` contra `ALLOWED_ORIGINS`.

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
| `DEEPGRAM_API_KEY` | ✅ | Chave API Deepgram para transcrição + diarização |
| `OPENAI_API_KEY` | ✅ | Chave API OpenAI para GPT-4o (sumarização) |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅ prod | Path para JSON do service account Firebase |
| `EXTRA_ALLOWED_ORIGINS` | Não | Origens adicionais CORS, separadas por vírgula |
| `PORT` | Não | Porta do servidor (default: 8080 no Docker) |

> ~~`HUGGINGFACE_TOKEN`~~ — removido (pyannote não mais utilizado)

### Frontend

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `VITE_API_URL` | Não | URL do backend (default: `/api` — usa proxy do vercel.json) |

---

## Dependências principais

### Backend
```
fastapi==0.111.0, uvicorn[standard]==0.30.1, python-multipart
openai==1.57.0                   ← GPT-4o (sumarização apenas)
httpx>=0.27.0                    ← HTTP client para Deepgram API
pydantic==2.7.4                  ← Schemas de request/response
pydub==0.25.1                    ← Conversão de áudio (3GP/AMR → MP3)
firebase-admin==6.5.0            ← Auth + Firestore
```

**Removidos na v1.0.0:** `pyannote.audio`, `torch`, `torchaudio`, `huggingface_hub`

**Dependência de sistema (Docker):** `ffmpeg` (necessário para pydub).

> ✅ Sem pyannote/torch, o backend requer apenas **~200MB RAM** e roda em qualquer free tier.

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
| `Skeleton` | Loading skeleton placeholder durante carregamento |

### Persistência local
- Auto-save em `sessionStorage` (consentimento LGPD) e `localStorage` (`otto_whisper_draft` — rascunho da sessão atual)
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
- ✅ Sprint 5 — **Migração Deepgram Nova-2** (transcrição + diarização unificada, -4.5GB deps)

---

## Pontos de Atenção para Curadoria

1. **Deploy pendente** — Backend precisa ser deploiado no Google Cloud Run (Render descontinuado)
2. **DEEPGRAM_API_KEY** — configurar no Cloud Run antes do primeiro teste
3. **Frontend URL** — após deploy Cloud Run, atualizar `VITE_API_URL` no frontend
4. ~~**Debris e código morto**~~ — ✅ Resolvido: removidos `whisper_service.py`, `diarization_service.py`, `render.yaml`, `grep.exe.stackdump`, `dist/`, `netlify.toml` raíz
5. ~~**Portas dev incorretas**~~ — ✅ Corrigido: vite.config.ts agora usa 5179/8003 (convenção AGENTS.md)
6. **Consentimento LGPD** — `ConsentBanner` usa `sessionStorage`; para compliance total, considerar Firestore
7. **`getDoctorId()` fallback** — Frontend usa `'demo-doctor'` como fallback — em produção depende do postMessage do PWA Shell para token real
8. **Testes Automatizados:** Suíte de testes configurada com Pytest no backend (mocks de API Deepgram, OpenAI e rotas FastAPI) e Vitest no frontend (ConsentBanner e ProgressBar).
9. **`doctor_id` no FormData** — `useTranscription.ts` envia `doctor_id` no FormData mas backend ignora (usa token Firebase) — dead code

---

## Changelog

| Data | Mudança | Commit |
|------|---------|--------|
| 2026-06-05 | `App.tsx` — postMessage origin validation com ALLOWED_ORIGINS adicionada | `8f29e51` |
