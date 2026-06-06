# QR Code Generator — White-Label SaaS · Roadmap

**Obiettivo:** un generatore QR definitivo, multi-tenant. Chiunque si registra ottiene il suo "motorino" QR brandizzato per la propria azienda. QR dinamici + analytics. Gratis per tutti.

**Architettura:** Frontend statico (GitHub Pages) + Backend Supabase (auth, database, storage, edge functions).

**Stack:** HTML/JS/CSS vanilla o leggero · Supabase JS · libreria QR con supporto logo/forme/gradienti · Edge Functions (Deno) per redirect e tracking.

**Strumenti/Skill usati:** Supabase MCP (setup backend), skill `titano` e `marketplace-cinematic-design` (UI premium). Già disponibili, nessuna installazione richiesta.

---

## Principio di esecuzione
Si procede **un microtask alla volta**. Ogni task si chiude solo quando è funzionante e verificato. Niente avanti finché il precedente non è solido.

---

## Fasi e microtask

### Fase 0 — Fondamenta
1. **Scaffolding progetto e struttura repo** — cartelle frontend + supabase, file base, README, .gitignore.
2. **Setup progetto Supabase** — auth email, bucket storage loghi, URL + publishable key.

### Fase 1 — Database
3. **Schema multi-tenant** — tabelle: `tenants`, `memberships`, `branding`, `qr_codes`, `scans`.
4. **Row Level Security** — ogni azienda vede solo i propri dati. Isolamento testato.

### Fase 2 — Account
5. **Auth frontend** — signup/login/recupero. Alla registrazione si crea il tenant + membership owner.

### Fase 3 — Generatore
6. **Generatore core** — input: URL, testo, email, telefono, SMS, WiFi, vCard, evento. Anteprima live.
7. **Personalizzazione** — colori, gradienti, forme moduli, logo centrale, correzione errori, margine/dimensione.
8. **Export** — PNG alta risoluzione, SVG, PDF stampa.

### Fase 4 — White-label
9. **Branding per azienda** — pannello dove l'azienda salva logo, palette, font, template. Il generatore applica il brand del tenant loggato.

### Fase 5 — QR dinamici + analytics
10. **Edge Function redirect** — `/r/{id}` registra lo scan e reindirizza alla destinazione corrente.
11. **Gestione QR dinamici** — destinazione modificabile dopo la stampa, lista QR per tenant.
12. **Dashboard analytics** — scansioni nel tempo, per dispositivo, per area geografica, grafici.

### Fase 6 — Scala e rilascio
13. **Generazione bulk da CSV** — molti QR in un colpo, cartelle/progetti, export zip.
14. **Deploy GitHub Pages + collaudo end-to-end** — pubblicazione, env, test completo (registrazione → branding → QR dinamico → scansione reale → analytics → isolamento aziende).

---

## Note decise insieme
- Backend: **Supabase** (config gestita da Claude).
- QR dinamici + analytics: **sì** (richiedono Edge Function).
- Piani: **gratis per tutti** (struttura predisposta per aggiungere tier in futuro).
