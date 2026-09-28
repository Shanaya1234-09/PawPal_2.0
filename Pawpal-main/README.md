<div align="center">

# 🐾 PawPal

**Everything about them, in one thread.**

A pet care app built around a single idea: one continuous timeline per pet,
with meals, medicines, vaccinations, weight, costs and emergencies all hanging off it.

Fourteen screens. Fully clickable. No build step, no dependencies, no internet.

</div>

---

## Run it

```bash
git clone https://github.com/heerwaghela/Pawpal.git
```

Then open `index.html` in a browser. That is the whole setup.

There is no `npm install`, no bundler and no server. The typefaces are embedded in the
CSS as base64, so the app renders identically on a laptop that has never been online.

### Moving it to another machine

`index.html` needs its four sibling files next to it. Copy the **whole folder**, or send
someone `pawpal-standalone.html` instead, which is the entire app folded into one file:
markup, styles, animations, script and both typefaces. Email it, drop it on a USB stick,
open it from a Downloads folder on its own. It makes exactly one network request, for
itself.

Rebuild it after editing any source file:

```bash
python build.py
```

## The idea

Most pet apps are a drawer of unrelated features: a vaccine list here, a food log there,
a receipts folder somewhere else. PawPal puts one **Care Thread** down the middle of the
app and hangs everything off it in time order.

```
  ●  Breakfast · 180 g kibble        7:30 am · logged
  ●  Morning walk · 2.1 km           8:05 am · 34 min
  ◉  NOW · 11:20 AM  ─────────────────────────────────
  ●  Carprofen · half tablet         Due 2:00 pm · with food
  ●  Rabies booster                  Thu 28 Aug · Paws Clinic
  ●  Dinner · 180 g kibble           7:00 pm
```

Everything above the marker already happened. Everything below is what you owe the animal
today. Tapping any entry opens the screen that owns it, so the thread doubles as
navigation. Nothing needs a menu.

## Screens

| # | Screen | What it does |
|---|---|---|
| 1 | Sign in | Email, password, three social providers |
| 2 | Onboarding | Three steps: species, details, what to be reminded about |
| 3 | Home | The Care Thread, pet switcher, pull to refresh |
| 4 | Assistant | Answers structured as what it might be, what to do, when to see a vet |
| 5 | Emergency | One tap from anywhere. Nearest hospital, ambulance, your own vet |
| 6 | Pet profile | The dossier: vitals, microchip, insurance, medical history |
| 7 | Vaccinations | Timeline of what is due and what has been given |
| 8 | Records | Weight trend, recent visits, stored documents |
| 9 | Feeding | Daily grams, meals, and what this animal must avoid |
| 10 | Growth | Weight against the breed-normal band |
| 11 | Spending | Monthly total by category |
| 12 | Lost poster | Live preview of a shareable poster |
| 13 | Community | Neighbourhood questions and answers |
| 14 | Settings | Language, family sharing, reminders, export |

## It is a real prototype, not a slideshow

Whatever you type in onboarding drives the whole app. Name, owner, species, breed,
weight, age and sex flow into one state object, and every screen reads from it. Change
the species and the illustration, the copy and even the pronouns follow.

Every button does something:

| Where | What it does |
|---|---|
| Spending | Add expense opens a keypad. The total counts up, the category row updates and the donut redraws segment by segment. Repeatable |
| Growth | Log a weight and it lands in the list, the headline figure and the emergency card |
| Feeding | Change the daily portion and the meals and calories recalculate |
| Vaccinations | Book a slot, the card flips to booked and the booking joins the care thread |
| Records | File a record and it appears at the top of the history |
| Community | Ask a question and the post appears. Answer one and the count moves |
| Profile | Edit details and every screen in the app repaints |
| Home | Switch pets, or add one, and the thread follows |
| Emergency | The call button runs a live call timer |

## Emergency mode

The screen everything else is arranged around. It is reachable from any screen in one
tap, and it does three things a panicking owner cannot do for themselves:

- Calls the nearest hospital that is actually open, named on the button.
- Shares location and the pet's records with whoever answers.
- Puts weight, allergies, blood group and current medication on screen in a block sized
  to be read aloud to a vet.

## Design system

Calm, conversational, urgent when it needs to be. One accent per screen, the serif used
once per screen, and signal red reserved for emergencies so it never loses its meaning.

### Palette

| Token | Hex | Role |
|---|---|---|
| bone | `#F6F3EC` | App canvas |
| paper | `#FFFFFF` | Cards and sheets |
| ink | `#17150F` | Text and the nav pill |
| pine | `#23372B` | Primary accent |
| marigold | `#E8A33D` | Due, streaks |
| clay | `#E7C8BE` | Soft fills, portraits |
| signal | `#C0402B` | Emergency only |
| mist | `#E4DFD4` | Hairlines |
| slate | `#7C776B` | Secondary text |

### Type

**Fraunces** carries every display moment, set with its `SOFT` and `WONK` axes turned up.
That is what makes the app feel warm rather than formal, without tipping into a children's
font. **Inter** handles interface text, and every figure uses tabular numerals so columns
of rupees and kilograms line up.

| Role | Size / leading |
|---|---|
| Display | 34 / 40 |
| Title | 26 / 32 |
| Section | 17 / 24 |
| Body | 15 / 22 |
| Label | 13 / 18 |

## Motion

Animation is used to explain what happened, not to decorate.

- The Care Thread **draws its own line** downward and pops each node in sequence, so the
  timeline reads as a timeline before you have read a word of it.
- Emergency **washes red outward from the point you pressed**, so the mode change is
  clearly a consequence of your tap.
- Screens push and pop with parallax on the outgoing screen, the way a phone does.
- Weight and growth curves draw their SVG path; the donut draws segment by segment.
- Figures count up on arrival, with a wall-clock fallback so a stalled frame can never
  leave a half-counted number on screen.
- The assistant types before it answers, then cascades its three sections in.
- Anything the owner just added lands with a brief highlight rather than appearing.
- Going back restores the scroll position and does not replay the entrance, so a
  return feels like a return rather than a fresh page.

Everything sits behind `prefers-reduced-motion`, and the app is fully usable with all of
it switched off.

## Presenting it

The app renders inside a CSS iPhone frame on a desk, so it can be shown on a projector
without a phone or a screen mirror.

| Key | Does |
|---|---|
| `→` `←` | Step through all 14 screens |
| `P` | Screen jump list |
| `G` | Layout grid overlay |
| `R` | Replay the current screen's animations |
| `Esc` | Close the jump list |

All of it is hidden until pressed, and everything is tappable with a mouse.

## Project structure

```
Pawpal/
├── index.html               All 14 screens, the device frame, the icon sprite
├── styles.css               Tokens, layout, components, per-screen styles
├── motion.css               Every keyframe and transition
├── app.js                   Router, back stack, gestures, counters, charts
├── fonts.css                Fraunces and Inter as base64 woff2
├── build.py                 Folds the five files above into one
└── pawpal-standalone.html   Generated. The whole app in a single file
```

Roughly 1,500 lines of hand-written HTML, CSS and JavaScript. No framework.

## Notes on the build

- **No modules.** Plain `<script>`, because module scripts are blocked on `file://` and
  the app has to survive being double-clicked.
- **No network calls of any kind.** Verified: the page requests its own four files and
  nothing else.
- **No image files.** The dog, the paw pattern, every icon and both charts are inline SVG
  or CSS, which is why the whole app is five text files.
- **Wide browser support.** ES5 only, with longhand fallbacks alongside every modern CSS
  shorthand, so it renders on browsers several years out of date.
- **Indian defaults**, because that is who it is for: rupees, Kannada and Hindi alongside
  English, and a lost-pet poster built for WhatsApp rather than a printer.

<!-- Screenshots: drop PNGs into docs/ and uncomment.
| Home | Emergency | Spending |
|---|---|---|
| ![Home](docs/home.png) | ![Emergency](docs/emergency.png) | ![Spending](docs/spending.png) |
-->

## Status

A working front-end prototype. The data is fixed rather than fetched, and the assistant
answers from a script. The next step is a real backend and a React Native port that keeps
the Care Thread as the home screen.

---

<div align="center">
<sub>Built for Bruno, and every indie who needed a vet at 2 a.m.</sub>
</div>
