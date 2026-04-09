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
