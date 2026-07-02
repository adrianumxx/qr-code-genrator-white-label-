# ◵ QR Studio — Generatore QR White-Label

🔗 **Produzione:** https://qr-studiob2b.vercel.app · deploy automatico ad ogni push su `main`.

SaaS multi-tenant per creare QR code brandizzati. Ogni azienda che si registra ottiene il suo motore QR: generazione illimitata, QR statici e **dinamici** (destinazione modificabile dopo la stampa) con **analytics di scansione**.

Frontend statico + funzioni serverless **Vercel** (`/api`) + backend **Supabase** (auth, database, storage, edge function). I QR dinamici e i domini custom richiedono le funzioni Vercel: il deploy avviene su **Vercel**, non su GitHub Pages.

## Funzionalità
- Registrazione/login per azienda — ogni tenant è isolato (Row Level Security)
- QR per: URL, testo, email, telefono, SMS, WiFi, vCard, evento
- Personalizzazione: colori, gradienti, forma moduli, angoli, logo centrale, correzione errori, margine
- Export **PNG / SVG / PDF**
- **QR dinamici**: link modificabile senza ristampare + tracking scansioni
- **Analytics**: totali, ultimi 7 giorni, grafico nel tempo, dispositivi, paesi
- **Branding aziendale**: logo + palette salvati e applicati ai QR
- **Bulk da CSV**: genera molti QR in uno ZIP (anche dinamici)
- **Domini personalizzati per cliente** (es. `qr.acme.com`) via Vercel — HTTPS automatico. Vedi `DOMINI_CUSTOM_VERCEL.md`

## Deploy: GitHub → Vercel
1. Push del repo su GitHub.
2. Importa il progetto su **Vercel** (deploy automatico ad ogni push).
3. Imposta le Environment Variables su Vercel (vedi `DOMINI_CUSTOM_VERCEL.md`).
4. Apri l'URL `.vercel.app`. Fatto.

Il frontend statico e le funzioni in `/api` vengono pubblicati insieme.
Il file `assets/js/config.js` contiene URL e chiave pubblica Supabase (sicura lato client: i dati sono protetti da RLS). Le chiavi segrete (service role, token Vercel) stanno SOLO nelle env di Vercel.

## Backend Supabase (già configurato)
- Project ref: `cchgdmanbzjgwwksungw`
- Tabelle: `tenants`, `memberships`, `branding`, `qr_codes`, `scans`
- Storage: `logos`, `files`
- Edge function `r`: redirect+scan (fallback, sempre attiva)
- Trigger: alla registrazione crea automaticamente tenant + membership + branding
- Auth bootstrap SQL: applica `supabase/auth_bootstrap.sql` nel SQL Editor Supabase per creare/riparare automaticamente il workspace utente.

## Funzioni Vercel
- `/api/r/[code]` — redirect + tracking scansioni (usata dal dominio Vercel e dai domini custom)
- `/api/domains` — collega/verifica/rimuove i domini custom dei clienti via API Vercel

## Struttura
```
index.html             # login / registrazione
app.html               # dashboard (genera, i miei QR, bulk, branding)
assets/css/style.css
assets/js/config.js    # config Supabase + CNAME target
assets/js/app.js       # logica app
api/r/[code].js        # redirect + scan (Vercel)
api/domains.js         # gestione domini custom (Vercel)
vercel.json            # rewrite /r/:code
```

## Note
- Piani: gratis per tutti (struttura predisposta per aggiungere tier in futuro).
- I QR statici funzionano anche offline; i dinamici usano le funzioni Vercel (o la edge function Supabase come fallback).
- **Architettura**: Vercel ospita frontend + funzioni; **Supabase** resta il backend (DB, auth, storage, analytics).
