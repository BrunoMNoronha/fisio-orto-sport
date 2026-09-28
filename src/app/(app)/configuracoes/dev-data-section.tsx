"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { populateDevData, type DevDataActionState } from "@/modules/dados-ficticios/actions";
import { ENTITY_KEYS, ENTITY_LABELS, type EntityCounts } from "@/modules/dados-ficticios/catalog";
import type { DevDataPreview } from "@/modules/dados-ficticios/queries";

function CountList({ counts }: { counts: EntityCounts }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
      {ENTITY_KEYS.map((key) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{ENTITY_LABELS[key]}</dt>
          <dd className="text-right tabular-nums">{counts[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

// Seção "Desenvolvimento" (issue #73). Só é renderizada pelo servidor quando o ambiente está
// habilitado e o usuário é Administrador; a action repete todas as checagens.
export function DevDataSection({ preview, target }: { preview: DevDataPreview; target: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (): Promise<DevDataActionState> => {
    const result = await populateDevData();
    setOpen(false);
    return result;
  }, undefined);

  const exists = preview.status.state === "completo" || (state?.ok ?? false);
  const blocked = preview.professionals.length === 0 || preview.status.state === "incompleto";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Desenvolvimento</CardTitle>
        <CardDescription>
          Ferramentas disponíveis só neste ambiente de desenvolvimento ({target}). Nada aqui aparece em produção.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <strong>Popular com dados fictícios</strong> — conjunto <code>{preview.dataset}</code>: pacientes
            claramente fictícios, agenda com datas relativas a hoje e um fluxo clínico de exemplo. Operação aditiva:
            nada existente é alterado ou apagado, e nenhum usuário é criado ou modificado.
          </p>
        </div>

        {preview.status.state === "incompleto" && (
          <Alert variant="destructive">
            <AlertDescription>{preview.status.detail}</AlertDescription>
          </Alert>
        )}
        {preview.professionals.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Nenhum fisioterapeuta ativo com CREFITO cadastrado. Cadastre ou ative um em{" "}
              <Link href="/usuarios" className="underline underline-offset-4">
                Usuários
              </Link>{" "}
              antes de gerar os dados.
            </AlertDescription>
          </Alert>
        )}
        {preview.status.state === "completo" && !state && (
          <Alert>
            <AlertDescription>O conjunto {preview.dataset} já existe nesta base. Executar de novo não cria duplicatas.</AlertDescription>
          </Alert>
        )}

        {state?.ok === false && (
          <Alert variant="destructive" aria-live="polite">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.ok && (
          <Alert aria-live="polite">
            <AlertDescription className="flex flex-col gap-3">
              <span>
                {state.created
                  ? `Conjunto gerado (referência ${state.reference.split("-").reverse().join("/")}). Registros criados:`
                  : "O conjunto já existia; nada foi criado. Registros existentes do conjunto:"}
              </span>
              <CountList counts={state.counts} />
              <span>
                Veja em{" "}
                <Link href="/pacientes" className="underline underline-offset-4">
                  Pacientes
                </Link>{" "}
                e{" "}
                <Link href="/agenda" className="underline underline-offset-4">
                  Agenda
                </Link>
                .
              </span>
            </AlertDescription>
          </Alert>
        )}

        <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
          <DialogTrigger render={<Button variant="outline" className="self-start" disabled={blocked || pending} />}>
            {pending ? "Gerando…" : "Popular com dados fictícios"}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Popular com dados fictícios?</DialogTitle>
              <DialogDescription>
                {exists
                  ? `O conjunto ${preview.dataset} já existe: a execução só confirmará as contagens, sem criar nada.`
                  : `Serão criados, numa única operação, os registros abaixo em ${target}. Se algo falhar, nada é gravado.`}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex flex-col gap-2">
                <p className="font-medium">Quantidades previstas</p>
                <CountList counts={preview.expected} />
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-medium">Usuários existentes a utilizar</p>
                <ul className="list-disc pl-5">
                  <li>Você (Administrador): cadastra e assina os registros.</li>
                  {preview.professionals.map((p) => (
                    <li key={`${p.name}-${p.crefito}`}>
                      {p.name} (CREFITO {p.crefito}): profissional de {p.patients}{" "}
                      {p.patients === 1 ? "paciente" : "pacientes"}.
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <form action={formAction}>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? "Gerando…" : "Gerar dados fictícios"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
