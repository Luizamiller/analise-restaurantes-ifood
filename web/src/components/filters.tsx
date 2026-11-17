import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { api, type Filtros } from "@/lib/api";
import { cn } from "@/lib/utils";

export function useFiltros(): [Filtros, (f: Partial<Filtros>) => void, () => void] {
  const [p, setP] = useSearchParams();
  const f: Filtros = {
    coleta: p.get("coleta") === "nov" ? "nov" : "fev",
    uf: p.getAll("uf"), regiao: p.getAll("regiao"), categoria: p.getAll("categoria"), faixa_preco: p.getAll("faixa_preco"),
    frete_gratis: p.get("frete_gratis") == null ? null : p.get("frete_gratis") === "true",
  };
  const set = (novo: Partial<Filtros>) => {
    const m = { ...f, ...novo };
    const q = new URLSearchParams();
    if (m.coleta === "nov") q.set("coleta", "nov");
    (["uf", "regiao", "categoria", "faixa_preco"] as const).forEach((k) => m[k].forEach((v) => q.append(k, v)));
    if (m.frete_gratis != null) q.set("frete_gratis", String(m.frete_gratis));
    ["busca", "ordem", "direcao"].forEach((k) => p.get(k) && q.set(k, p.get(k)!));
    setP(q, { replace: true });
  };
  return [f, set, () => setP({}, { replace: true })];
}

function Multi({ rotulo, opcoes, valor, onChange }: { rotulo: string; opcoes: string[]; valor: string[]; onChange: (v: string[]) => void }) {
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => opcoes.filter((o) => o.toLowerCase().includes(busca.toLowerCase())), [opcoes, busca]);
  return (
    <Popover.Root>
      <Popover.Trigger className={cn("inline-flex h-9 items-center gap-1.5 rounded-[6px] border px-3 text-[13px] transition-colors",
        valor.length ? "border-ink bg-surface text-ink" : "border-line-strong text-ink-2 hover:border-ink-3")}>
        {rotulo}{valor.length > 0 && <span className="rounded-[4px] bg-ink px-1.5 font-mono text-[11px] text-paper">{valor.length}</span>}
        <ChevronDown className="size-3.5 text-ink-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-[260px] rounded-[8px] border border-line bg-surface p-2 shadow-xl">
          {opcoes.length > 8 && (
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar" aria-label={`Filtrar ${rotulo}`}
              className="mb-2 h-8 w-full rounded-[6px] border border-line-strong bg-paper px-2.5 text-[13px] outline-none focus:border-accent" />
          )}
          <ul className="max-h-64 overflow-y-auto scrollbar-thin" role="listbox" aria-multiselectable aria-label={rotulo}>
            {lista.map((o) => {
              const on = valor.includes(o);
              return (
                <li key={o} role="option" aria-selected={on}>
                  <button onClick={() => onChange(on ? valor.filter((x) => x !== o) : [...valor, o])}
                    className="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-[13px] hover:bg-sunken">
                    <span className={cn("grid size-4 place-items-center rounded-[3px] border", on ? "border-ink bg-ink text-paper" : "border-line-strong")}>
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>{o}
                  </button>
                </li>
              );
            })}
          </ul>
          {valor.length > 0 && <button onClick={() => onChange([])} className="mt-2 w-full border-t border-line pt-2 text-left text-[12px] text-ink-3 hover:text-ink">Limpar seleção</button>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function BarraFiltros({ semColeta, semUf }: { semColeta?: boolean; semUf?: boolean }) {
  const [f, set, limpar] = useFiltros();
  const { data: op } = useQuery({ queryKey: ["opcoes"], queryFn: api.opcoes, staleTime: Infinity });
  const ativos = f.uf.length + f.regiao.length + f.categoria.length + f.faixa_preco.length + (f.frete_gratis != null ? 1 : 0) + (f.coleta === "nov" ? 1 : 0);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
      {!semColeta && (
        <div className="inline-flex h-9 rounded-[6px] border border-line-strong p-0.5" role="radiogroup" aria-label="Coleta">
          {(["fev", "nov"] as const).map((c) => (
            <button key={c} role="radio" aria-checked={f.coleta === c} onClick={() => set({ coleta: c })}
              className={cn("rounded-[4px] px-3 text-[13px]", f.coleta === c ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>
              {c === "fev" ? "fev/2021" : "nov/2020"}
            </button>
          ))}
        </div>
      )}
      {op && !semUf && <Multi rotulo="UF" opcoes={op.ufs} valor={f.uf} onChange={(uf) => set({ uf })} />}
      {op && !semUf && <Multi rotulo="Região" opcoes={op.regioes} valor={f.regiao} onChange={(regiao) => set({ regiao })} />}
      {op && <Multi rotulo="Categoria" opcoes={op.categorias} valor={f.categoria} onChange={(categoria) => set({ categoria })} />}
      {op && <Multi rotulo="Faixa de preço" opcoes={op.faixas_preco} valor={f.faixa_preco} onChange={(faixa_preco) => set({ faixa_preco })} />}
      <button onClick={() => set({ frete_gratis: f.frete_gratis ? null : true })} aria-pressed={!!f.frete_gratis}
        className={cn("h-9 rounded-[6px] border px-3 text-[13px]", f.frete_gratis ? "border-ink bg-surface text-ink" : "border-line-strong text-ink-2 hover:border-ink-3")}>
        Frete grátis
      </button>
      {ativos > 0 && (
        <button onClick={limpar} className="inline-flex h-9 items-center gap-1 px-2 text-[13px] text-ink-3 hover:text-ink"><X className="size-3.5" /> Limpar filtros</button>
      )}
    </div>
  );
}
