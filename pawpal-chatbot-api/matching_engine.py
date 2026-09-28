"""
matching_engine.py

Two pieces:
1. check_red_flags()  - runs FIRST, checks for emergency symptoms
2. match_conditions()  - scores KB conditions against a symptom list, ranked

Usage:
    from matching_engine import check_red_flags, match_conditions
    import json
from pathlib import Path

    KB = json.load(open("pet_health_kb.json"))
    symptoms = ["vomiting", "diarrhea", "lethargy"]

    red_flag = check_red_flags(symptoms, species="dog", kb=KB)
    if red_flag:
        print("URGENT:", red_flag)
    else:
        ranked = match_conditions(symptoms, species="dog", kb=KB)
        print(ranked[:3])
"""

import json


def check_red_flags(symptoms: list, species: str, kb: list):
    """
    Checks if any reported symptom matches a red_flag for ANY condition of
    this species. Returns a dict describing the match if found, else None.

    This runs independently of condition matching - a red flag symptom
    should trigger urgent care regardless of which specific condition it
    turns out to be.
    """
    symptom_set = set(symptoms)
    matches = []

    for cond in kb:
        if cond["species"] != species:
            continue
        hit = symptom_set & set(cond.get("red_flags", []))
        if hit:
            matches.append({
                "condition": cond["condition"],
                "matched_red_flags": sorted(hit),
            })

    if not matches:
        return None

    return {
        "urgent": True,
        "message": (
            "One or more symptoms described are potential emergency signs. "
            "Please contact a veterinarian or emergency animal hospital as soon as possible "
            "rather than waiting."
        ),
        "possible_related_conditions": [m["condition"] for m in matches],
        "matched_red_flag_symptoms": sorted({s for m in matches for s in m["matched_red_flags"]}),
    }


def match_conditions(symptoms: list, species: str, kb: list, top_n: int = 3):
    """
    Scores every condition of this species by summing the weights of matched
    symptoms, then returns the top_n ranked results with a rough confidence
    label. Pure weighted lookup - no ML involved.
    """
    symptom_set = set(symptoms)
    scored = []

    for cond in kb:
        if cond["species"] != species:
            continue

        cond_symptoms = cond["symptoms"]  # {symptom: weight}
        matched = symptom_set & set(cond_symptoms.keys())

        if not matched:
            continue  # no overlap at all, skip - avoids noise from irrelevant conditions

        raw_score = sum(cond_symptoms[s] for s in matched)
        max_possible = sum(cond_symptoms.values())  # total weight if ALL this condition's symptoms matched
        coverage = raw_score / max_possible  # 0-1, how much of this condition's profile was matched

        scored.append({
            "condition": cond["condition"],
            "score": raw_score,
            "coverage": round(coverage, 2),
            "matched_symptoms": sorted(matched),
            "unmatched_symptoms": sorted(set(cond_symptoms.keys()) - matched),
            "home_care": cond["home_care"],
            "vet_if": cond["vet_if"],
            "diet_notes": cond["diet_notes"],
        })

    # rank by raw score first (stronger evidence), then by coverage as tiebreaker
    scored.sort(key=lambda x: (x["score"], x["coverage"]), reverse=True)

    # attach a rough confidence label based on coverage
    for result in scored:
        if result["coverage"] >= 0.75:
            result["confidence"] = "High match"
        elif result["coverage"] >= 0.45:
            result["confidence"] = "Medium match"
        else:
            result["confidence"] = "Low match"

    return scored[:top_n]


if __name__ == "__main__":
    # quick manual test
    with open(Path(__file__).parent / "pet_health_kb.json") as f:
        KB = json.load(f)

    test_symptoms = ["vomiting", "diarrhea", "lethargy", "loss_of_appetite", "abdominal_pain"]
    species = "dog"

    red_flag = check_red_flags(test_symptoms, species, KB)
    if red_flag:
        print("RED FLAG TRIGGERED:")
        print(json.dumps(red_flag, indent=2))
    else:
        print("No red flags. Ranked condition matches:\n")
        results = match_conditions(test_symptoms, species, KB)
        for r in results:
            print(f"{r['condition']} - {r['confidence']} (score {r['score']}, coverage {r['coverage']})")
            print(f"  matched: {r['matched_symptoms']}")
            print()
