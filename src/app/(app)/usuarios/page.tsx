import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/modules/auth/dal";
import { ROLE_LABELS, can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/users/queries";
import {
  CreateUserDialog,
  EditUserDialog,
  ResetPasswordDialog,
  ToggleActiveButton,
} from "./user-dialogs";

export const metadata: Metadata = { title: "Usuários — TechLab+ Fisio OrtoSport" };

export default async function UsuariosPage() {
  const actor = await requirePermission("usuarios:ler");
  const canManage = can(actor.role, "usuarios:gerir");
  const users = await listUsers();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Contas de acesso da equipe e seus perfis.
          </p>
        </div>
        {canManage && <CreateUserDialog />}
      </div>

      {users.length === 0 ? (
        <p className="rounded-xl border bg-card shadow-xs px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum usuário cadastrado.
        </p>
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Situação</TableHead>
                {canManage && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === actor.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name}
                      {isSelf && <span className="text-muted-foreground"> (você)</span>}
                      <span className="block text-xs text-muted-foreground sm:hidden">{user.email}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{user.email}</TableCell>
                    <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                    <TableCell>
                      <Badge variant={user.active ? "secondary" : "outline"}>
                        {user.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <EditUserDialog user={user} />
                          <ResetPasswordDialog user={user} />
                          <ToggleActiveButton user={user} disabled={isSelf} />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
