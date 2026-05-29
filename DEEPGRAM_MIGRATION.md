# OTTO WHISPER — Migração para Deepgram Nova-2

> **Data:** 2026-05-29 | **Versão:** 1.0.0  
> **Escopo:** Substituição de OpenAI Whisper API + pyannote.audio por Deepgram Nova-2

---

## Sumário Executivo

O OTTO Whisper migrou seu backend de áudio de uma arquitetura de duas chamadas
(OpenAI Whisper para transcrição + pyannote.audio para diarização local) para uma
arquitetura de **chamada única** usando Deepgram Nova-2, que faz transcrição e
diarização simultaneamente na nuvem.

### Impacto

| Métrica | Antes (pyannote) | Depois (Deepgram) |
|---------|-----------------|-------------------|
| RAM mínima | ~2 GB (torch + pyannote) | ~200 MB |
| Imagem Docker | ~5 GB | ~200 MB |
| Build Docker | ~15 min | ~2 min |
| Chamadas API por áudio | 2 (Whisper + pyannote local) | 1 (Deepgram) |
| Dependências Python | 12 (inclui torch, torchaudio) | 7 |
| Cold start | ~30-60s (carregamento modelo) | ~2-5s |
| Qualidade PT-BR | Excelente (Whisper) | Excelente (Nova-2) |
| Diarização | Boa (pyannote 3.1) | Muito boa (Deepgram nativo) |

### Motivação

1. **pyannote.audio + PyTorch** exigem ~2GB de RAM, incompatível com free tiers
2. O modelo pyannote precisa ser baixado do HuggingFace a cada cold start (~1GB)
3. Deepgram oferece **$200 de crédito inicial** + programa de startups ($100k/ano)
4. Uma chamada API substitui duas, simplificando o código e reduzindo latência

---

## Arquitetura Antes vs Depois

### Antes (v0.2.0)
```
Frontend (React) → POST /api/transcribe/stream
                    │
                    ├── 1. OpenAI Whisper API (transcrição)
                    │     ↓ segmentos sem speaker
                    ├── 2. pyannote.audio LOCAL (diarização)
                    │     ↓ ~2GB RAM, modelo HuggingFace
                    ├── 3. Merge + build transcript
                    └── 4. Firebase persist
```

### Depois (v1.0.0)
```
Frontend (React) → POST /api/transcribe/stream
                    │
                    ├── 1. Deepgram Nova-2 API (transcrição + diarização)
                    │     ↓ segmentos com speaker attribution
                    ├── 2. Merge + build transcript
                    └── 3. Firebase persist
```

---

## Detalhes Técnicos

### Deepgram API — Parâmetros Utilizados

```python
params = {
    "model": "nova-2",           # Modelo mais recente e preciso
    "language": "pt-BR",          # Português brasileiro
    "diarize": "true",            # Separação de falantes
    "punctuate": "true",          # Pontuação automática
    "utterances": "true",         # Blocos de fala (mais natural)
    "smart_format": "true",       # Formatação inteligente
    "keywords": ["otite:1.5", "rinite:1.5", ...]  # Boost ORL
}
```

### Keywords ORL

O módulo `orl_lexicon.py` injeta até 100 termos médicos ORL como keywords Deepgram
com boost de 1.5x. Isso melhora o reconhecimento de termos como "otorrinolaringologia",
"rinoscopia", "audiometria", "PAIR", etc.

### Atribuição de Papéis (Speaker Roles)

Mesma lógica da versão pyannote:
- **Speaker 0** (primeiro a falar) → `MÉDICO` (quem abre a consulta)
- **Speaker 1** → `PACIENTE`
- **Speaker 2+** → `DESCONHECIDO`

### Graceful Fallback

Se `utterances` não estiver disponível na resposta, o serviço usa o transcript
completo com speaker `DESCONHECIDO` (nunca quebra).

---

## Arquivos Modificados

| Ação | Arquivo | Mudança |
|------|---------|---------|
| **CRIADO** | `services/deepgram_service.py` | Novo serviço unificado (transcrição + diarização) |
| **ATUALIZADO** | `requirements.txt` | Removido pyannote, torch, torchaudio, huggingface_hub |
| **ATUALIZADO** | `main.py` | Imports, versão 1.0.0, CORS, fluxo SSE simplificado |
| **ATUALIZADO** | `services/orl_lexicon.py` | Nova função `get_orl_keywords_for_deepgram()` |
| **ATUALIZADO** | `Dockerfile` | Comentários (estrutura mantida — ffmpeg necessário) |
| **MANTIDO** | `services/whisper_service.py` | Backup/referência (não importado) |
| **MANTIDO** | `services/diarization_service.py` | Backup/referência (não importado) |
| **MANTIDO** | `services/summary_service.py` | Continua usando OpenAI GPT-4o |
| **MANTIDO** | `models/schemas.py` | Contrato externo inalterado |

---

## Variáveis de Ambiente

### Novas
```
DEEPGRAM_API_KEY=<chave da API Deepgram>
```

### Mantidas
```
OPENAI_API_KEY=<para GPT-4o summarization>
GOOGLE_APPLICATION_CREDENTIALS=<Firebase service account>
```

### Removidas
```
HUGGINGFACE_TOKEN    ← não mais necessário (pyannote removido)
```

---

## Deploy — Google Cloud Run

### Por que Cloud Run?

- Free tier: 2M requests/mês, 400k GB-seconds de memória
- Sem pyannote, a imagem é ~200MB → cold start de ~2-5s
- Dockerfile já pronto
- Firebase Auth integrado nativamente (mesmo projeto `otto-ecosystem`)
- Região: `southamerica-east1` (São Paulo) para latência mínima

### Passos para Deploy

```bash
# 1. Configurar projeto GCP
gcloud config set project otto-ecosystem

# 2. Build e push da imagem
cd "OTTO WHISPER/backend"
gcloud builds submit --tag gcr.io/otto-ecosystem/otto-whisper-api

# 3. Deploy no Cloud Run
gcloud run deploy otto-whisper-api \
  --image gcr.io/otto-ecosystem/otto-whisper-api \
  --region southamerica-east1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 600 \
  --set-env-vars "DEEPGRAM_API_KEY=xxx,OPENAI_API_KEY=xxx" \
  --set-env-vars "GOOGLE_APPLICATION_CREDENTIALS=/app/firebase-sa.json"
```

### Domínio customizado (opcional)
```bash
gcloud run domain-mappings create \
  --service otto-whisper-api \
  --domain whisper.drdariohart.com \
  --region southamerica-east1
```

---

## Custo Estimado — Deepgram

### Free tier / Crédito inicial
- **$200 de crédito** ao criar conta
- Nova-2 com diarização: ~$0.0059/minuto de áudio

### Estimativa mensal (uso médico)
| Cenário | Consultas/mês | Minutos/mês | Custo Deepgram |
|---------|--------------|-------------|---------------|
| Baixo | 10 | 150 min | ~$0.89 |
| Médio | 50 | 750 min | ~$4.43 |
| Alto | 200 | 3.000 min | ~$17.70 |

### Programa Startups Deepgram
- **$100.000/ano em créditos** para startups em estágio inicial
- Requisitos: < $5M em funding, produto em desenvolvimento
- Aplicação: https://deepgram.com/startups
- **OTTO se qualifica** como plataforma médica em desenvolvimento

---

## Testes

### Teste local
```bash
cd backend
cp .env.example .env
# Configurar DEEPGRAM_API_KEY no .env
uvicorn main:app --reload --port 8003
```

### Teste via curl
```bash
curl -X POST http://localhost:8003/api/transcribe \
  -H "Authorization: Bearer <firebase_token>" \
  -F "audio_file=@consulta.webm" \
  -F "language=pt"
```

### Checklist de validação
- [ ] Health check retorna 200
- [ ] Transcrição de áudio WebM funciona
- [ ] Diarização separa MÉDICO/PACIENTE
- [ ] Merge de segmentos consecutivos funciona
- [ ] Sumarização GPT-4o funciona (não mudou)
- [ ] Sessões salvas no Firebase
- [ ] SSE streaming emite eventos de progresso
- [ ] Keywords ORL aparecem nos logs

---

## Riscos Residuais

1. **DEEPGRAM_API_KEY** deve estar configurada no deploy antes de testar
2. Se Deepgram ficar fora do ar, a transcrição para (sem fallback local)
3. Keywords ORL limitadas a 100 termos (limite prático, não da API)
4. Áudios > 2h não foram testados (limite teórico do Deepgram: 12h)
