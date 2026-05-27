# OTTO Whisper — Escrivão Médico Inteligente

> Módulo do ecossistema **AOTTO** para gravação, transcrição e sumarização automática de consultas médicas em Otorrinolaringologia.

---

## 🎯 Proposta Clínica

Na rotina do consultório ORL, o médico precisa simultaneamente examinar o paciente, dialogar sobre sintomas e registrar tudo no prontuário. O **OTTO Whisper** automatiza a etapa de documentação:

1. **Grava a consulta** diretamente no browser ou recebe arquivo de áudio do celular
2. **Transcreve** o áudio com precisão usando Whisper AI (OpenAI)
3. **Identifica quem está falando** — separa automaticamente as falas do MÉDICO e do PACIENTE
4. **Gera um resumo clínico estruturado** pronto para colar no prontuário, com:
   - Queixa Principal
   - História da Doença Atual (HDA)
   - Exame Físico
   - Hipótese Diagnóstica (com CID-10)
   - Conduta

> O médico deixa de ser o escriba da consulta e pode focar integralmente no paciente.

---

## 🔬 Como Funciona

### Fluxo Completo

```
🎙️ Gravar consulta                    📱 Enviar áudio do celular
     │                                        │
     ▼                                        ▼
┌─────────────────────────────────────────────────┐
│  1. TRANSCRIÇÃO (Whisper AI)                    │
│     Áudio → Texto com timestamps por segmento   │
│     Suporta: WebM, MP3, WAV, M4A, OGG, FLAC   │
│     Converte automaticamente: 3GP, AMR → MP3    │
│     Áudios > 25MB: divididos em blocos          │
│     Progresso em tempo real via SSE              │
├─────────────────────────────────────────────────┤
│  2. DIARIZAÇÃO (pyannote.audio)                 │
│     Identifica quem está falando em cada trecho │
│     Quem fala primeiro → MÉDICO                 │
│     Segundo falante → PACIENTE                  │
│     Blocos consecutivos são mesclados            │
├─────────────────────────────────────────────────┤
│  3. SUMARIZAÇÃO (GPT-4o)                        │
│     Gera prontuário estruturado:                │
│     • Queixa Principal                          │
│     • HDA (narrativa cronológica)               │
│     • Exame Físico (achados mencionados)        │
│     • Hipótese Diagnóstica (com CID-10)         │
│     • Conduta (prescrição, exames, retorno)     │
└─────────────────────────────────────────────────┘
     │
     ▼
📋 Resumo editável → Exportar / Copiar para prontuário
```

### Acompanhamento em Tempo Real

Durante o processamento, o médico acompanha o progresso passo a passo na tela:

| Etapa | Progresso | Mensagem |
|-------|-----------|----------|
| Iniciando | 5% | Iniciando processamento... |
| Transcrevendo | 15% | Transcrevendo áudio com Whisper AI... |
| Diarizando | 55% | Identificando falantes (Médico / Paciente)... |
| Mesclando | 80% | Mesclando blocos de fala... |
| Finalizando | 95% | Finalizando transcrição... |

---

## 📋 Recursos Principais

- **Gravação direta no browser** — sem instalar nada, funciona no celular e desktop
- **Upload de arquivo** — aceita gravações feitas no celular (MP3, M4A, WAV, etc.)
- **Transcrição em português** — modelo Whisper otimizado para português brasileiro
- **Identificação de falantes** — separa MÉDICO vs PACIENTE automaticamente
- **Resumo clínico editável** — campos estruturados que o médico pode ajustar antes de exportar
- **CID-10 sugerido** — sugestão automática do código CID mais provável
- **Histórico de sessões** — acessa transcrições anteriores no Firebase
- **Consentimento LGPD** — banner de consentimento antes de iniciar gravação
- **Direito ao esquecimento** — sessões podem ser excluídas permanentemente
- **Rascunho automático** — salvamento local para não perder trabalho em caso de queda de conexão
- **Integração com OTTO PWA** — funciona como iframe dentro do shell principal

---

## ⚕️ Conformidade e Segurança

| Aspecto | Implementação |
|---------|---------------|
| **LGPD** | Áudio não é armazenado no servidor (processamento stateless). Consentimento explícito. Direito ao esquecimento implementado. |
| **CFM** | Resumos são sugestivos — o médico revisa e edita antes de usar. Nenhuma informação é adicionada automaticamente ao prontuário sem revisão. |
| **Autenticação** | Todos os endpoints protegidos por Firebase Auth. Token verificado no servidor. |
| **Isolamento** | Cada médico só acessa suas próprias sessões (ownership check). |

---

## 🖥️ Instalação e Desenvolvimento Local

### Pré-requisitos

- Python 3.11+
- Node.js 20+
- Conta OpenAI com API key
- (Opcional) Conta HuggingFace com acesso ao pyannote (para diarização)

### Backend

```bash
cd "OTTO WHISPER/backend"

# Criar e ativar virtualenv
python -m venv venv
# Linux/macOS: source venv/bin/activate
# Windows: venv\Scripts\activate

# Instalar dependências
pip install -r requirements.txt

# Configurar variáveis de ambiente
cp .env.example .env
# Preencher: OPENAI_API_KEY, HUGGINGFACE_TOKEN, GOOGLE_APPLICATION_CREDENTIALS

# Iniciar servidor
uvicorn main:app --reload --port 8003
```

> ⚠️ O pyannote.audio + torch requerem pelo menos **2 GB de RAM**. Se rodar localmente sem GPU, a diarização pode levar alguns minutos para áudios longos.

### Frontend

```bash
cd "OTTO WHISPER/frontend"

npm install

# Configurar URL do backend
cp .env.example .env
# VITE_API_URL=http://localhost:8003/api

# Iniciar dev server
npm run dev
# → http://localhost:5179
```

---

## 🚀 Deploy em Produção

Consulte o arquivo [DEPLOY.md](DEPLOY.md) para o guia completo, incluindo:

- **Frontend:** Netlify (autodeploy via `netlify.toml`)
- **Backend:** Google Cloud Run (Docker, 2GB+ RAM)
- **Banco de dados:** Firebase Firestore (coleção `otto_whisper_sessions`)
- **Diarização:** HuggingFace (token de acesso ao pyannote)

### Variáveis de ambiente (produção)

| Variável | Onde configurar |
|----------|----------------|
| `OPENAI_API_KEY` | Cloud Run / Render |
| `HUGGINGFACE_TOKEN` | Cloud Run / Render |
| `GOOGLE_APPLICATION_CREDENTIALS` | Cloud Run (via Secret Manager) |
| `EXTRA_ALLOWED_ORIGINS` | Cloud Run / Render |
| `VITE_API_URL` | Netlify / Vercel |

---

## 🔗 Integração com o Ecossistema

| Módulo | Como se integra |
|--------|----------------|
| **OTTO PWA** | Embutido via iframe. Recebe `firebaseToken` via `postMessage` |
| **OTTO PROTTO** | Futuro: exportar prontuário estruturado diretamente para consulta |
| **OTTO CASES** | Futuro: exportar transcrição como relato de caso clínico |
| **OTTO LAUDO-IA** | Futuro: alimentar autocompletar com achados da consulta |

---

*Desenvolvido por Dr. Dario Hart Signorini — dr.dhsig@gmail.com*
