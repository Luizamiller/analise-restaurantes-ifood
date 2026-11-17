import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Barras, BarrasH, Figura, Kpi, Linha, MapaGrade } from "@/components/charts";
import { BarraFiltros, useFiltros } from "@/components/filters";
import { useStatus } from "@/components/shell";
import { Skeleton } from "@/components/ui/primitives";
import { api, ApiError, type Categoria, type Restaurante, type UF } from "@/lib/api";
import { cn, num, pct, reais } from "@/lib/utils";

function Cabecalho({ eyebrow, titulo, texto, children }: { eyebrow: string; titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <header className="pt-12 pb-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 text-[38px] leading-tight">{titulo}</h1>
      {texto && <p className="mt-2 max-w-[680px] text-[15px] text-ink-2">{texto}</p>}
      {children && <div className="mt-6">{children}</div>}
    </header>
  );
}

function SemDados({ erro }: { erro: unknown }) {
  const precisa = erro instanceof ApiError && erro.status === 409;
  return (
    <div className="rounded-[8px] border border-dashed border-line-strong bg-surface p-8">
      <Database className="size-5 text-ink-3" />
      <p className="mt-3 font-serif text-[20px]">{precisa ? "Esta visão precisa da base completa" : "Não foi possível carregar"}</p>
      {precisa ? (
        <div className="mt-2 max-w-[620px] space-y-2 text-[14px] text-ink-2">
          <p>Os 470 MB de dados brutos não ficam no repositório (o dataset não informa licença de redistribuição). Para habilitar filtros e o explorador:</p>
          <ol className="list-decimal space-y-1 pl-5 font-mono text-[12.5px]">
            <li>baixe os dois CSVs do Kaggle (iFood Restaurants Data) para data/raw/</li>
            <li>cd backend && uv run python -m pipeline.build</li>
            <li>reinicie a API</li>
          </ol>
          <p className="text-[13px] text-ink-3">Para desenvolver sem a base, há uma amostra sintética: <code className="font-mono">uv run python -m pipeline.sintetica</code> e <code className="font-mono">FONTE=sintetica</code>.</p>
        </div>
      ) : <p className="mt-2 text-[14px] text-ink-2">{(erro as Error)?.message}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ Explorar
export function ExplorarPage() {
  const [f] = useFiltros();
  const { data, error, isLoading, isFetching } = useQuery({ queryKey: ["explorar", f], queryFn: () => api.explorar(f), placeholderData: keepPreviousData, retry: false });
  return (
    <div className="mx-auto max-w-[1200px] px-5">
      <Cabecalho eyebrow="Explorar" titulo="Recorte a base do seu jeito" texto="Filtre por coleta, estado, categoria, faixa de preço e frete. Todos os números e gráficos são recalculados sobre os microdados.">
        <BarraFiltros />
      </Cabecalho>
      {error && !data ? <SemDados erro={error} /> : isLoading || !data ? <Skeleton className="h-96" /> : (
        <div className={cn("transition-opacity", isFetching && "opacity-60")}>
          <dl className="grid grid-cols-2 gap-x-8 border-y border-line sm:grid-cols-3 lg:grid-cols-6">
            <Kpi rotulo="Restaurantes" valor={num(data.kpis.restaurantes)} />
            <Kpi rotulo="Sem nota" valor={pct(data.kpis.pct_sem_nota)} destaque />
            <Kpi rotulo="Nota média" valor={num(data.kpis.nota_media, 2)} detalhe={`com zeros: ${num(data.kpis.media_com_zeros, 2)}`} />
            <Kpi rotulo="Nota 5,0" valor={pct(data.kpis.pct_nota_5, 0)} detalhe="entre quem tem nota" />
            <Kpi rotulo="Tempo mediano" valor={`${num(data.kpis.tempo_mediano)} min`} />
            <Kpi rotulo="Taxa mediana" valor={reais(data.kpis.taxa_mediana)} detalhe={`${pct(data.kpis.pct_frete_gratis, 0)} com frete grátis`} />
          </dl>
          {data.kpis.restaurantes === 0 ? <p className="py-16 text-center text-ink-3">Nenhum restaurante nesse recorte.</p> : (
            <div className="mt-12 grid gap-14 lg:grid-cols-2">
              <Figura titulo="Distribuição das notas" subtitulo="% dos restaurantes do recorte"
                tabela={{ colunas: ["Faixa", "%", "n"], linhas: data.distribuicao.map((d) => [d.faixa, pct(d.pct), num(d.n)]) }}>
                <Barras ariaLabel="Distribuição das notas" formato={(x) => `${num(x, 0)}%`}
                  dados={data.distribuicao.map((d) => ({ rotulo: d.faixa, valor: d.pct, tom: d.faixa === "Sem nota" ? "neutro" : "serie", detalhe: [["restaurantes", num(d.n)]] }))} />
              </Figura>
              <Figura titulo="Nota média por tempo de entrega" subtitulo="minutos · apenas com nota" nota="Eixo vertical ajustado ao recorte."
                tabela={{ colunas: ["Tempo", "Nota média", "n"], linhas: data.tempo_vs_nota.map((t) => [t.faixa, num(t.nota_media, 3), num(t.n)]) }}>
                {data.tempo_vs_nota.length ? (() => {
                  const vs = data.tempo_vs_nota.map((t) => t.nota_media);
                  const lo = Math.floor((Math.min(...vs) - 0.05) * 20) / 20, hi = Math.ceil((Math.max(...vs) + 0.05) * 20) / 20;
                  return <Linha ariaLabel="Nota por tempo" dominio={[lo, hi]} dados={data.tempo_vs_nota.map((t) => ({ rotulo: t.faixa, valor: t.nota_media, detalhe: [["n", num(t.n)]] }))} />;
                })() : <p className="text-ink-3">Sem dados suficientes.</p>}
              </Figura>
              <Figura titulo="Categorias no recorte" subtitulo="nota média · 12 maiores amostras"
                tabela={{ colunas: ["Categoria", "Nota", "n"], linhas: data.categorias.map((c) => [c.categoria, num(c.nota_media, 3), num(c.n)]) }}>
                {data.categorias.length ? (
                  <BarrasH ariaLabel="Nota por categoria" dominio={[Math.min(4.2, ...data.categorias.map((c) => c.nota_media - 0.05)), 5]}
                    dados={[...data.categorias].sort((a, b) => b.nota_media - a.nota_media).map((c) => ({ rotulo: c.categoria, valor: c.nota_media, detalhe: [["com nota", num(c.n)]] }))} />
                ) : <p className="text-ink-3">Amostra pequena demais para comparar categorias.</p>}
              </Figura>
              <Figura titulo="Faixa de preço" subtitulo="quantidade de restaurantes e nota média"
                tabela={{ colunas: ["Faixa", "Restaurantes", "Nota média", "Taxa mediana"], linhas: data.faixa_preco.map((p) => [p.faixa, num(p.n), num(p.nota_media, 3), reais(p.taxa_mediana)]) }}>
                <Barras ariaLabel="Restaurantes por faixa de preço" formato={(x) => num(x)}
                  dados={data.faixa_preco.map((p) => ({ rotulo: p.faixa.replace(/^\d - /, ""), valor: p.n, detalhe: [["nota média", num(p.nota_media, 2)], ["taxa mediana", reais(p.taxa_mediana)]] }))} />
              </Figura>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Geografia
const METRICAS: { id: keyof UF; rotulo: string; formato: (v: number) => string }[] = [
  { id: "restaurantes", rotulo: "Restaurantes", formato: (v) => (v >= 10000 ? `${num(v / 1000)} mil` : v >= 1000 ? `${num(v / 1000, 1)} mil` : num(v)) },
  { id: "pct_com_nota", rotulo: "% com nota", formato: (v) => `${num(v, 0)}%` },
  { id: "nota_media", rotulo: "Nota média", formato: (v) => num(v, 2) },
  { id: "tempo_mediano", rotulo: "Tempo mediano (min)", formato: (v) => num(v) },
  { id: "taxa_mediana", rotulo: "Taxa mediana", formato: (v) => num(v, 2) },
];

export function GeografiaPage() {
  const [f, set] = useFiltros();
  const { data: status } = useStatus();
  const [p, setP] = useSearchParams();
  const metrica = METRICAS.find((m) => m.id === p.get("metrica")) ?? METRICAS[0];
  const { data, error, isLoading } = useQuery({ queryKey: ["geo", f.coleta, f.categoria, f.faixa_preco, f.frete_gratis], queryFn: () => api.geografia(f), placeholderData: keepPreviousData, retry: false });
  const ufs = data?.ufs ?? [];
  const ordenado = [...ufs].sort((a, b) => ((b[metrica.id] as number) ?? -1) - ((a[metrica.id] as number) ?? -1));
  const sel = f.uf[0] ?? null;
  return (
    <div className="mx-auto max-w-[1200px] px-5">
      <Cabecalho eyebrow="Geografia" titulo="Os 27 estados, lado a lado" texto="Mapa em grade: cada estado ocupa uma célula do mesmo tamanho, para que São Paulo não esconda o resto. A cor segue a métrica escolhida.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex flex-wrap rounded-[6px] border border-line-strong p-0.5" role="radiogroup" aria-label="Métrica">
            {METRICAS.map((m) => (
              <button key={m.id} role="radio" aria-checked={metrica.id === m.id} onClick={() => setP((q) => { q.set("metrica", m.id); return q; }, { replace: true })}
                className={cn("rounded-[4px] px-3 py-1.5 text-[13px]", metrica.id === m.id ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>{m.rotulo}</button>
            ))}
          </div>
          {status?.modo !== "agregados" && <BarraFiltros semUf />}
        </div>
      </Cabecalho>
      {error && !data ? <SemDados erro={error} /> : isLoading ? <Skeleton className="h-[520px]" /> : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Figura titulo={`${metrica.rotulo} por estado`} subtitulo="clique num estado para destacá-lo na tabela">
            <MapaGrade rotulo={metrica.rotulo} formato={metrica.formato} destaque={sel}
              onSelecionar={(uf) => set({ uf: sel === uf ? [] : [uf] })}
              valores={Object.fromEntries(ufs.map((u) => [u.uf, u[metrica.id] as number | null]))} />
          </Figura>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <caption className="sr-only">Indicadores por estado</caption>
              <thead><tr className="border-b border-line text-left text-[11.5px] text-ink-3">
                {["UF", "Restaurantes", "% com nota", "Nota média", "Tempo", "Taxa"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {ordenado.map((u) => (
                  <tr key={u.uf} onClick={() => set({ uf: sel === u.uf ? [] : [u.uf] })}
                    className={cn("cursor-pointer border-b border-line/60 hover:bg-sunken/60", sel === u.uf && "bg-accent-wash")}>
                    <td className="py-1.5 pr-3 font-medium">{u.uf} <span className="text-[11.5px] font-normal text-ink-3">{u.regiao}</span></td>
                    <td className="py-1.5 pr-3 font-mono">{num(u.restaurantes)}</td>
                    <td className="py-1.5 pr-3 font-mono">{pct(u.pct_com_nota)}</td>
                    <td className="py-1.5 pr-3 font-mono">{num(u.nota_media, 2)}</td>
                    <td className="py-1.5 pr-3 font-mono">{num(u.tempo_mediano)}</td>
                    <td className="py-1.5 pr-3 font-mono">{reais(u.taxa_mediana)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.modo !== "agregados" ? null : <p className="mt-3 text-[11.5px] text-ink-3">Fonte: reports/resumo_por_uf.csv (análise original, fev/2021).</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Categorias
const colC = createColumnHelper<Categoria>();
export function CategoriasPage() {
  const [f] = useFiltros();
  const { data, error, isLoading } = useQuery({ queryKey: ["cats", f], queryFn: () => api.categorias(f), placeholderData: keepPreviousData, retry: false });
  const [ordem, setOrdem] = useState<SortingState>([{ id: "nota_media", desc: true }]);
  const max = Math.max(...(data?.categorias.map((c) => c.n) ?? [1]));
  const colunas = useMemo(() => [
    colC.accessor("categoria", { header: "Categoria", cell: (i) => <span className="font-medium">{i.getValue()}</span> }),
    colC.accessor("nota_media", {
      header: "Nota média", cell: (i) => (
        <span className="flex items-center gap-3">
          <span className="w-12 font-mono">{num(i.getValue(), 3)}</span>
          <span className="h-1.5 w-40 rounded-full bg-sunken"><span className="block h-full rounded-full bg-serie-1" style={{ width: `${Math.max(0, (i.getValue() - 4.2) / 0.65) * 100}%` }} /></span>
        </span>
      ),
    }),
    colC.accessor("tempo_mediano", { header: "Tempo mediano", cell: (i) => <span className="font-mono">{num(i.getValue())} min</span> }),
    colC.accessor("n", {
      header: "Com nota (n)", cell: (i) => (
        <span className="flex items-center gap-3"><span className="w-16 font-mono">{num(i.getValue())}</span>
          <span className="h-1.5 w-24 rounded-full bg-sunken"><span className="block h-full rounded-full bg-neutro" style={{ width: `${(i.getValue() / max) * 100}%` }} /></span></span>
      ),
    }),
  ], [max]);
  const tabela = useReactTable({ data: data?.categorias ?? [], columns: colunas, state: { sorting: ordem }, onSortingChange: setOrdem,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  return (
    <div className="mx-auto max-w-[1200px] px-5">
      <Cabecalho eyebrow="Categorias" titulo="Compare dentro da categoria" texto="A categoria explica mais da nota do que o tempo de entrega. Ordene por qualquer coluna; a barra de nota começa em 4,2.">
        {data?.modo !== "agregados" && <BarraFiltros />}
      </Cabecalho>
      {error && !data ? <SemDados erro={error} /> : isLoading ? <Skeleton className="h-96" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13.5px]">
            <thead>{tabela.getHeaderGroups().map((g) => (
              <tr key={g.id} className="border-b border-ink text-left">{g.headers.map((h) => (
                <th key={h.id} className="py-2.5 pr-4 text-[12px] font-medium text-ink-2" aria-sort={h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : "none"}>
                  <button onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 hover:text-ink">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" ? <ArrowUp className="size-3" /> : h.column.getIsSorted() === "desc" ? <ArrowDown className="size-3" /> : null}
                  </button>
                </th>))}
              </tr>))}
            </thead>
            <tbody>{tabela.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-b border-line/70 hover:bg-sunken/50">{r.getVisibleCells().map((c) => <td key={c.id} className="py-2 pr-4">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>
            ))}</tbody>
          </table>
          <p className="mt-3 text-[11.5px] text-ink-3">{data?.modo === "agregados" ? "Categorias com pelo menos 2.000 restaurantes com nota (reports/resumo_por_categoria.csv)." : "Categorias com amostra mínima de restaurantes com nota no recorte."}</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Restaurantes
const colR = createColumnHelper<Restaurante>();
const COLS_ORDENAVEIS = new Set(["nome", "categoria", "uf", "nota", "tempo_entrega", "taxa_entrega", "distancia_km", "pedido_minimo"]);

export function RestaurantesPage() {
  const [f] = useFiltros();
  const { data: status } = useStatus();
  const [p, setP] = useSearchParams();
  const [busca, setBusca] = useState(p.get("busca") ?? "");
  const [pagina, setPagina] = useState(1);
  const ordem = p.get("ordem") ?? "nota", direcao = p.get("direcao") ?? "desc";
  useEffect(() => {
    const t = setTimeout(() => setP((q) => { if (busca) q.set("busca", busca); else q.delete("busca"); return q; }, { replace: true }), 300);
    return () => clearTimeout(t);
  }, [busca, setP]);
  useEffect(() => { setPagina(1); }, [p]);
  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ["restaurantes", f, p.get("busca"), ordem, direcao, pagina],
    queryFn: () => api.restaurantes(f, { busca: p.get("busca") ?? "", ordem, direcao, pagina, por_pagina: 25 }), placeholderData: keepPreviousData, retry: false,
  });
  const colunas = useMemo(() => [
    colR.accessor("nome", { header: "Restaurante", cell: (i) => <span className="font-medium">{i.getValue()}</span> }),
    colR.accessor("categoria", { header: "Categoria" }),
    colR.accessor("uf", { header: "UF", cell: (i) => <span className="font-mono">{i.getValue()}</span> }),
    colR.accessor("nota", { header: "Nota", cell: (i) => i.getValue() == null ? <span className="text-ink-3">sem nota</span> : <span className="font-mono">{num(i.getValue(), 1)}</span> }),
    colR.accessor("tempo_entrega", { header: "Tempo", cell: (i) => <span className="font-mono">{num(i.getValue())} min</span> }),
    colR.accessor("taxa_entrega", { header: "Taxa", cell: (i) => i.row.original.frete_gratis ? <span className="text-accent-ink">grátis</span> : <span className="font-mono">{reais(i.getValue())}</span> }),
    colR.accessor("distancia_km", { header: "Distância", cell: (i) => <span className="font-mono">{num(i.getValue(), 1)} km</span> }),
    colR.accessor("faixa_preco", { header: "Preço", cell: (i) => <span className="text-ink-2">{i.getValue()?.replace(/^\d - /, "") ?? "—"}</span> }),
  ], []);
  const tabela = useReactTable({ data: data?.linhas ?? [], columns: colunas, getCoreRowModel: getCoreRowModel(), manualSorting: true, manualPagination: true });
  const paginas = data ? Math.max(1, Math.ceil(data.total / data.por_pagina)) : 1;
  const ordenar = (id: string) => setP((q) => { q.set("ordem", id); q.set("direcao", ordem === id && direcao === "desc" ? "asc" : "desc"); return q; }, { replace: true });

  return (
    <div className="mx-auto max-w-[1200px] px-5">
      <Cabecalho eyebrow="Restaurantes" titulo="Explorador de registros" texto={status?.modo === "sintetico" ? "Amostra sintética: nomes e valores não são reais." : "Cada linha é um restaurante da base limpa. A busca e a ordenação rodam no servidor (DuckDB)."}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-9 items-center gap-2 rounded-[6px] border border-line-strong bg-surface px-3 focus-within:border-accent">
            <Search className="size-3.5 text-ink-3" /><span className="sr-only">Buscar por nome ou categoria</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou categoria" className="w-48 bg-transparent text-[13px] outline-none" />
          </label>
          <BarraFiltros />
        </div>
      </Cabecalho>
      {error && !data ? <SemDados erro={error} /> : isLoading ? <Skeleton className="h-[600px]" /> : (
        <>
          <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-60")}>
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>{tabela.getHeaderGroups().map((g) => (
                <tr key={g.id} className="border-b border-ink text-left">{g.headers.map((h) => {
                  const id = h.column.id, ativo = ordem === id;
                  return (
                    <th key={h.id} className="py-2.5 pr-4 text-[12px] font-medium text-ink-2" aria-sort={ativo ? (direcao === "asc" ? "ascending" : "descending") : "none"}>
                      {COLS_ORDENAVEIS.has(id) ? (
                        <button onClick={() => ordenar(id)} className="inline-flex items-center gap-1 hover:text-ink">
                          {flexRender(h.column.columnDef.header, h.getContext())}{ativo && (direcao === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}</tr>))}
              </thead>
              <tbody>{tabela.getRowModel().rows.map((r) => (
                <tr key={r.id} className="border-b border-line/70 hover:bg-sunken/50">{r.getVisibleCells().map((c) => <td key={c.id} className="py-2 pr-4">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-[13px] text-ink-2">
            <span className="font-mono">{num(data?.total)} restaurantes</span>
            <span className="flex items-center gap-2">
              <span className="font-mono">página {num(pagina)} de {num(paginas)}</span>
              <button onClick={() => setPagina((x) => Math.max(1, x - 1))} disabled={pagina <= 1} aria-label="Página anterior" className="grid size-8 place-items-center rounded-[6px] border border-line-strong disabled:opacity-40"><ChevronLeft className="size-4" /></button>
              <button onClick={() => setPagina((x) => Math.min(paginas, x + 1))} disabled={pagina >= paginas} aria-label="Próxima página" className="grid size-8 place-items-center rounded-[6px] border border-line-strong disabled:opacity-40"><ChevronRight className="size-4" /></button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Metodologia
const FIGURAS = [["01_distribuicao_notas.png", "Distribuição das notas"], ["02_tempo_entrega_vs_nota.png", "Tempo de entrega × nota"],
  ["03_categorias.png", "Nota por categoria"], ["04_estados.png", "Restaurantes e nota por UF"],
  ["05_crescimento_categorias.png", "Crescimento por categoria"], ["06_saida_por_nota.png", "Saída por faixa de nota"]];

export function MetodologiaPage() {
  const { data } = useQuery({ queryKey: ["qualidade"], queryFn: api.qualidade, staleTime: Infinity });
  return (
    <div className="mx-auto max-w-[1000px] px-5">
      <Cabecalho eyebrow="Metodologia" titulo="Como os dados foram limpos" texto="Cada etapa da limpeza (src/limpeza.py, a mesma da análise original) registra quantas linhas afetou. Valores implausíveis são anulados, não apagados: um restaurante com tempo de entrega errado ainda tem nota e categoria válidas." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead><tr className="border-b border-ink text-left text-[12px] text-ink-2">{["Coleta", "Etapa", "Linhas", "Detalhe"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
          <tbody>{data?.map((r, i) => (
            <tr key={i} className="border-b border-line/70"><td className="py-2 pr-4 font-mono text-ink-3">{r.coleta}</td><td className="py-2 pr-4">{r.etapa}</td>
              <td className="py-2 pr-4 font-mono">{num(r.linhas)}</td><td className="py-2 pr-4 text-ink-2">{r.detalhe}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <section className="mt-16 grid gap-8 text-[14.5px] text-ink-2 sm:grid-cols-2">
        <div><h2 className="text-[20px] text-ink">Por que zero é “sem nota”</h2><p className="mt-2">Quase não há notas entre 0 e 1, e 34 mil restaurantes tinham nota em nov/2020 e aparecem com 0 em fev/2021. Tratar o zero como nota derruba a média de 4,51 para 2,52.</p></div>
        <div><h2 className="text-[20px] text-ink">Cidade e UF pela URL</h2><p className="mt-2">O código IBGE da base é o do ponto de busca usado na coleta, não o do restaurante. Cidade e UF vêm da URL de cada restaurante.</p></div>
        <div><h2 className="text-[20px] text-ink">Pipeline reprodutível</h2><p className="mt-2">CSV do Kaggle → <code className="font-mono text-[12.5px]">src/limpeza.py</code> → Parquet → DuckDB. Os testes conferem que cada consulta da API reproduz as funções de <code className="font-mono text-[12.5px]">src/analise.py</code>.</p></div>
        <div><h2 className="text-[20px] text-ink">Notebook original</h2><p className="mt-2">A análise narrada continua em <code className="font-mono text-[12.5px]">notebooks/analise_restaurantes_ifood.ipynb</code>, executada e legível no GitHub.</p></div>
      </section>
      <section className="mt-16">
        <h2 className="text-[22px]">Figuras da análise original</h2>
        <p className="mt-1 text-[13.5px] text-ink-3">Geradas por src/analise.py (Matplotlib) sobre a base real.</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {FIGURAS.map(([arq, r]) => (
            <figure key={arq} className="rounded-[8px] border border-line bg-white p-3">
              <img src={`${import.meta.env.BASE_URL}api/figuras/${arq}`} alt={r} loading="lazy" className="w-full" />
              <figcaption className="mt-2 text-[12.5px] text-[#52514e]">{r}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
