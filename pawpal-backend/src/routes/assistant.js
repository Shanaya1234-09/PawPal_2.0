const express = require('express');
const rateLimit = require('express-rate-limit');
const { petAccess } = require('../auth');
const { str } = require('../util');

const router = express.Router();

/* words that always escalate, whatever the model says */
const RED_FLAGS = ['poison', 'chocolate', 'xylitol', 'grapes', 'raisin', 'seizure', 'convuls', 'bloat', 'swollen belly', 'cannot breathe',
  "can't breathe", 'not breathing', 'struggling to breathe', 'hit by', 'accident', 'heavy bleeding', 'bleeding', 'collaps', 'unresponsive',
  'unconscious', 'rat poison', 'antifreeze', 'snake', 'heatstroke', 'straining to pee', 'cannot pee', "can't pee", 'blocked'];

const SYSTEM = 'You are the triage assistant inside PawPal, a pet care app used in India. You are not a vet and never diagnose. ' +
  'Reply with ONLY a JSON object, no markdown: {"mightBe":[..],"whatToDo":[..],"seeVetWhen":[..],"urgency":"routine|soon|now"}. ' +
  'Each list has 2-4 short plain sentences. mightBe lists possibilities, whatToDo is safe home care, seeVetWhen lists concrete warning signs. ' +
  'Use "now" if the animal could be in danger. Never suggest human medicines or doses. Be calm and concrete.';

function fallback(name, q) {
  const has = (...w) => w.some((x) => q.includes(x));
  if (has('vomit', 'throw up', 'threw up')) return {
    mightBe: ['Something ' + name + ' ate that did not agree', 'A mild stomach upset', 'Less often, an infection or a blockage'],
    whatToDo: ['Pause food for a few hours but leave small sips of water', 'Restart with small portions of plain boiled rice', 'Note how often it happens and what it looks like'],
    seeVetWhen: ['More than two or three episodes in a day', 'Blood in the vomit or a swollen, tender belly', 'Lethargy, or nothing stays down for 12 hours'], urgency: 'soon' };
  if (has('diarrh', 'loose stool', 'loose motion')) return {
    mightBe: ['A change in food or a scavenged snack', 'Mild gut infection or parasites', 'Stress'],
    whatToDo: ['Keep water available and food bland and small', 'Avoid new treats for a few days', 'Collect a photo of the stool for the vet'],
    seeVetWhen: ['Blood or black stool', 'It lasts beyond 24 to 48 hours', 'Weakness, fever, or refusing water'], urgency: 'soon' };
  if (has('not eating', 'off food', "won't eat", 'wont eat', 'appetite', 'skipping meal')) return {
    mightBe: ['A one-off upset stomach', 'Dental pain or something in the mouth', 'Early illness, or stress from a change at home'],
    whatToDo: ['Offer a small portion of a favourite plain food', 'Check gums and mouth gently for swelling or injury', 'Watch water intake and energy through the day'],
    seeVetWhen: ['No food for more than 24 hours (12 for cats, rabbits and birds)', 'Drinking much more or much less than usual', 'Vomiting, hiding, or unusual quietness'], urgency: 'soon' };
  if (has('limp', 'scratch', 'itch', 'rash', 'paw')) return {
    mightBe: ['A minor strain, thorn or cut', 'Skin irritation or a flea or tick problem', 'An allergy flare-up'],
    whatToDo: ['Check the paws and skin for cuts, thorns and redness', 'Keep activity gentle for a day', 'Stop any new food, shampoo or cleaner that started recently'],
    seeVetWhen: ['Not putting weight on a leg', 'Open sores, swelling or a bad smell', 'It is getting worse after two days'], urgency: 'routine' };
  return {
    mightBe: ['Often something minor that passes in a day or two', 'A small change in routine, food or environment', 'Occasionally the first sign of illness'],
    whatToDo: ['Watch appetite, water, energy and toilet habits today', 'Keep ' + name + ' calm, cool and comfortable', 'Write down what you notice and when it started'],
    seeVetWhen: ['Symptoms last more than a day or get worse', 'Refusing food or water, or unusual lethargy', 'Anything that worries you, trust that instinct'], urgency: 'routine' };
}

const list = (a) => Array.isArray(a) ? a.map(String).map((s) => s.slice(0, 220)).slice(0, 4) : [];

async function askModel(pet, q) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const ctx = pet.name + ', ' + pet.years + '-year-old ' + pet.sex + ' ' + pet.breed + ' ' + pet.species + ', ' + pet.weight + ' kg. Allergies: ' + pet.allergies + '.\nOwner asks: ';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5', max_tokens: 700, system: SYSTEM, messages: [{ role: 'user', content: ctx + q }] })
    });
    if (!r.ok) return null;
    const d = await r.json();
    const txt = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').replace(/```json|```/g, '').trim();
    const j = JSON.parse(txt);
    const out = { mightBe: list(j.mightBe), whatToDo: list(j.whatToDo), seeVetWhen: list(j.seeVetWhen), urgency: ['routine', 'soon', 'now'].includes(j.urgency) ? j.urgency : 'soon' };
    return out.mightBe.length && out.whatToDo.length && out.seeVetWhen.length ? out : null;
  } catch (e) { return null; }
}

router.post('/:id/assistant', rateLimit({ windowMs: 60e3, limit: 20, standardHeaders: true, legacyHeaders: false }), petAccess('viewer'), async (req, res) => {
  const q = str((req.body || {}).question, 'question', { max: 500 });
  const lower = q.toLowerCase();
  const flagged = RED_FLAGS.some((w) => lower.includes(w));
  let a = await askModel(req.pet, q);
  const source = a ? 'model' : 'script';
  if (!a) a = fallback(req.pet.name, lower);
  if (flagged) {
    a.urgency = 'now';
    a.seeVetWhen = ['Go to an open vet hospital now, this can be dangerous, and do not wait for symptoms to show'].concat(a.seeVetWhen).slice(0, 4);
  }
  res.json(Object.assign(a, { source, emergency: a.urgency === 'now', disclaimer: 'Guidance only, not a diagnosis. A vet should see anything that worries you.' }));
});

module.exports = router;
