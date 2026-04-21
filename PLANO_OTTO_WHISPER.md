# OTTO WHISPER — Plano de Projeto
> **Data:** 21 de Abril de 2026  
> **Autor:** Claude (Co-worker OTTO Ecosystem)  
> **Status:** Planejamento inicial — greenfield

---

## 1. Visão Geral

**OTTO WHISPER** é o escrivão médico inteligente do ecossistema AOTTO. Grava a consulta completa (médico + paciente), transcreve com alta precisão via **OpenAI Whisper API**, identifica os falantes e entrega ao médico uma **transcrição completa + resumo clínico estruturado** gerado por LLM — tudo em menos de 30 segundos após o fim da gravação.

O módulo será embarcado no **OTTO PWA** como módulo externo (iframe), acessível apenas para o perfil **Médico**, com exportação para OTTO ProCod, OTTO Cases e OTTO LAUDO-IA.

---

## 2. Caso de Uso Principal

```
[Médico inicia gravação] → [Consulta acontece normalmente]
→ [Médico encerra gravação] → [Áudio enviado para Whisper API]
→ [Transcrição retorna com labels de falante]
→ [GPT-4o gera resumo estruturado: QP · HDA · Exame · Conduta]
→ [Médico revisa, edita, exporta para ProCod / Cases / LAUDO-IA]
```

---

## 3. Decisões de Design

| Decisão | Escolha | Justificativa |
|---|---|---|
| Motor de transcrição | OpenAI Whisper API (`whisper-1`) | Alta precisão em PT-BR médico; custo ~$0.006/min; sem infra adicional |
| Diarização (falantes) | Pyannote.audio no backend | Identifica Médico vs Paciente antes de enviar ao Whisper; gratuito com token HuggingFace |
| Sumarização | GPT-4o com prompt clínico ORL | Formata QP, HDA, Exame Físico, Hipótese Diagnóstica, Conduta |
| Frontend | React 18 + TS + Vite + Tailwind | Padrão do ecossistema AOTTO |
| Backend | FastAPI (Python) | Padrão do ecossistema; suporte nativo a pyannote e ffmpeg |
| Gravação no browser | MediaRecorder API (WebM/Opus) | Nativo, sem libs extras; funciona em mobile |
| Deploy | Vercel (frontend) + Render (backend) | Padrão do ecossistema |
| Privacidade | Áudio **não persistido** no servidor; apenas transcrição salva com consentimento | LGPD — dado de saúde exige atenção extra |

---

## 4. Arquitetura

```
otto-whisper/
├── frontend/                      ← React 18 + TS + Vite + Tailwind
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── RecorderPanel.tsx       # Botões gravar/pausar/parar + timer
│   │   │   ├── TranscriptView.tsx      # Visualização da transcrição com labels
│   │   │   ├── SpeakerBadge.tsx        # "Médico" / "Paciente" coloridos
│   │   │   ├── SummaryCard.tsx         # Resumo clínico estruturado
│   │   │   ├── ExportBar.tsx           # Botões: Copiar / ProCod / Cases / LAUDO-IA
│   │   │   ├── SessionHistory.tsx      # Lista de consultas anteriores (Firebase)
│   │   │   └── ConsentBanner.tsx       # LGPD — consentimento do paciente
│   │   ├── hooks/
│   │   │   ├── useRecorder.ts          # MediaRecorder wrapper
│   │   │   ├── useTranscription.ts     # Chama API backend, streaming de status
│   │   │   └── useSessions.ts          # CRUD de sessões no Firebase
│   │   ├── services/
│   │   │   └── api.ts                  # Axios client para o backend
│   │   └── types/
│   │       └── whisper.ts              # Interfaces: Segment, Speaker, Summary
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── vercel.json                     # Headers CSP para iframe no OTTO PWA
│
└── backend/                       ← FastAPI + Python
    ├── main.py                         # Rotas principais
    ├── services/
    │   ├── whisper_service.py          # Chama openai.audio.transcriptions
    │   ├── diarization_service.py      # Pyannote.audio — segmenta falantes
    │   ├── summary_service.py          # GPT-4o com prompt SOAP/ORL
    │   └── export_service.py           # Formata payload p/ ProCod/Cases/LAUDO-IA
    ├── models/
    │   └── schemas.py                  # Pydantic: TranscribeRequest, TranscriptSegment, Summary
    ├── firebase_db.py                  # Persistência de sessões (mesmo padrão do CALC-HUB)
    ├── requirements.txt
    ├── Dockerfile
    └── .env.example
```

---

## 5. API do Backend

### `POST /transcribe`
Recebe o arquivo de áudio, roda diarização, transcreve com Whisper, retorna segmentos com label de falante.

**Request:** `multipart/form-data`
```
audio_file: File         # WebM/Opus/MP3/M4A — máx. 25MB (limite Whisper)
doctor_id: str
patient_id: str (opcional)
language: str = "pt"
```

**Response:**
```json
{
  "session_id": "uuid",
  "duration_seconds": 312,
  "segments": [
    { "speaker": "MÉDICO", "start": 0.0, "end": 8.2, "text": "Bom dia, tudo bem? Qual é o principal..." },
    { "speaker": "PACIENTE", "start": 8.5, "end": 22.1, "text": "Bom dia doutor, estou com dor de ouvido há..." }
  ],
  "full_transcript": "MÉDICO: Bom dia... PACIENTE: Bom dia doutor..."
}
```

### `POST /summarize`
Recebe a transcrição e gera o resumo clínico estruturado.

**Request:**
```json
{
  "session_id": "uuid",
  "transcript": "...",
  "specialty": "ORL"
}
```

**Response:**
```json
{
  "summary": {
    "queixa_principal": "Otalgia direita há 5 dias",
    "hda": "Paciente refere dor em ouvido direito de início há 5 dias...",
    "exame_fisico": "Otoscopia: membrana hiperemiada à direita, cone de luz presente...",
    "hipotese_diagnostica": "Otite média aguda direita (H66.0)",
    "conduta": "Amoxicilina 500mg 8/8h por 7 dias. Retorno em 10 dias."
  },
  "cid_sugerido": "H66.0",
  "tokens_used": 1240
}
```

### `GET /sessions/{doctor_id}`
Lista sessões salvas do médico.

### `GET /sessions/{session_id}/export/{format}`
Formatos: `procod` | `cases` | `laudo`

---

## 6. Prompt Clínico (GPT-4o)

```
Você é um assistente médico especializado em Otorrinolaringologia e Cirurgia de Cabeça e Pescoço.

Receberá a transcrição de uma consulta médica em português brasileiro.
Extraia e estruture as seguintes informações:

1. QUEIXA PRINCIPAL — uma frase objetiva
2. HDA — narrativa cronológica da história da doença atual
3. EXAME FÍSICO — achados relevantes mencionados pelo médico
4. HIPÓTESE DIAGNÓSTICA — diagnóstico(s) provável(is), com CID-10 se possível
5. CONDUTA — prescrição, solicitações de exame, encaminhamentos, retorno

Se alguma seção não estiver presente na transcrição, escreva "Não mencionado".
Mantenha terminologia médica formal. Não invente informações ausentes.
Responda SEMPRE em português brasileiro.

TRANSCRIÇÃO:
{transcript}
```

---

## 7. Fluxo de UX

```
┌─────────────────────────────────────┐
│  OTTO WHISPER                    🎙 │
│  Escrivão Médico Inteligente        │
├─────────────────────────────────────┤
│                                     │
│  [Banner de consentimento LGPD]     │
│  "Esta consulta será gravada para   │
│   transcrição. Paciente ciente?"    │
│  [✓ Confirmar]                      │
│                                     │
│  ┌──────── GRAVAÇÃO ──────────┐     │
│  │   ● REC   00:04:32         │     │
│  │  [⏸ Pausar]  [⏹ Encerrar] │     │
│  └────────────────────────────┘     │
│                                     │
│  [⏳ Transcrevendo... 12s]           │
│                                     │
│  ┌──────── TRANSCRIÇÃO ───────┐     │
│  │ 🩺 MÉDICO  00:00           │     │
│  │ Bom dia, qual é o motivo...│     │
│  │                            │     │
│  │ 👤 PACIENTE  00:08         │     │
│  │ Doutor, estou com dor...   │     │
│  └────────────────────────────┘     │
│                                     │
│  ┌──────── RESUMO CLÍNICO ────┐     │
│  │ QP: Otalgia direita 5 dias │     │
│  │ HDA: ...                   │     │
│  │ Conduta: Amoxicilina...    │     │
│  └────────────────────────────┘     │
│                                     │
│  [📋 Copiar] [ProCod] [Cases] [Laud]│
└─────────────────────────────────────┘
```

---

## 8. Plano de Sprints

### Sprint 1 — Fundação (1 semana)
- [ ] Criar repositório `otto-whisper` com estrutura frontend + backend
- [ ] Configurar Vite + React 18 + TS + Tailwind no frontend
- [ ] Configurar FastAPI + pyannote + OpenAI SDK no backend
- [ ] Implementar `useRecorder.ts` (MediaRecorder → WebM)
- [ ] Implementar `RecorderPanel.tsx` com timer e botões
- [ ] Endpoint `POST /transcribe` funcional (sem diarização ainda — Whisper puro)
- [ ] Deploy inicial: Vercel (frontend) + Render (backend)

### Sprint 2 — Diarização e Transcrição (1 semana)
- [ ] Integrar pyannote.audio para segmentar Médico/Paciente
- [ ] Mapear segmentos pyannote com texto Whisper
- [ ] Implementar `TranscriptView.tsx` com `SpeakerBadge`
- [ ] Tratar limite de 25MB do Whisper — chunking automático para consultas longas
- [ ] Loading state + SSE (Server-Sent Events) para progresso em tempo real

### Sprint 3 — Resumo IA e Exportação (1 semana)
- [ ] Endpoint `POST /summarize` com GPT-4o + prompt clínico ORL
- [ ] Implementar `SummaryCard.tsx` com seções editáveis
- [ ] `ExportBar.tsx` — botão "Copiar" e payloads para ProCod/Cases/LAUDO-IA
- [ ] Banner de consentimento LGPD com dismiss persistido
- [ ] vercel.json com headers CSP para embed no OTTO PWA

### Sprint 4 — Persistência e Histórico (1 semana)
- [ ] Firebase Firestore para salvar sessões (seguir padrão do CALC-HUB)
- [ ] `SessionHistory.tsx` — lista de consultas anteriores
- [ ] Registro no `modules.ts` do OTTO PWA (perfil: `medico`, status: `beta`)
- [ ] Testes de integração end-to-end
- [ ] Auditoria de segurança (áudio não persistido, chaves em env vars)

---

## 9. Stack Completa

**Frontend:**
- React 18 + TypeScript + Vite
- Tailwind CSS (tokens OTTO: `otto-primary #1D9E75`, `otto-bg`, etc.)
- Axios (HTTP client)
- Lucide React (ícones)
- Firebase SDK (sessões)

**Backend:**
- FastAPI + Uvicorn
- `openai` SDK (`whisper-1` + `gpt-4o`)
- `pyannote.audio` (diarização de falantes)
- `pydub` + `ffmpeg` (conversão/chunking de áudio)
- `firebase-admin` (Firestore — padrão ecossistema)
- `python-multipart` (upload de arquivo)

**Deploy:**
- Frontend → Vercel (`otto-whisper.vercel.app`)
- Backend → Render (Docker)
- Áudio → **não persistido** (processado em memória e descartado)

---

## 10. Custos Estimados (OpenAI)

| Cenário | Duração média | Custo Whisper | Custo GPT-4o | Total/consulta |
|---|---|---|---|---|
| Consulta rápida | 10 min | ~$0.06 | ~$0.02 | **~$0.08** |
| Consulta padrão | 20 min | ~$0.12 | ~$0.03 | **~$0.15** |
| Consulta longa | 45 min | ~$0.27 | ~$0.04 | **~$0.31** |

> Preços Whisper API: $0.006/min · GPT-4o: ~$0.005 por 1K tokens de saída

---

## 11. Considerações LGPD

- **Dado de saúde = dado sensível** (Art. 11, LGPD) — exige consentimento explícito
- Banner de consentimento obrigatório antes de cada gravação
- Áudio **nunca** persistido no servidor — processado em memória (RAM) e descartado
- Transcrição salva apenas com consentimento confirmado, vinculada ao `doctor_id`
- Endpoint de exclusão de sessão disponível (`DELETE /sessions/{session_id}`)
- Chaves de API somente via variáveis de ambiente (nunca hardcoded)

---

## 12. Integração com o OTTO PWA

Entrada no `modules.ts`:
```typescript
{
  id: 'whisper',
  name: 'OTTO Whisper',
  description: 'Escrivão médico — transcrição inteligente de consultas',
  icon: '🎙',
  url: 'https://otto-whisper.vercel.app',
  external: true,
  profiles: ['medico'],
  premium: true,
  status: 'coming-soon',   // → 'beta' no Sprint 4
  category: 'clinico',
  tags: ['transcrição', 'ditado', 'prontuário', 'IA']
}
```

---

*Documento gerado em 21/04/2026 — OTTO Ecosystem Co-worker (Claude)*
