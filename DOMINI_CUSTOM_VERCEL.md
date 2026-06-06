# 🌐 Domini personalizzati — Setup con Vercel

I clienti possono collegare il proprio dominio (es. `qr.suaazienda.it`) ai loro QR, con HTTPS automatico.
Tutto gira sul **tuo progetto Vercel** + **Supabase** (database/auth/storage). Niente Cloudflare, niente dominio "base" da comprare.

## Come funziona
1. Il cliente, in **Branding → Dominio personalizzato**, inserisce `qr.suaazienda.it`.
2. La funzione `/api/domains` lo aggiunge al tuo progetto Vercel via API.
3. Il cliente crea un record **CNAME**: `qr` → `cname.vercel-dns.com`.
4. Vercel verifica ed emette il certificato HTTPS in automatico → dominio **attivo**.
5. I QR dinamici del cliente puntano a `https://qr.suaazienda.it/r/{code}`; la funzione `/api/r/[code]` registra la scansione (su Supabase) e reindirizza.

---

## Setup (una volta sola)

### 1. Deploy del progetto
- Push del repo su GitHub → importa il progetto su **Vercel** (deploy automatico).
- Il sito statico + le funzioni in `/api` vengono pubblicate insieme.

### 2. Variabili d'ambiente su Vercel
Project → Settings → Environment Variables:

```
SUPABASE_URL               = https://cchgdmanbzjgwwksungw.supabase.co
SUPABASE_SERVICE_ROLE_KEY  = <service role key di Supabase>   # SOLO server, mai nel frontend
VERCEL_TOKEN               = <token API Vercel>
VERCEL_PROJECT_ID          = <id del progetto Vercel>
VERCEL_TEAM_ID             = <id del team, solo se il progetto è in un team>
```

- **Service role key**: Supabase → Project Settings → API → `service_role`. È segreta: vive solo nelle env di Vercel, non nel frontend.
- **Vercel token**: vercel.com/account/tokens → Create Token.
- **Project ID / Team ID**: Vercel → Settings del progetto (Project ID) e Settings del team.

### 3. Fatto
Da quel momento i clienti collegano i domini in autonomia dal pannello. Nessun altro passaggio manuale.

---

## Note
- Finché le env Vercel non sono impostate, il pannello dominio mostra un errore chiaro ("Vercel non configurato"); tutto il resto dell'app funziona sul dominio Vercel di default.
- Consiglia ai clienti un **sottodominio** (`qr.`, `link.`): il CNAME è più semplice del dominio radice.
- I QR creati **prima** di attivare il dominio continuano a puntare al dominio precedente; i nuovi useranno quello custom.
- **Supabase resta il backend**: database, autenticazione, storage dei file/loghi e analytics. Vercel ospita frontend + funzioni di redirect/domini.
