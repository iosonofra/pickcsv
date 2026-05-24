# Picking Logistica MVP

Web app full-stack `Next.js + TypeScript + Prisma + SQLite` per gestione picking logistico con import Excel, PDF e codici scansionabili.

## Requisiti

- Node.js 20+
- npm 10+

## Setup rapido

```bash
copy .env.example .env
npm install
npm run db:generate
npm run db:push
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

Puoi configurare il token per l'upload automatico dalla tab `Impostazioni`.
`AUTO_IMPORT_API_TOKEN` in `.env` resta supportato come fallback.

## Funzionalita implementate

### Import Excel

- Upload file `.xlsx` e `.csv` (drag and drop + selettore file).
- Supporto CSV separato da `;`.
- Mappatura CSV aggiuntiva:
  - `Riferimento ordine` -> `Rif. ordine`
  - `Nome Cliente (Spedizione)` + `Cognome Cliente (Spedizione)` -> `Cliente`
  - `Nome del prodotto` -> riga prodotto
  - `Corriere` non presente -> campo lasciato vuoto
- Flusso guidato a step: `Carica -> Anteprima -> Conferma`.
- Endpoint anteprima import con riepilogo righe/ordini/scarti/duplicati.
- Parsing colonne:
  - `Riferimento ordine`
  - `Cliente`
  - `Nome del prodotto`
  - `Quantita del prodotto`
  - `Note`
  - `EAN`
  - `Nome corriere`
  - `ID prodotto`
- Raggruppamento ordini per `Riferimento ordine`.
- Scarto controllato righe senza `Riferimento ordine`.
- Rilevazione duplicati nello stesso import con logging errori.

### Gestione ordini

- Tab dedicata `Ordini Importati`.
- Filtri: ricerca testo, corriere, data da/a.
- Ricerca in tempo reale (debounce) mentre digiti.
- Selezione massiva ordini.
- Eliminazione singola e massiva ordini.
- Generazione PDF singolo ordine.
- Stato stampa ordine (`Mai stampato` / `Stampato xN`).

### Gestione batch

- Separazione batch:
  - `Recenti` (ultime 24h) in Home
  - `Storico` (>24h) in pagina dedicata.
- Ricerca batch multi-parola con highlight del match nel nome file.
- Ordinamento batch: `Piu recenti`, `Piu stampati`, `Piu ordini`, `Per stato`.
- Filtri rapidi stato:
  - `Tutti`
  - `Solo nuovi`
  - `Solo stampati`
  - `Solo con errori`
- Paginazione batch (8 per pagina).
- Selezione massiva su tabella.
- Eliminazione singola/massiva batch.
- Undo eliminazione batch entro 8 secondi (eliminazione pianificata).
- Download PDF batch.
- Ristampa ultimo batch dalla topbar.
- Visibilita `Dettaglio errori` solo se il batch ha errori.
- Naming PDF batch:
  - `PICKING_NOMEDELCORRIERE_DATAODIERNA`.

### PDF picking

- PDF singolo ordine.
- PDF batch compatto: 8 ordini per pagina (layout 2x4).
- Card ordine con:
  - intestazione e riferimento ordine
  - cliente, corriere, note
  - lista righe prodotto con quantita in `pz.`
- In caso di spazio insufficiente:
  - avviso con numero prodotti non visualizzati.

### Codice scansionabile: Barcode + QR

- Supporto a due modalita selezionabili:
  - `Barcode (Code128)`
  - `QR Code`
- Selettore in UI con spunta verde sull'opzione attiva.
- Applicato a:
  - PDF singolo ordine
  - PDF batch
  - ristampa ultimo batch
  - generazione PDF massiva batch.
- Default: `Code128`.

### UX / interfaccia

- Stile UI Material 3 (tema neutro).
- Layout piu compatto e lineare.
- KPI principali e tab di navigazione.
- Command bar sticky contestuale (azioni su selezioni).
- Empty state semplificati con CTA immediate.
- Toast/snackbar feedback visivo per azioni.
- `aria-live` per feedback accessibile.
- Focus visibile su controlli interattivi.
- Shortcut tastiera: `Ctrl+Invio` per anteprima import (step 1).
- Persistenza in sessione dell'ultima azione.

## API principali

- `POST /api/import/preview` anteprima import `.xlsx` o `.csv`
- `POST /api/import` conferma import `.xlsx` o `.csv`
- `POST /api/import/auto` import automatico autenticato `.xlsx` o `.csv` (`Authorization: Bearer <token>`)
- `GET /api/orders` ricerca ordini con filtri (`search`, `carrier`, `dateFrom`, `dateTo`)
- `GET /api/orders/:id` dettaglio ordine
- `DELETE /api/orders/:id` elimina ordine singolo
- `POST /api/orders/delete-many` elimina ordini massivamente
- `POST /api/orders/:id/pdf` genera PDF singolo (`codeType`: `CODE128` o `QRCODE`)
- `POST /api/documents/batch` genera PDF batch (`batchId` o `orderIds`, opzionale `codeType`)
- `GET /api/documents/:id/download` download PDF
- `GET /api/batches?scope=recent|history` lista batch recenti o storico
- `DELETE /api/batches/:id` elimina batch singolo
- `POST /api/batches/delete-many` elimina batch massivamente

## Storage e persistenza

- Database: SQLite via Prisma.
- PDF salvati in: `data/documents`.
- Storico import/batch/documenti salvato su DB con metadati stampa.

## Upload automatico da Windows

La cartella `tools/windows-sendto` contiene gli script per aggiungere una voce
nel menu Windows `Invia a`. Il default punta alla web app online:
`https://pick.iosonofra.click`.

### Configurazione server

Apri la tab `Impostazioni` nella web app, genera o inserisci un token API e
salvalo. Il token viene usato da `/api/import/auto` per autorizzare gli upload
da Windows.

In alternativa puoi impostare la variabile ambiente sulla web app:

```bash
AUTO_IMPORT_API_TOKEN="un-token-lungo-e-segreto"
```

Per generare un token da PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

### Installazione su Windows

Da PowerShell, entra nella cartella degli script:

```powershell
cd C:\pickcsv\tools\windows-sendto
```

Poi installa il collegamento:

```powershell
.\install-sendto.ps1 -Token "un-token-lungo-e-segreto"
```

Usa lo stesso token salvato nella tab `Impostazioni` della web app.

Per puntare a un ambiente locale:

```powershell
.\install-sendto.ps1 -BaseUrl "http://localhost:3000" -Token "un-token-lungo-e-segreto"
```

Lo script crea il collegamento per l'utente corrente in:
`%APPDATA%\Microsoft\Windows\SendTo\Carica su PickCSV.lnk`.

### Uso

1. Verifica che la web app sia raggiungibile.
2. Fai tasto destro su uno o piu file `.csv`/`.xlsx`.
3. Seleziona `Invia a` > `Carica su PickCSV`.
4. Lo script carica ogni file su `/api/import/auto`, mostra batch creato, ordini, scarti e duplicati, e invia una notifica Windows.
5. Se l'opzione e attiva nella tab `Impostazioni`, dopo un upload riuscito viene aperta automaticamente la dashboard.

I batch caricati da Windows vengono marcati come `Upload automatico` e salvano
PC sorgente, utente Windows, client id, IP rilevato e data upload.

## Installazione (Installazione pulita / ZIP)

Se hai ricevuto questo codice in un file ZIP o vuoi avviare l'applicazione da zero in un nuovo ambiente:

1. **Estrai l'archivio** in una cartella e apri il terminale al suo interno.
2. **Copia il file dell'ambiente**: rinomina o copia il file `.env.example` in `.env`.
3. **Installa le dipendenze**:
   ```bash
   npm install
   ```
4. **Inizializza il Database**: crea il database SQLite locale e sincronizza lo schema con il comando:
   ```bash
   npx prisma db push
   ```
5. **Avvia l'applicazione**:
   - Per provare e sviluppare (sviluppo locale):
     ```bash
     npm run dev
     ```
   - Per l'uso in produzione:
     ```bash
     npm run build
     npm run start
     ```

Apri `http://localhost:3000` nel tuo browser per iniziare a usare l'app.
