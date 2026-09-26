"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchActivePatients, type PatientOption, type PatientSearchResult } from "@/modules/agenda/actions";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;
const SEARCH_ERROR = "Não foi possível buscar pacientes. Tente novamente.";

type Status = "idle" | "loading" | "done" | "error";

// Busca de paciente ativo no servidor (padrão ARIA combobox + listbox). A seleção fica num
// campo oculto `name`, independente do texto digitado: refinar a busca não perde o paciente
// escolhido. Cada busca tem um número; só a resposta da busca mais recente é aplicada.
export function PatientCombobox({
  name,
  value,
  onChange,
  errors,
  search = searchActivePatients,
}: {
  name: string;
  value: PatientOption | null;
  onChange: (option: PatientOption) => void;
  errors?: string[];
  search?: (query: string) => Promise<PatientSearchResult>;
}) {
  const id = useId();
  const inputId = `${id}-busca`;
  const listId = `${id}-lista`;
  const errorId = `${id}-erro`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [items, setItems] = useState<PatientOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [active, setActive] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const latest = useRef(0);

  // Busca com debounce enquanto a lista está aberta; respostas antigas são descartadas.
  useEffect(() => {
    if (!open) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      setStatus("loading");
      let result: PatientSearchResult;
      try {
        result = await search(query);
      } catch {
        result = { error: SEARCH_ERROR };
      }
      if (request !== latest.current) return;
      if ("error" in result) {
        setItems([]);
        setHasMore(false);
        setStatus("error");
        setAnnouncement(result.error === "Acesso negado." ? result.error : SEARCH_ERROR);
        return;
      }
      setItems(result.items);
      setHasMore(result.hasMore);
      setActive(-1);
      setStatus("done");
      setAnnouncement(
        result.items.length === 0
          ? "Nenhum paciente ativo encontrado."
          : `${result.items.length}${result.hasMore ? " primeiros" : ""} pacientes encontrados.`,
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query, search]);

  function choose(option: PatientOption) {
    onChange(option);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return setOpen(true);
      if (items.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      // Com a lista aberta, Enter escolhe a opção destacada em vez de enviar o formulário.
      if (open) {
        event.preventDefault();
        if (active >= 0 && items[active]) choose(items[active]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else if (query) {
        setQuery("");
      }
    }
  }

  const describedBy = errors ? `${id}-ajuda ${errorId}` : `${id}-ajuda`;
  const activeId = open && active >= 0 && items[active] ? `${id}-opcao-${items[active].id}` : undefined;

  return (
    <div className="flex flex-col gap-2 sm:col-span-3">
      <Label htmlFor={inputId}>Paciente *</Label>
      <input type="hidden" name={name} value={value?.id ?? ""} />
      <p id={`${id}-ajuda`} className="text-sm">
        {value ? (
          <>
            <span className="text-muted-foreground">Selecionado: </span>
            <span className="font-medium">{value.label}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Nenhum paciente selecionado. Busque pelo nome e escolha na lista.</span>
        )}
      </p>
      <div className="relative">
        <Input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-invalid={errors ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder={value ? "Buscar outro paciente ativo" : "Buscar paciente ativo pelo nome"}
          value={query}
          maxLength={100}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
            <ul id={listId} role="listbox" aria-label="Pacientes ativos" className="max-h-64 overflow-auto py-1">
              {items.map((option, index) => (
                <li
                  key={option.id}
                  id={`${id}-opcao-${option.id}`}
                  role="option"
                  aria-selected={value?.id === option.id}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm",
                    index === active && "bg-accent text-accent-foreground",
                    value?.id === option.id && "font-medium",
                  )}
                  // Mantém o foco no campo; a escolha acontece no clique.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  {option.label}
                </li>
              ))}
            </ul>
            {status === "loading" && <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>}
            {status === "done" && items.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum paciente ativo encontrado.</p>
            )}
            {status === "done" && hasMore && (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                Mostrando os primeiros resultados. Refine a busca para encontrar outros.
              </p>
            )}
            {status === "error" && <p className="px-3 py-2 text-sm text-destructive">{announcement}</p>}
          </div>
        )}
      </div>
      {errors?.length ? (
        <p id={errorId} className="text-sm text-destructive">
          {errors[0]}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {open ? announcement : ""}
      </p>
    </div>
  );
}
