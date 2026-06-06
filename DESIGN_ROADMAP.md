# QR Studio — Roadmap di Elevazione (Design Cinematografico + Logiche Perfette)

**Obiettivo:** portare QR Studio dal "funziona ma è piatto" allo standard cinematografico del design system, senza riscrivere lo stack (resta HTML/CSS/JS vanilla + Supabase + funzioni Vercel — la logica che funziona NON si tocca, si rifinisce).

**Principio:** un micro-task alla volta. Ogni task si chiude solo quando è funzionante e verificato. Niente avanti finché il precedente non è solido.

**Legenda priorità:** 🔴 P0 (blocca tutto) · 🟠 P1 (qualità percepita) · 🟢 P2 (rifinitura) · ⚪ P3 (nice-to-have)

---

## TRACCIA A — Fondamenta tecniche (sblocca tutto)

- [x] **A1 🔴 Verifica caricamento CSS.** Lo screenshot mostra la pagina senza stile (font serif, layout impilato): il foglio non viene applicato. Servire il sito via HTTP locale (`npx serve` o `python -m http.server`), non via `file://`. Confermare che `assets/css/style.css` carichi (Network 200). *DoD: la pagina appare con tema dark, non serif.*
- [x] **A2 🔴 Design tokens unificati.** Sostituire le variabili attuali (`--bg`, `--panel`…) con il set completo del design system (palette, shadow stratificati, `--ease-*`, spacing 8px, radius). Mappare i nomi vecchi sui nuovi per non rompere il CSS esistente. *DoD: `:root` allineato a CLAUDE.md.*
- [x] **A3 🟠 Font display + mono.** Aggiungere `Space Grotesk` (heading/numeri) e `JetBrains Mono` (badge/prezzi/codici) oltre a Inter. `font-display: swap`. *DoD: heading in display, short-code in mono.*
- [x] **A4 🟢 Reset & base type scale.** Letter-spacing negativo sui heading, line-height 1.6–1.7 sul body, scala tipografica a step (11/13/15/20/26/34px). *DoD: gerarchia tipografica coerente.*

## TRACCIA B — Shell dell'app (navbar, sidebar, layout)

- [ ] **B1 🟠 Sidebar premium.** Sostituire le emoji con icone SVG (inline, stroke 1.5). Stato active con gradient sottile + barra accent a sinistra, hover con transizione. *DoD: nav senza emoji, stati chiari.*
- [ ] **B2 🟠 Header pagina + breadcrumb.** Topbar sticky con glassmorphism, titolo pagina + sottotitolo, avatar/azienda a destra. *DoD: header coerente su tutte le sezioni.*
- [ ] **B3 🟢 Sidebar responsive.** Mobile: hamburger → drawer animato (translateX + overlay), non il flex-wrap attuale. *DoD: navigazione usabile a 375px.*
- [ ] **B4 🟢 Scroll reveal.** IntersectionObserver + classe `.reveal` con stagger sui pannelli below-the-fold. Rispettare `prefers-reduced-motion`. *DoD: ingresso animato dei pannelli.*

## TRACCIA C — Schermata Genera (il cuore)

- [ ] **C1 🟠 Pannelli ridisegnati.** Card con shadow stratificati, padding 24–32px, border sottile→hover, h3 con micro-label uppercase mono. *DoD: pannelli "Contenuto/Design/Anteprima" cinematografici.*
- [ ] **C2 🟠 Form di livello.** Input height 48px, focus ring `rgba(accent,.12)`, label sopra (già ok), color-picker con swatch arrotondato e anteprima live. Validazione inline. *DoD: form che rispetta la sezione FORM DESIGN.*
- [ ] **C3 🟠 Stage anteprima QR cinematografico.** Cornice del QR con sfondo a gradient mesh sottile, ombra morbida, transizione su update. Stato vuoto illustrato (non testo grigio). *DoD: anteprima che "vende".*
- [ ] **C4 🟢 Selettore tipo come segmented/cards.** I 9 tipi (URL, file, WiFi…) come griglia di chip con icona invece del `<select>`. *DoD: scelta tipo visuale.*
- [ ] **C5 🟢 Toggle dinamico evidenziato.** Il check "QR dinamico" diventa un toggle switch con micro-spiegazione e badge "+ analytics". *DoD: differenza statico/dinamico chiara a colpo d'occhio.*

## TRACCIA D — I miei QR / Analytics / Modali

- [ ] **D1 🟠 Product-card per i QR.** Griglia `auto-fill minmax(280px,1fr)`, thumb QR su superficie chiara, badge dyn/stat in mono, hover translateY + shadow-lg + border-accent. *DoD: lista QR come card-grid premium.*
- [ ] **D2 🟠 Empty state illustrato.** SVG + messaggio empatico + CTA "Genera il tuo primo QR". *DoD: nessuna lista mostra testo grigio nudo.*
- [ ] **D3 🟠 Skeleton loading.** Sostituire i "…" e i caricamenti con skeleton shimmer (card, analytics). MAI spinner. *DoD: fetch mostra skeleton.*
- [ ] **D4 🟢 Modale analytics ridisegnata.** Stat-box con numeri in display, grafico con gradient fill accent + tooltip custom, distribuzione device come barre, non solo chip. *DoD: analytics leggibile e bella.*
- [ ] **D5 🟢 Modali e toast.** Modal con backdrop blur + entrata spring; toast con icona stato (ok/err), barra di durata. Il `confirmModal` già introdotto eredita lo stile. *DoD: feedback coerente.*

## TRACCIA E — Auth & Branding & Dominio

- [ ] **E1 🟠 Auth card cinematografica.** Sfondo con gradient mesh/film grain leggero, card glass, tab con underline animato, micro-trust ("dati protetti"). *DoD: login che ispira fiducia.*
- [ ] **E2 🟢 Pagina branding con preview live.** Mostrare un QR di esempio che si aggiorna mentre l'utente cambia palette/logo. *DoD: feedback immediato sul brand.*
- [ ] **E3 🟢 Stato dominio come stepper.** I 3 stati (none/pending/active) come timeline visuale con istruzioni DNS in blocco mono copiabile (bottone "copia"). *DoD: flusso dominio chiarissimo.*

## TRACCIA F — Logiche perfette (hardening, in parallelo)

- [ ] **F1 🔴 Verifica RLS su tutte le tabelle.** Confermare/abilitare policy su `tenants`, `memberships`, `branding`, `qr_codes`, `scans` (l'anon key è pubblica). *DoD: query cross-tenant negata.*
- [ ] **F2 🟠 Gestione errori uniforme.** Tutti i `catch`/`error` passano da un helper unico → toast + stato; niente errori silenziosi. *DoD: ogni fallimento è visibile.*
- [ ] **F3 🟠 Stati di caricamento sui bottoni.** Save/Bulk/Dominio: bottone disabilitato + label "…in corso" durante le await (anti doppio-submit). *DoD: nessun doppio invio possibile.*
- [ ] **F4 🟠 Validazione input runtime.** URL/email/telefono validati prima del save; WiFi/vCard con escape dei caratteri speciali (`;`, `,`, `:`). *DoD: payload QR sempre validi.*
- [ ] **F5 🟢 Bulk robusto.** Progress bar reale (n/totale), report righe saltate, limite dimensione/righe, ZIP nominato con data. *DoD: bulk affidabile su CSV grandi.*
- [ ] **F6 🟢 A11y.** Focus-visible su tutti gli interattivi, ARIA su modali/toast, contrasto AA verificato, navigazione tastiera. *DoD: usabile da tastiera/screen reader.*
- [ ] **F7 🟢 Performance.** Caricare le librerie CDN (jsPDF, JSZip, Papa, Chart) solo nella sezione che le usa (lazy); `loading="lazy"` sui loghi. *DoD: prima paint più rapida.*
- [ ] **F8 ⚪ Pulizia.** Rimuovere `STATE.editingDynamicId` inutilizzato, centralizzare `randCode`/`escapeHtml`, commenti solo dove serve. *DoD: zero dead code.*

## TRACCIA G — Rilascio

- [ ] **G1 🟠 Collaudo end-to-end** su dominio Vercel: registrazione → branding → QR dinamico → scansione reale → analytics → isolamento tenant.
- [ ] **G2 🟢 Meta/OG/SEO** su index e app: title, description, favicon `◵`, og-image.
- [ ] **G3 🟢 Commit + push** ad ogni traccia chiusa (un commit per traccia, messaggio descrittivo).

---

## Ordine consigliato di esecuzione
**A1 → A2 → A3 → F1** (sblocco visivo + sicurezza), poi **B1–B2 → C1–C3 → D1–D3** (le schermate che si vedono di più), poi rifinitura **C4–C5, D4–D5, E*, F2–F8**, infine **G***.
