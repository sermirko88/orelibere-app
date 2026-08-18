# OreLibere

App che converte ogni spesa in ore di lavoro, per aumentare la consapevolezza finanziaria.

## Sviluppo locale

Serve Node.js installato (versione 18 o superiore). Poi:

```bash
npm install
npm run dev
```

Apri il link che appare in terminale (di solito `http://localhost:5173`). Da telefono sulla stessa rete Wi-Fi puoi usare l'IP locale del computer (es. `http://192.168.1.x:5173`) per provarla sul cellulare mentre sviluppi.

## Build di produzione

```bash
npm run build
```

Crea la cartella `dist/` pronta per essere pubblicata su qualsiasi hosting statico.

## Mettere il progetto su GitHub

1. Crea un nuovo repository vuoto su [github.com/new](https://github.com/new) (es. `orelibere-app`), **senza** spuntare "Add a README" (ce l'hai già).
2. Da questa cartella, nel terminale:

```bash
git init
git add .
git commit -m "Primo commit: mockup OreLibere"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/orelibere-app.git
git push -u origin main
```

Sostituisci `TUO-USERNAME` con il tuo nome utente GitHub.

## Deploy online (per farla usare ai 5 amici)

Il modo più semplice: collega il repository GitHub a **Vercel** o **Netlify** (entrambi hanno un piano gratuito sufficiente per questo test).

**Con Vercel:**
1. Vai su [vercel.com](https://vercel.com), accedi con l'account GitHub.
2. "Add New Project" → seleziona il repository `orelibere-app`.
3. Vercel riconosce automaticamente che è un progetto Vite: lascia le impostazioni di default e clicca "Deploy".
4. Dopo 1-2 minuti ottieni un link tipo `orelibere-app.vercel.app` da mandare agli amici.
5. Da telefono, aprendo il link, si può fare "Aggiungi a schermata Home" per usarla come un'app vera.

Ogni volta che fai `git push` su GitHub, Vercel ricostruisce e aggiorna automaticamente il sito online.

## Stato attuale

Questo è ancora un **mockup funzionante ma senza backend vero**: i dati (spese, obiettivi, conti collegati) vivono solo nella memoria del browser e si perdono ricaricando la pagina. I conti bancari collegati sono simulati (dati finti), non è un vero collegamento Open Banking.

Prossimo passo per il test con gli amici: collegare un database vero (es. Supabase) così ogni persona ha il proprio account con dati che restano salvati.
