"""
api.py

The PawPal chatbot API. Wraps the existing pipeline —

    owner message
        -> symptom_extraction.extract_symptoms()   (local Ollama LLM)
        -> matching_engine.check_red_flags()        (emergency triage)
        -> matching_engine.match_conditions()        (weighted KB lookup)

— behind a single POST /chat endpoint that returns a small, stable JSON
contract the frontend already knows how to render (see pawpal-chatbot.html).

Run it:
    pip install -r requirements.txt
    ollama serve                       # in another terminal
    ollama pull llama3.2:3b            # once
    uvicorn api:app --reload --port 8000

Then open pawpal-chatbot.html — it calls http://localhost:8000/chat.
"""

import json
import os
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from symptom_extraction import extract_symptoms, get_symptom_vocab, ExtractionError
from matching_engine import check_red_flags, match_conditions

with open(Path(__file__).parent / "pet_health_kb.json") as f:
    KB = json.load(f)

app = FastAPI(title="PawPal Chatbot API")

# CORS: set ALLOWED_ORIGINS in the environment, comma-separated, e.g.
#   ALLOWED_ORIGINS=http://localhost:5173,https://my-app.vercel.app
# Defaults to "*" (fine for local development / a college demo).
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    species: str                      # "dog" | "cat"
    pet_name: Optional[str] = "your pet"
    history: Optional[List[ChatTurn]] = None   # reserved for future multi-turn use


class ChatResponse(BaseModel):
    type: str                          # "urgent" | "card" | "text"
    condition: Optional[str] = None
    confidence: Optional[str] = None
    matched_symptoms: Optional[List[str]] = None
    sections: Optional[dict] = None
    diet_notes: Optional[str] = None
    message: Optional[str] = None
    possible_related_conditions: Optional[List[str]] = None
    matched_red_flag_symptoms: Optional[List[str]] = None


def humanize(symptom_key: str) -> str:
    return symptom_key.replace("_", " ")


MAX_HISTORY_TURNS = 6  # cap how many past user messages we re-extract from, to bound latency


def gather_symptoms(current_message: str, history: Optional[List[ChatTurn]], species: str) -> List[str]:
    """
    Extracts symptoms from the current message AND accumulates symptoms
    mentioned earlier in the conversation, so "he's been throwing up" in
    message 1 still counts when message 2 says "and now he won't eat either."

    Without this, every turn was scored in total isolation - the model had
    no memory of anything said one message ago, let alone further back.
    """
    past_user_texts = [t.content for t in (history or []) if t.role == "user"][-MAX_HISTORY_TURNS:]
    texts = past_user_texts + [current_message]

    all_symptoms = set()
    for text in texts:
        all_symptoms.update(extract_symptoms(text, species))  # raises ExtractionError on failure - let it propagate
    return sorted(all_symptoms)


@app.get("/health")
def health():
    return {"status": "ok", "conditions_loaded": len(KB)}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    species = req.species.lower().strip()
    if species not in ("dog", "cat"):
        raise HTTPException(400, "species must be 'dog' or 'cat'")

    name = req.pet_name or "your pet"

    # 1. Pull structured symptoms out of the free-text message, plus everything
    #    reported earlier in this conversation (see gather_symptoms).
    try:
        symptoms = gather_symptoms(req.message, req.history, species)
    except ExtractionError:
        # Ollama is unreachable/timed out - tell the user honestly rather than
        # silently treating this the same as "no symptoms mentioned", which
        # would ask a confusing clarifying question about a message that
        # already had plenty of detail in it.
        return ChatResponse(
            type="text",
            message=(
                "I'm having trouble reaching my symptom checker right now. "
                "Give it a moment and try sending that again — if it keeps happening, "
                "the local model server may need a restart."
            ),
        )

    # No recognizable symptoms yet - ask a clarifying question rather than guess.
    if not symptoms:
        return ChatResponse(
            type="text",
            message=(
                f"Thanks for the update on {name}. Could you tell me a bit more — "
                f"how long this has been going on, and anything else you've noticed "
                f"(appetite, energy, bathroom habits, breathing)?"
            ),
        )

    # 2. Emergency triage always runs first, independent of which condition it turns out to be.
    red_flag = check_red_flags(symptoms, species, KB)
    if red_flag:
        return ChatResponse(
            type="urgent",
            matched_symptoms=[humanize(s) for s in symptoms],
            message=red_flag["message"],
            possible_related_conditions=red_flag["possible_related_conditions"],
            matched_red_flag_symptoms=[humanize(s) for s in red_flag["matched_red_flag_symptoms"]],
        )

    # 3. Otherwise, rank likely conditions and answer with the top match.
    ranked = match_conditions(symptoms, species, KB, top_n=1)

    if not ranked:
        return ChatResponse(
            type="text",
            matched_symptoms=[humanize(s) for s in symptoms],
            message=(
                f"I picked up on {', '.join(humanize(s) for s in symptoms)}, but that combination "
                f"doesn't clearly match a condition in my knowledge base. Keep an eye on {name}, and "
                f"if things persist beyond a day or two, it's worth a vet visit."
            ),
        )

    top = ranked[0]
    matched_str = ", ".join(humanize(s) for s in top["matched_symptoms"])

    return ChatResponse(
        type="card",
        condition=top["condition"],
        confidence=top["confidence"],
        matched_symptoms=[humanize(s) for s in top["matched_symptoms"]],
        sections={
            "what_it_might_be": (
                f"What you're describing ({matched_str}) lines up with {top['condition']} "
                f"— a {top['confidence'].lower()} based on {name}'s symptoms."
            ),
            "what_to_do": top["home_care"],
            "when_to_see_vet": top["vet_if"],
        },
        diet_notes=top["diet_notes"],
    )
