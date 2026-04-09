import Link from "next/link";
import dayjs from "dayjs";
import { notFound } from "next/navigation";
import { ensureDbSchema, prisma } from "@/lib/db";

type Props = {
  params: {
    id: string;
  };
};

export default async function BatchDetailPage({ params }: Props) {
  await ensureDbSchema();
  const batch = await prisma.importBatch.findUnique({
    where: { id: params.id },
    include: {
      errors: {
        orderBy: {
          rowNumber: "asc"
        },
        take: 500
      },
      _count: {
        select: {
          orders: true,
          errors: true
        }
      }
    }
  });

  if (!batch) {
    notFound();
  }

  return (
    <div className="app-shell">
      <section className="topbar">
        <h1 className="title">Errori import batch</h1>
        <p className="subtitle">
          File: {batch.sourceFile} | Data: {dayjs(batch.createdAt).format("DD/MM/YYYY HH:mm")} | Ordini:{" "}
          {batch._count.orders} | Errori: {batch._count.errors}
        </p>
        <div className="row">
          <Link className="link" href="/">
            Torna alla dashboard
          </Link>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Dettaglio righe scartate e duplicate</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Riga Excel</th>
                <th>Errore</th>
                <th>Dati grezzi</th>
              </tr>
            </thead>
            <tbody>
              {batch.errors.map((err) => (
                <tr key={err.id}>
                  <td>{err.rowNumber}</td>
                  <td>{err.message}</td>
                  <td>{err.rawData ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
