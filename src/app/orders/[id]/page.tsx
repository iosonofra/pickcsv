import Link from "next/link";
import { notFound } from "next/navigation";
import dayjs from "dayjs";
import { ensureDbSchema, prisma } from "@/lib/db";

type Props = {
  params: {
    id: string;
  };
};

export default async function OrderDetailPage({ params }: Props) {
  await ensureDbSchema();
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      batch: true,
      lines: true,
      documents: {
        orderBy: {
          createdAt: "desc"
        },
        take: 20
      }
    }
  });

  if (!order) {
    notFound();
  }

  return (
    <div className="app-shell">
      <section className="topbar">
        <h1 className="title">Dettaglio ordine {order.orderReference}</h1>
        <p className="subtitle">
          Cliente: {order.clientName ?? "-"} | Corriere: {order.carrierName ?? "-"} | Import:{" "}
          {dayjs(order.batch.createdAt).format("DD/MM/YYYY HH:mm")}
        </p>
        <p className="subtitle">
          Barcode: {order.barcodeValue} | Stampato: {order.isPrinted ? `Si (${order.printedCount})` : "No"}
        </p>
        <div className="row">
          <Link className="link" href="/">
            Torna alla dashboard
          </Link>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Righe prodotto</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>Qta</th>
                <th>EAN</th>
                <th>ID prodotto</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.productName ?? "-"}</td>
                  <td>{line.quantity}</td>
                  <td>{line.ean ?? "-"}</td>
                  <td>{line.productId ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="section-title">Documenti generati</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Nome file</th>
                <th>Creato il</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {order.documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.type}</td>
                  <td>{doc.fileName}</td>
                  <td>{dayjs(doc.createdAt).format("DD/MM/YYYY HH:mm")}</td>
                  <td>
                    <a className="link" href={`/api/documents/${doc.id}/download`} target="_blank" rel="noreferrer">
                      Apri PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
