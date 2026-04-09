import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="app-shell">
      <section className="topbar">
        <h1 className="title">Elemento non trovato</h1>
        <p className="subtitle">La risorsa richiesta non esiste o non e piu disponibile.</p>
        <Link className="link" href="/">
          Torna alla dashboard
        </Link>
      </section>
    </div>
  );
}
