"""
symptom_extraction.py

Uses a local Ollama model to read a pet owner's free-text chat message and
extract which symptoms (from your KB's known vocabulary) are being described.

Requirements:
    pip install requests
    Ollama running locally with a model pulled, e.g.:
        ollama pull llama3.2:3b

Usage:
    python symptom_extraction.py
"""

import json
import os
import re
import time
from pathlib import Path
import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
MODEL_NAME = os.environ.get("MODEL_NAME", "llama3.2:3b")   # change to whatever model you pulled, e.g. "phi3", "gemma2:2b"


class ExtractionError(Exception):
    """Raised when the model call itself fails (Ollama unreachable, timeout,
    bad response, etc). Kept distinct from "the model legitimately found no
    symptoms" so callers - especially the evaluator - never confuse an infra
    failure with a real empty prediction. Silently returning [] for both
    cases is what made earlier eval runs look like the model had 0% recall
    on the first few cases, when actually Ollama just hadn't finished
    loading the model into memory yet (cold start)."""
    pass

with open(Path(__file__).parent / "pet_health_kb.json") as f:
    KB = json.load(f)


def get_symptom_vocab(species: str):
    """All known symptom keys for a species, taken from the KB."""
    vocab = set()
    for cond in KB:
        if cond["species"] == species:
            vocab.update(cond["symptoms"].keys())
    return sorted(vocab)


def build_system_prompt(species: str) -> str:
    vocab = get_symptom_vocab(species)
    vocab_str = ", ".join(vocab)
    return f"""You are a symptom-extraction tool for a {species} health chatbot.

You will receive a pet owner's message describing their pet's condition.
Your ONLY job is to identify which symptoms from this exact list are being
described in the message, even if the owner uses different wording:

{vocab_str}

Rules:
- Only return symptom keys from the list above. Never invent new ones.
- Match by meaning, not exact wording (e.g. "throwing up" means "vomiting").
- CRITICAL: only include a symptom if it is LITERALLY described somewhere in
  the message. Do not add a symptom just because it commonly co-occurs with
  other symptoms you found, and do not guess at a likely diagnosis and then
  fill in its usual symptom list. If it isn't in the text, leave it out.
- If a symptom in the list is not clearly described in the message, do not include it.
- Do not diagnose, give advice, or add commentary of any kind.
- Respond with ONLY a JSON object in this exact shape, nothing else:
  {{"symptoms": ["symptom_key_1", "symptom_key_2"]}}

Example:
Message: "My dog keeps coughing and sneezing, and has a runny nose."
Correct output: {{"symptoms": ["coughing", "sneezing", "nasal_discharge"]}}
Wrong output (do NOT do this): {{"symptoms": ["coughing", "sneezing", "nasal_discharge", "fever", "lethargy"]}}
(fever and lethargy were never mentioned, even though they're common with coughs - do not add them)

Before finalizing your answer, re-check each symptom you're about to include:
for every one, find the specific word or phrase in the message that describes
it. If you can't point to a phrase, remove that symptom. This applies even to
symptoms from a *different* body system than the ones described (e.g. do not
add ear symptoms because the message describes skin symptoms, and do not add
digestive symptoms because the message describes appetite changes) - each
symptom needs its own textual evidence, not just topical closeness to
symptoms that are genuinely present.
"""


def extract_symptoms(owner_message: str, species: str, max_retries: int = 2) -> list:
    """Calls the local Ollama model and returns a list of matched symptom keys.
    Retries on timeout/connection errors since CPU inference speed can vary.

    Raises ExtractionError if every attempt fails - callers must not treat
    that the same as a legitimate "no symptoms found" result. (The API in
    api.py catches this and tells the user extraction is temporarily
    unavailable, rather than silently asking a clarifying question as if
    nothing was said.)
    """
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": build_system_prompt(species)},
            {"role": "user", "content": owner_message},
        ],
        "format": "json",   # tells Ollama to constrain output to valid JSON
        "stream": False,
        "options": {
            "temperature": 0,   # deterministic, less prone to "creative" guessing
            "num_predict": 150, # symptom-list JSON never needs more than this - caps worst-case latency
        },
    }

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            response = requests.post(OLLAMA_URL, json=payload, timeout=180)
            response.raise_for_status()
            content = response.json()["message"]["content"]
            break
        except (requests.exceptions.RequestException,) as e:
            last_error = e
            if attempt < max_retries:
                # Cold starts (first request after `ollama serve`/model pull) can take
                # a while to load the model into memory - back off instead of
                # hammering it immediately.
                wait = 3 * (attempt + 1)
                print(f"    (extraction timed out/failed, retrying in {wait}s... attempt {attempt + 2}/{max_retries + 1})")
                time.sleep(wait)
                continue
            else:
                print(f"    (extraction failed after {max_retries + 1} attempts: {e})")
                raise ExtractionError(str(last_error)) from last_error
    else:
        raise ExtractionError(str(last_error))

    try:
        parsed = json.loads(content)
        symptoms = parsed.get("symptoms", [])
    except json.JSONDecodeError:
        # fallback: try to pull a JSON array out of the raw text if the model
        # added stray text despite the format constraint
        match = re.search(r"\[.*?\]", content, re.DOTALL)
        symptoms = json.loads(match.group()) if match else []

    # keep only symptoms that actually exist in our vocabulary (safety net
    # against the model hallucinating a symptom key)
    valid_vocab = set(get_symptom_vocab(species))
    return [s for s in symptoms if s in valid_vocab]


def warm_up(species: str = "dog", timeout: int = 300):
    """Sends one throwaway request and waits for Ollama to finish loading the
    model into memory, so the *real* first scored case isn't the one eating
    the cold-start latency (and, before the ExtractionError fix, silently
    failing as a false zero-recall result)."""
    print("Warming up model (first call after `ollama serve` can be slow)...")
    try:
        payload = {
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": build_system_prompt(species)},
                {"role": "user", "content": "test"},
            ],
            "format": "json",
            "stream": False,
            "options": {"temperature": 0, "num_predict": 150},
        }
        requests.post(OLLAMA_URL, json=payload, timeout=timeout)
        print("Model is warm.\n")
    except requests.exceptions.RequestException as e:
        print(f"Warm-up call failed ({e}) - is `ollama serve` running and the model pulled?\n")


def smoke_test():
    """Quick sanity check: python symptom_extraction.py"""
    warm_up("dog")
    tests = [
        ("dog", "He keeps throwing up and won't eat since last night."),
        ("cat", "She is sneezing, has watery eyes and a runny nose."),
    ]
    for species, msg in tests:
        print(f"[{species}] {msg}\n  -> {extract_symptoms(msg, species)}\n")


if __name__ == "__main__":
    smoke_test()
