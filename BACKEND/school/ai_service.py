"""Service IA centralisé — Groq (API OpenAI-compatible, très rapide).

Conçu pour être *optionnel* : si aucune clé n'est configurée ou si l'appel
échoue, les vues appelantes basculent sur un fallback à base de règles. L'app
fonctionne donc toujours, avec ou sans IA.

Tout le projet passe par ce module (assistant d'examen, EduBot, etc.) : changer
de fournisseur IA ne nécessite que de modifier ce fichier.
"""
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"


class AIUnavailable(Exception):
    """Levée quand l'IA n'est pas configurée ou ne répond pas."""


def is_configured() -> bool:
    """True si une clé Groq est présente."""
    return bool(getattr(settings, 'GROQ_API_KEY', '') or '')


def chat(messages: list, system: str = "", *, max_tokens: int = 512, temperature: float = 0.7, timeout: int = 30) -> str:
    """Appelle Groq (chat completions) avec un historique de messages.

    `messages` : liste de {"role": "user"|"assistant", "content": str}.
    `system`   : instruction système optionnelle (préfixée à la conversation).

    Lève AIUnavailable si pas de clé ou si l'API échoue (réseau, quota, 4xx/5xx).
    """
    api_key = getattr(settings, 'GROQ_API_KEY', '') or ''
    if not api_key:
        raise AIUnavailable("Clé Groq absente.")

    model = getattr(settings, 'GROQ_MODEL', 'llama-3.3-70b-versatile')

    payload_messages = []
    if system:
        payload_messages.append({"role": "system", "content": system})
    payload_messages.extend(messages)

    payload = {
        "model": model,
        "messages": payload_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    try:
        resp = requests.post(
            GROQ_ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        logger.warning("Groq réseau KO: %s", exc)
        raise AIUnavailable("Réseau indisponible.") from exc

    if resp.status_code != 200:
        logger.warning("Groq HTTP %s: %s", resp.status_code, resp.text[:300])
        raise AIUnavailable(f"Groq HTTP {resp.status_code}.")

    try:
        data = resp.json()
        text = (data["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, ValueError) as exc:
        logger.warning("Groq réponse inattendue: %s", resp.text[:300])
        raise AIUnavailable("Réponse IA illisible.") from exc

    if not text:
        raise AIUnavailable("Réponse IA vide.")
    return text


def generate(prompt: str, system: str = "", *, max_tokens: int = 512, temperature: float = 0.7, timeout: int = 30) -> str:
    """Génère une réponse à partir d'un prompt unique (wrapper sur `chat`)."""
    return chat(
        [{"role": "user", "content": prompt}],
        system=system,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
    )
