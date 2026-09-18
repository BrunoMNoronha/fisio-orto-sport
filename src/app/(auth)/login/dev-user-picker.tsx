import { Button } from "@/components/ui/button";
import { devLogin, type listDevUsers } from "@/modules/auth/dev-login";
import { ROLE_LABELS } from "@/modules/auth/permissions";

type Props = { users: Awaited<ReturnType<typeof listDevUsers>>; next: string };

export function DevUserPicker({ users, next }: Props) {
  if (users.length === 0) return null;
  return (
    <section className="mt-6 border-t pt-4">
      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Acesso rápido (somente dev)</p>
      <ul className="flex flex-col gap-2">
        {users.map((u) => (
          <li key={u.id}>
            <form action={devLogin}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="next" value={next} />
              <Button type="submit" variant="outline" className="h-auto w-full justify-between py-2 text-left">
                <span className="flex flex-col">
                  <span className="font-medium">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[u.role]}</span>
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
