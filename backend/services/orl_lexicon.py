"""
Módulo de acesso ao vocabulário ORL para integração com Whisper e GPT-4o.
Carrega orl_vocabulary.json (derivado do shared/orl-lexicon.json) e fornece
funções para injeção de contexto ORL nos prompts de transcrição e sumarização.
"""
import json
from pathlib import Path

_DATA_PATH = Path(__file__).parent.parent / "data" / "orl_vocabulary.json"
_VOCAB: dict | None = None


def _load() -> dict:
    global _VOCAB
    if _VOCAB is None:
        if _DATA_PATH.exists():
            _VOCAB = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
        else:
            _VOCAB = {}
    return _VOCAB


def get_whisper_prompt_hint() -> str:
    """Retorna string de termos ORL para seeding do Whisper API prompt parameter."""
    vocab = _load()
    terms = vocab.get("whisper_prompt_terms", [])
    if not terms:
        return ""
    # Whisper API aceita até ~224 tokens de prompt; limitar a 80 termos
    return "Consulta de otorrinolaringologia. Termos: " + ", ".join(terms[:80]) + "."


def get_summary_vocabulary_block() -> str:
    """Retorna bloco de vocabulário ORL para injeção no prompt de sumarização."""
    vocab = _load()
    entries = vocab.get("summary_vocabulary", [])
    if not entries:
        return ""
    lines = ["\n## Vocabulário Clínico ORL de Referência"]
    lines.append("Use os CID-10 abaixo quando identificar a condição correspondente:")
    for e in entries:
        cids = ", ".join(e.get("cid10", []))
        symptoms = "; ".join(e.get("key_symptoms", [])[:3])
        if cids:
            lines.append(f"- {e['name']} ({cids}): {symptoms}")
    return "\n".join(lines)
