"""
Serviço de sumarização clínica via GPT-4o.
Gera resumo estruturado (QP, HDA, Exame, Hipótese, Conduta) a partir da transcrição.
"""
import os
import json

from openai import OpenAI

from models.schemas import ClinicalSummary

SUMMARY_MODEL = "gpt-4o"

SYSTEM_PROMPT = """Você é um assistente médico especializado em Otorrinolaringologia \
e Cirurgia de Cabeça e Pescoço. Receberá a transcrição de uma consulta médica em \
português brasileiro. Extraia e estruture as seguintes informações em JSON:

{
  "queixa_principal": "uma frase objetiva",
  "hda": "narrativa cronológica da história da doença atual",
  "exame_fisico": "achados relevantes mencionados pelo médico",
  "hipotese_diagnostica": "diagnóstico(s) provável(is), com CID-10 se possível",
  "conduta": "prescrição, exames solicitados, encaminhamentos, retorno",
  "cid_sugerido": "código CID-10 mais provável (ex: H66.0) ou vazio"
}

Se uma seção não estiver presente na transcrição, use o valor "Não mencionado".
Mantenha terminologia médica formal. Não invente informações ausentes.
Responda APENAS com o JSON, sem texto adicional."""


def summarize_transcript(
    transcript: str,
    specialty: str = "ORL",
) -> tuple[ClinicalSummary, str, int]:
    """
    Sumariza a transcrição usando GPT-4o.
    Retorna (ClinicalSummary, cid_sugerido, tokens_used).
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY não configurada")

    client = OpenAI(api_key=api_key)

    user_content = f"Especialidade: {specialty}\n\nTRANSCRIÇÃO:\n{transcript}"

    response = client.chat.completions.create(
        model=SUMMARY_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,  # baixa temperatura para respostas consistentes
        max_tokens=1500,
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    tokens_used = response.usage.total_tokens if response.usage else 0

    summary = ClinicalSummary(
        queixa_principal=data.get("queixa_principal", "Não mencionado"),
        hda=data.get("hda", "Não mencionado"),
        exame_fisico=data.get("exame_fisico", "Não mencionado"),
        hipotese_diagnostica=data.get("hipotese_diagnostica", "Não mencionado"),
        conduta=data.get("conduta", "Não mencionado"),
    )
    cid = data.get("cid_sugerido", "")

    return summary, cid, tokens_used
