import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangleIcon, ArrowRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listPatientAppointments } from "@/modules/agenda/queries";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { listAssessments } from "@/modules/clinico/assessment-queries";
import { getCurrentAnamnesis } from "@/modules/clinico/queries";
import { PAIN_TYPE_LABELS } from "@/modules/clinico/validation";
import { getPatient } from "@/modules/pacientes/queries";
import { SEX_LABELS, formatCpf, formatPhone } from "@/modules/pacientes/validation";
import { formatDateTime, formatDay, formatTime } from "../../agenda/format";
import { formatAge, formatDate } from "../format";

export const metadata: Metadata = { title: "Paciente — TechLab+ Fisio OrtoSport" };

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value || "—"}</dd>
    </div>
  );
}

function painColor(value: number) {
  if (value >= 7) return "text-destructive";
  if (value >= 4) return "text-amber-600 dark:text-amber-400";
  return "text-primary";
}

export default async function PacientePage({ params }: PageProps<"/pacientes/[id]">) {
  const actor = await requirePermission("pacientes:ler");
  // Recepção não vê o resumo clínico; as queries clínicas também exigem `clinico:ler`.
  const canReadClinical = can(actor.role, "clinico:ler");
  const canReadAgenda = can(actor.role, "agenda:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const active = patient.status === "ATIVO";
  const canWriteClinical = can(actor.role, "clinico:gerir") && active;
  const [upcoming, anamnesis, assessments] = await Promise.all([
    canReadAgenda ? listPatientAppointments(patient.id, { upcoming: true, take: 20 }) : null,
    canReadClinical ? getCurrentAnamnesis(patient.id) : null,
    canReadClinical ? listAssessments(patient.id, 1) : null,
  ]);
  const latestAssessment = assessments?.items[0];
  const nextAppointments = upcoming?.filter((item) => item.status === "AGENDADO").slice(0, 3) ?? [];
  const hasGuardian = Boolean(patient.guardianName || patient.guardianPhone);
  const base = `/pacientes/${patient.id}`;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados pessoais e contato</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item
                label="Data de nascimento"
                value={`${formatDate(patient.birthDate)} (${formatAge(patient.birthDate)})`}
              />
              <Item label="Sexo" value={patient.sex ? SEX_LABELS[patient.sex] : null} />
              <Item label="Profissão" value={patient.occupation} />
              <Item label="CPF" value={patient.cpf ? formatCpf(patient.cpf) : null} />
              <Item label="Telefone" value={formatPhone(patient.phone)} />
              <Item label="E-mail" value={patient.email} />
              <div className="sm:col-span-2">
                <Item label="Endereço" value={patient.address} />
              </div>
            </dl>
          </CardContent>
        </Card>

        {hasGuardian && (
          <Card>
            <CardHeader>
              <CardTitle>Responsável legal</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label="Nome" value={patient.guardianName} />
                <Item label="Telefone" value={patient.guardianPhone ? formatPhone(patient.guardianPhone) : null} />
                <Item label="Parentesco ou relação" value={patient.guardianRelationship} />
              </dl>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Observações administrativas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{patient.notes || "—"}</p>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Cadastrado em {formatDateTime(patient.createdAt)} · atualizado em {formatDateTime(patient.updatedAt)}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {canReadAgenda && (
          <Card>
            <CardHeader>
              <CardTitle>Próximos atendimentos</CardTitle>
              <CardAction>
                <Link
                  href={`${base}/agendamentos`}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  Ver todos <ArrowRightIcon className="size-3.5" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              {nextAppointments.length === 0 ? (
                <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhum atendimento agendado.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {nextAppointments.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/agenda/${item.id}`}
                        className="flex flex-col rounded-lg bg-muted/60 px-3 py-2 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="font-medium first-letter:uppercase">{formatDay(item.startsAt)}</span>
                        <span className="text-muted-foreground">
                          {formatTime(item.startsAt)}–{formatTime(item.endsAt)} · {item.professional.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {canReadClinical && (
          <Card>
            <CardHeader>
              <CardTitle>Anamnese</CardTitle>
              {anamnesis && (
                <CardDescription>
                  {formatDate(anamnesis.assessmentDate)} · {anamnesis.authorNameSnapshot}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {anamnesis ? (
                <>
                  <dl>
                    <Item label="Queixa principal" value={anamnesis.chiefComplaint} />
                  </dl>
                  {anamnesis.painIntensity !== null && (
                    <div className="flex items-end gap-4 rounded-lg bg-muted/60 p-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Dor (EVA)</span>
                        <span className={cn("text-2xl font-semibold tabular-nums", painColor(anamnesis.painIntensity))}>
                          {anamnesis.painIntensity}/10
                        </span>
                      </div>
                      {(anamnesis.painLocation || anamnesis.painTypes.length > 0) && (
                        <div className="flex min-w-0 flex-col text-sm">
                          <span className="truncate">{anamnesis.painLocation}</span>
                          <span className="text-muted-foreground">
                            {anamnesis.painTypes.map((type) => PAIN_TYPE_LABELS[type]).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {(anamnesis.surgeries || anamnesis.currentMedications) && (
                    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                      <span className="flex items-center gap-1.5 font-medium">
                        <AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />
                        Atenção
                      </span>
                      {anamnesis.currentMedications && (
                        <p className="line-clamp-3">
                          <span className="text-muted-foreground">Medicamentos: </span>
                          {anamnesis.currentMedications}
                        </p>
                      )}
                      {anamnesis.surgeries && (
                        <p className="line-clamp-3">
                          <span className="text-muted-foreground">Cirurgias: </span>
                          {anamnesis.surgeries}
                        </p>
                      )}
                    </div>
                  )}
                  <Link href={`${base}/anamnese`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Ver anamnese completa
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Nenhuma anamnese registrada.</p>
                  {canWriteClinical && (
                    <Link href={`${base}/anamnese/nova`} className={buttonVariants({ size: "sm" })}>
                      Registrar anamnese
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {assessments && (
          <Card>
            <CardHeader>
              <CardTitle>Avaliações</CardTitle>
              {latestAssessment && (
                <CardDescription>
                  {assessments.total === 1 ? "1 avaliação" : `${assessments.total} avaliações`} · última em{" "}
                  {formatDate(latestAssessment.assessmentDate)}, por {latestAssessment.authorNameSnapshot}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {latestAssessment ? (
                <Link
                  href={`${base}/avaliacoes/${latestAssessment.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Ver última avaliação
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma avaliação registrada.</p>
              )}
              {canWriteClinical && anamnesis && (
                <Link href={`${base}/avaliacoes/nova`} className={buttonVariants({ size: "sm" })}>
                  Nova avaliação inicial
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
