"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetDevDatabase, type ResetActionState } from "@/modules/manutencao/actions";

// Rótulos das tabelas da simulação (nomes técnicos ficam entre parênteses para conferência).
const TABLE_LABELS: Record<string, string> = {
  Session: "Sessões de login",
  AuthRateLimit: "Limites de tentativas de login",
  Patient: "Pacientes",
  Appointment: "Agendamentos",
  ScheduleBlock: "Bloqueios de agenda",
  Anamnesis: "Anamneses",
  Assessment: "Avaliações",
  AssessmentChange: "Histórico das avaliações",
  TherapyPlan: "Planos terapêuticos",
  TherapyPlanRevision: "Revisões de plano",
  TherapyPlanStatusChange: "Encerramentos/reaberturas de plano",
  TreatmentSession: "Atendimentos (sessões)",
  TreatmentSessionChange: "Histórico dos atendimentos",
  Reassessment: "Reavaliações",
  ReassessmentChange: "Histórico das reavaliações",
  Charge: "Cobranças",
  User: "Usuários",
  ClinicSettings: "Configurações",
  _prisma_migrations: "Histórico de migrações",
  AuditLog: "Auditoria",
};

function Counts({ values }: { values: Record<string, number> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
      {Object.entries(values).map(([table, n]) => (
        <div key={table} className="contents">
          <dt className="text-muted-foreground">
            {TABLE_LABELS[table] ?? table} <span className="text-xs">({table})</span>
          </dt>
          <dd className="text-right tabular-nums">{n}</dd>
        </div>
      ))}
    </dl>
  );
}

// Limpeza da base (#78). Só é renderizada pelo servidor com DEV_RESET_TARGET válido e para
// Administrador; a action repete todas as checagens e exige a confirmação digitada.
export function DevResetSection({
  target,
  database,
  preview,
}: {
  target: string;
  database: string;
  preview: { problems: string[]; keep: Record<string, number>; clear: Record<string, number> };
}) {
  const [state, formAction, pending] = useActionState<ResetActionState, FormData>(resetDevDatabase, undefined);
  const [typedDatabase, setTypedDatabase] = useState("");
  const [typedWord, setTypedWord] = useState("");
  const confirmed = typedDatabase.trim() === database && typedWord.trim() === "LIMPAR";
  const total = Object.values(preview.clear).reduce((sum, n) => sum + n, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Limpar a base</CardTitle>
        <CardDescription>
          Apaga pacientes, agenda (inclusive bloqueios), prontuário, sessões de login e limites de tentativa em{" "}
          {target}. Preserva todos os usuários (inclusive senhas, perfis e inativos), as configurações, o histórico de
          migrações e a auditoria. Não gera dados fictícios em seguida.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {preview.problems.length ? (
          <Alert variant="destructive">
            <AlertDescription>
              O banco não corresponde ao previsto; a limpeza está bloqueada. {preview.problems.join(" ")}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Será limpo (simulação: {total} registros)</p>
              <Counts values={preview.clear} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Será preservado</p>
              <Counts values={preview.keep} />
            </div>
          </div>
        )}

        {state?.error && (
          <Alert variant="destructive" aria-live="polite">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {!preview.problems.length && (
          <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-destructive/40 p-4">
            <p className="text-sm">
              Operação irreversível, numa única transação: se qualquer conferência falhar, nada é alterado. Depois dela,
              todas as sessões são encerradas, inclusive a sua, e você volta para o login.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="limpeza-banco">Digite o nome do banco ({database})</Label>
                <Input
                  id="limpeza-banco"
                  name="database"
                  autoComplete="off"
                  value={typedDatabase}
                  onChange={(event) => setTypedDatabase(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="limpeza-palavra">Digite LIMPAR</Label>
                <Input
                  id="limpeza-palavra"
                  name="word"
                  autoComplete="off"
                  value={typedWord}
                  onChange={(event) => setTypedWord(event.target.value)}
                />
              </div>
            </div>
            <Button type="submit" variant="destructive" className="self-start" disabled={!confirmed || pending}>
              {pending ? "Limpando…" : "Limpar a base"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
