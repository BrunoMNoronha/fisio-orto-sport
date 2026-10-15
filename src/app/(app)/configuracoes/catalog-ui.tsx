import Link from "next/link";
export const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dateLabel = (date: Date) => date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
export function CatalogPagination({ page, pages, href }: { page: number; pages: number; href: string }) {
  return <nav aria-label="Paginação" className="flex flex-wrap gap-4 text-sm">
    {page > 1 && <Link className="underline" href={`${href}${href.includes("?") ? "&" : "?"}page=${page - 1}`}>Anterior</Link>}
    <span>Página {page} de {pages}</span>
    {page < pages && <Link className="underline" href={`${href}${href.includes("?") ? "&" : "?"}page=${page + 1}`}>Próxima</Link>}
  </nav>;
}
