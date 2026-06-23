"""Service IA centralisé — Groq (API OpenAI-compatible, très rapide).

Conçu pour être *optionnel* : si aucune clé n'est configurée ou si l'appel
échoue, les vues appelantes basculent sur un fallback à base de règles. L'app
fonctionne donc toujours, avec ou sans IA.

Tout le projet passe par ce module (assistant d'examen, EduBot, etc.) : changer
de fournisseur IA ne nécessite que de modifier ce fichier.
"""
import logging
import time
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"


class AIUnavailable(Exception):
    """Levée quand l'IA n'est pas configurée ou ne répond pas."""


def is_configured() -> bool:
    """True si une clé Groq est présente."""
    return bool(getattr(settings, 'GROQ_API_KEY', '') or '')


def _post_groq(payload: dict, timeout: int) -> str:
    """POST vers Groq avec une nouvelle tentative en cas de limite de débit (429)."""
    api_key = getattr(settings, 'GROQ_API_KEY', '') or ''
    if not api_key:
        raise AIUnavailable("Clé Groq absente.")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    for tentative in range(2):
        try:
            resp = requests.post(GROQ_ENDPOINT, headers=headers, json=payload, timeout=timeout)
        except requests.RequestException as exc:
            logger.warning("Groq réseau KO: %s", exc)
            raise AIUnavailable("Réseau indisponible.") from exc

        if resp.status_code == 429 and tentative == 0:
            # Limite de débit : on attend le délai conseillé (par défaut 2 s) puis on réessaie.
            attente = 2.0
            try:
                attente = min(8.0, float(resp.json()['error']['message'].split('try again in')[1].split('s')[0]))
            except Exception:
                pass
            time.sleep(attente)
            continue

        if resp.status_code != 200:
            logger.warning("Groq HTTP %s: %s", resp.status_code, resp.text[:300])
            raise AIUnavailable(f"Groq HTTP {resp.status_code}.")

        try:
            text = (resp.json()["choices"][0]["message"]["content"] or "").strip()
        except (KeyError, IndexError, ValueError) as exc:
            logger.warning("Groq réponse inattendue: %s", resp.text[:300])
            raise AIUnavailable("Réponse IA illisible.") from exc
        if not text:
            raise AIUnavailable("Réponse IA vide.")
        return text
    raise AIUnavailable("Groq limite de débit atteinte.")


def chat(messages: list, system: str = "", *, max_tokens: int = 512, temperature: float = 0.7,
         timeout: int = 30, model: str = None) -> str:
    """Appelle Groq (chat completions) avec un historique de messages.

    `messages` : liste de {"role": "user"|"assistant", "content": str|list}.
    `system`   : instruction système optionnelle (préfixée à la conversation).
    `model`    : modèle Groq spécifique (sinon GROQ_MODEL par défaut).

    Lève AIUnavailable si pas de clé ou si l'API échoue (réseau, quota, 4xx/5xx).
    """
    payload_messages = []
    if system:
        payload_messages.append({"role": "system", "content": system})
    payload_messages.extend(messages)
    payload = {
        "model": model or getattr(settings, 'GROQ_MODEL', 'llama-3.3-70b-versatile'),
        "messages": payload_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    return _post_groq(payload, timeout)


def chat_vision(prompt: str, image_data_url: str, system: str = "", *,
                max_tokens: int = 1024, temperature: float = 0.3, timeout: int = 45) -> str:
    """Analyse une image (photo d'exercice) + un texte. Utilise un modèle vision Groq."""
    model = getattr(settings, 'GROQ_VISION_MODEL', 'meta-llama/llama-4-scout-17b-16e-instruct')
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": image_data_url}},
    ]
    messages = []
    if system:
        # Les modèles vision Groq n'acceptent pas toujours de rôle system : on préfixe.
        content[0]["text"] = f"{system}\n\n{prompt}"
    messages.append({"role": "user", "content": content})
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    return _post_groq(payload, timeout)


def is_vision_configured() -> bool:
    return is_configured()


def generate(prompt: str, system: str = "", *, max_tokens: int = 512, temperature: float = 0.7, timeout: int = 30) -> str:
    """Génère une réponse à partir d'un prompt unique (wrapper sur `chat`)."""
    return chat(
        [{"role": "user", "content": prompt}],
        system=system,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout,
    )
