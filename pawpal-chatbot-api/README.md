# PawPal Chatbot API

A stateless symptom-checker service. Your app's database is never touched:
the frontend sends the pet's species + name with each message and gets back
a small JSON result to render.

    owner message -> Ollama symptom extraction -> red-flag triage -> weighted KB match

## Folder contents
| File | Purpose |
|---|---|
| `api.py` | FastAPI app, `POST /chat` and `GET /health` |
| `symptom_extraction.py` | Sends the message to Ollama, returns symptom keys |
| `matching_engine.py` | Red-flag check + condition scoring |
| `pet_health_kb.json` | Knowledge base (40 conditions, dogs + cats) |
| `requirements.txt` | Python dependencies |
| `.env.example` | Optional settings |

## 1. Run it
```bash
pip install -r requirements.txt

# terminal 1
ollama serve
ollama pull llama3.2:3b        # once

# terminal 2 (inside this folder)
uvicorn api:app --reload --port 8000
```
Check: open http://localhost:8000/health -> `{"status":"ok","conditions_loaded":40}`
Interactive docs / manual testing: http://localhost:8000/docs

Optional: `python symptom_extraction.py` runs a 2-message smoke test.

**Before a demo:** send one throwaway message first. The first Ollama call
loads the model into memory and can take a minute.

## 2. Connect it to your app

### The contract
`POST http://localhost:8000/chat`
```json
{
  "message": "He's been throwing up since last night",
  "species": "dog",
  "pet_name": "Bruno",
  "history": [{"role": "user", "content": "earlier message"}]
}
```
- `species`: `"dog"` or `"cat"` (anything else returns 400)
- `pet_name`: optional
- `history`: optional; previous turns (`role` = `user`/`assistant`). Only the last 6 user messages are used.

Response `type` is one of:
- `"card"` -> `condition`, `confidence`, `matched_symptoms`, `sections{what_it_might_be, what_to_do, when_to_see_vet}`, `diet_notes`
- `"urgent"` -> `message`, `possible_related_conditions`, `matched_red_flag_symptoms`
- `"text"` -> `message` (clarifying question or "can't reach model" notice)

### Option A: you use `pawpal-dashboard.html` (or the iframe approach)
Line ~511 of that file has `const API_BASE = 'http://localhost:8000';`.
It already sends `species` and `pet_name`. The one thing to change for your
real app is where those two values come from: it currently reads them from
hard-coded buttons (`data-species`, `data-name`). Replace that with the pet
selected in your app, e.g. from your pets table (`pets.species`, `pets.name`).

### Option B: call it from your React code
Put the URL in an env variable (`.env` in your React project):
```
VITE_CHATBOT_URL=http://localhost:8000
```
```js
// services/chatbot.js
const BASE = import.meta.env.VITE_CHATBOT_URL;

export async function askPawPal({ message, pet, history = [] }) {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      species: pet.species.toLowerCase(),   // must be "dog" or "cat"
      pet_name: pet.name,
      history,
    }),
  });
  if (!res.ok) throw new Error(`Chatbot error ${res.status}`);
  return res.json();
}
```
Your pet's `species` value must map to `dog`/`cat`. If your app allows other
species, hide the chatbot for them or show a "not supported yet" message.

### Keeping history
Keep the conversation array in component state and send it with each call:
```js
history.push({ role: "user", content: message });
// after the reply:
history.push({ role: "assistant", content: JSON.stringify(reply) });
```

## 3. Demo without deploying
- Run the frontend, this API and Ollama on one laptop, or
- Deploy only the frontend, and expose the API with a tunnel:
  `ngrok http 8000`, then set `VITE_CHATBOT_URL` to the ngrok URL and
  `ALLOWED_ORIGINS` to your frontend's URL.

## 4. Settings (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434/api/chat` | Where Ollama runs |
| `MODEL_NAME` | `llama3.2:3b` | Model used for extraction |
| `ALLOWED_ORIGINS` | `*` | Comma-separated allowed frontend origins |

## Known limits (good to mention in your report)
- Guidance only; it does not replace a veterinarian.
- Symptom extraction uses a small local LLM and can occasionally add a symptom that was not mentioned.
- Memory is symptom-only: earlier symptoms carry over, but the bot cannot answer questions about its own previous replies.
- Each `/chat` call can make up to 7 Ollama calls on a long conversation, so replies slow down as chats grow.
