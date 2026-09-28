# PawPal backend

REST API for the PawPal frontend. Node 20+, Express, SQLite (one file, no database server).
Every route the prototype fakes in `app.js` has a real endpoint here.

```bash
npm install
cp .env.example .env      # set JWT_SECRET
npm run seed              # optional: Aarav, Bruno and Mishti from the prototype
npm start                 # http://localhost:3000
npm test                  # 9 end-to-end tests, in-memory DB
```

To serve the frontend from the same origin, set `FRONTEND_DIR=../Pawpal`. Otherwise include
`pawpal-api.js` in the frontend and point `window.PAWPAL_API` at this server.

## Design

- **The care thread is the spine.** `thread_entries` holds everything time-ordered. Recurring items
  (meals, medicines) live in `routines` and are materialised into the thread the first time a day is
  requested, once per routine per day. Booking a vaccination, logging a weight, or adding a note
  writes an entry directly.
- **Reminders switch routines on and off** by kind: meals, medicines, vaccinations, walks, grooming.
- **Access is per pet**: `owner`, `editor`, `viewer`. Family sharing is a 7-day invite token.
- **Times are local wall-clock strings** in `APP_TZ` (default Asia/Kolkata), so they sort and compare simply.
- **Money is whole rupees** (integers).

## Endpoints

All under `/api`. Everything except `auth/*`, `health` and `share/:token` needs `Authorization: Bearer <token>`.

| Area | Endpoints |
|---|---|
| Auth | `POST auth/register` `auth/login` `auth/forgot` `auth/reset` |
| Account | `GET/PATCH/DELETE me` · `POST me/password` |
| Contacts | `GET/POST contacts` · `PUT contacts/order` · `DELETE contacts/:id` |
| Pets | `GET/POST pets` · `GET/PATCH/DELETE pets/:id` |
| Thread | `GET pets/:id/thread?date=` · `POST` · `PATCH/DELETE pets/:id/thread/:eid` |
| Vaccinations | `GET/POST pets/:id/vaccinations` · `POST …/:vid/book` `…/:vid/given` |
| Records | `GET/POST pets/:id/records` · `DELETE …/:rid` |
| Growth | `GET/POST pets/:id/weights` (band, 30-day change, points) |
| Feeding | `GET/PATCH pets/:id/feeding` (grams, kcal, meals, avoid list) |
| Spending | `GET pets/:id/expenses?month=YYYY-MM` · `POST` · `DELETE …/:xid` |
| Assistant | `POST pets/:id/assistant` `{question}` → `mightBe`, `whatToDo`, `seeVetWhen`, `urgency` |
| Emergency | `GET pets/:id/emergency?lat&lng` · `POST …/emergency/calls` · `PATCH …/calls/:cid` · `POST …/emergency/share` · public `GET share/:token` |
| Poster | `GET pets/:id/poster` (includes WhatsApp link) · `POST …/poster/share` |
| Community | `GET/POST community` · `GET community/:id` · `POST community/:id/answers` |
| Settings | `GET/PUT pets/:id/reminders` · `GET pets/:id/family` · `POST …/family/invite` · `POST pets/invites/:token/accept` · `GET pets/:id/export` |

## Things to know before going live

- **Assistant.** With `ANTHROPIC_API_KEY` set it asks the model for structured triage; without it, or on any
  failure, a built-in script answers. Red-flag words (poison, chocolate, seizure, bleeding, bloat…) force
  `urgency: "now"` regardless of source. The output is guidance, not diagnosis; have a vet review the
  script and the "foods to avoid" lists in `util.js` and `assistant.js` before real users rely on them.
- **Hospitals are sample rows** (3 in Bengaluru). Swap `nearby()` in `routes/emergency.js` for a places provider.
- **Email is a stub.** `sendMail()` in `routes/account.js` logs the reset token; connect a provider.
- **Push notifications** are not included. Reminders exist as thread entries; a scheduler that reads
  overdue entries is the next piece.
- **SQLite** is right for one server. For several, move to Postgres; queries are plain SQL.
