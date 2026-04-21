# OTTO Whisper — Guia de Deploy

## Stack de produção
| Camada | Serviço |
|---|---|
| Frontend | **Netlify** |
| Backend (FastAPI) | Google Cloud Run |
| Banco de dados | Firebase Firestore |

---

## 1. Git — primeiro push (rodar no Windows)

```bash
cd "C:\Users\drdhs\OneDrive\Documentos\AOTTO ECOSYSTEM\OTTO WHISPER"
rm -rf .git
git init
git branch -M main
git remote add origin https://github.com/dhsig86/OTTOWHISPER.git
git add .
git commit -m "feat: OTTO Whisper — Sprint 1-4 completo"
git push -u origin main
```

---

## 2. Frontend → Netlify

1. Acesse [netlify.com](https://netlify.com) → "Add new site" → "Import an existing project"
2. Conecte o GitHub e importe `dhsig86/OTTOWHISPER`
3. As configurações de build são detectadas automaticamente pelo `netlify.toml`:
   - **Base directory:** `frontend`
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Variáveis de ambiente (Site Settings → Environment Variables):
   ```
   VITE_API_URL = https://SEU-SERVICO.run.app/api
   ```
   *(preencher após criar o Cloud Run no passo 3)*
5. Deploy → anote a URL gerada (ex: `otto-whisper.netlify.app`)
6. Opcional: configurar domínio customizado em Domain Settings

---

## 3. Backend → Google Cloud Run

### Pré-requisitos
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) instalado
- Mesmo projeto Google do Firebase (ex: `otto-ecosystem-xxxxx`)

### Deploy via CLI (Git Bash / PowerShell)

```bash
# Login
gcloud auth login
gcloud config set project SEU-PROJETO-FIREBASE

# Build e deploy direto do repositório
gcloud run deploy otto-whisper-api \
  --source ./backend \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars OPENAI_API_KEY="sua-chave",HUGGINGFACE_TOKEN="hf_...",EXTRA_ALLOWED_ORIGINS="https://otto-whisper.vercel.app"
```

> **Nota sobre memória:** pyannote.audio precisa de pelo menos 2GB RAM. Cloud Run Starter suporta até 4GB.

### Configurar credencial Firebase no Cloud Run

```bash
# 1. Crie um Secret no Google Secret Manager
gcloud secrets create firebase-otto-key \
  --data-file="caminho/para/otto-ecosystem-firebase-adminsdk-xxx.json"

# 2. Dê acesso ao Cloud Run
gcloud secrets add-iam-policy-binding firebase-otto-key \
  --member="serviceAccount:SEU-SA@SEU-PROJETO.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 3. Monte o secret no serviço
gcloud run services update otto-whisper-api \
  --set-secrets="/run/secrets/firebase_key.json=firebase-otto-key:latest"
```

### Após o deploy
- Anote a URL do Cloud Run (ex: `https://otto-whisper-api-xxxx.run.app`)
- Volte ao Vercel e configure `VITE_API_URL = https://otto-whisper-api-xxxx.run.app/api`
- Atualize `ALLOWED_ORIGINS` no `main.py` com a URL real do Vercel (ou use `EXTRA_ALLOWED_ORIGINS`)

---

## 4. Firebase Firestore

No [console.firebase.google.com](https://console.firebase.google.com):

1. Selecione o projeto `otto-ecosystem-xxxxx`
2. Firestore Database → **Criar coleção:** `otto_whisper_sessions`
3. Criar índice composto:
   - Coleção: `otto_whisper_sessions`
   - Campo 1: `doctor_id` (Crescente)
   - Campo 2: `created_at` (Decrescente)

---

## 5. HuggingFace (pyannote — diarização)

1. Crie conta em [huggingface.co](https://huggingface.co)
2. Aceite os termos em: [huggingface.co/pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
3. Crie um token em: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
4. Configure `HUGGINGFACE_TOKEN` nas variáveis do Cloud Run

---

## 6. Atualizar OTTO PWA após deploy

Em `OTTO PWA/otto-pwa/src/config/modules.ts`, o módulo `whisper` já está registrado com `url: 'https://otto-whisper.vercel.app'`. Se a URL do Vercel for diferente, atualizar e fazer commit no PWA.

---

## Checklist final

- [ ] Git push para `dhsig86/OTTOWHISPER`
- [ ] Frontend no Vercel com `VITE_API_URL` configurado
- [ ] Cloud Run deployado com memória 2GB+
- [ ] Variáveis de ambiente configuradas no Cloud Run
- [ ] Firebase Firestore com coleção e índice criados
- [ ] HuggingFace token configurado
- [ ] URL do Vercel adicionada ao `EXTRA_ALLOWED_ORIGINS` do Cloud Run
- [ ] Teste end-to-end: gravar → transcrever → resumir → exportar
