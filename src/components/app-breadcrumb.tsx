"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const LABELS: Record<string, string> = {
  pacientes: "Pacientes",
  agenda: "Agenda",
  usuarios: "Usuários",
  novo: "Novo",
  editar: "Editar",
  reagendar: "Reagendar",
  anamnese: "Anamnese",
  nova: "Nova versão",
  historico: "Histórico",
  agendamentos: "Agendamentos",
  documentos: "Documentos",
  avaliacoes: "Avaliações",
  planos: "Planos",
  revisar: "Revisar",
  revisoes: "Revisões",
}

// Rótulos que dependem do segmento anterior (ex.: "nova" em avaliacoes não é "Nova versão").
const CONTEXT_LABELS: Record<string, string> = {
  "avaliacoes/nova": "Nova avaliação",
  "planos/novo": "Novo plano",
}

export function AppBreadcrumb() {
  const segments = usePathname().split("/").filter(Boolean)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className={segments.length ? "hidden md:block" : undefined}>
          {segments.length === 0 ? (
            <BreadcrumbPage>Início</BreadcrumbPage>
          ) : (
            <BreadcrumbLink render={<Link href="/" />}>Início</BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const href = "/" + segments.slice(0, index + 1).join("/")
          const label = CONTEXT_LABELS[`${segments[index - 1]}/${segment}`] ?? LABELS[segment] ?? "Detalhes"
          const last = index === segments.length - 1
          return (
            <Fragment key={href}>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className={last ? undefined : "hidden md:block"}>
                {last ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={href} />}>{label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
