export type Modo = "completo" | "sintetico" | "agregados";
export type Kpis = {
  restaurantes: number; pct_sem_nota: number; nota_media: number; nota_mediana: number; media_com_zeros: number;
  pct_nota_5: number; pct_abaixo_4: number; tempo_mediano?: number; taxa_mediana?: number; pct_frete_gratis?: number;
};
export type Faixa = { faixa: string; pct: number; n?: number };
export type TempoNota = { faixa: string; nota_media: number; pct_abaixo_4: number; n?: number };
export type Categoria = { categoria: string; nota_media: number; tempo_mediano: number | null; n: number; total?: number; pct_com_nota?: number };
export type UF = { uf: string; regiao: string; restaurantes: number; pct_com_nota: number; nota_media: number | null; tempo_mediano: number | null; taxa_mediana: number | null; pct_da_base: number };
export type Dinamica = {
  restaurantes_fev: number; restaurantes_nov: number; novos: number; sairam: number; crescimento_pct: number | null;
  entrada_por_categoria: { categoria: string; pct: number; novos?: number }[]; saida_por_faixa: Faixa[];
};
export type VisaoGeral = {
  modo: Modo; kpis: Kpis; distribuicao: Faixa[]; tempo_vs_nota: TempoNota[]; spearman: Record<string, number>;
  categorias: Categoria[]; dinamica: Dinamica; perderam_nota: number;
};
export type Filtros = { coleta: "fev" | "nov"; uf: string[]; regiao: string[]; categoria: string[]; faixa_preco: string[]; frete_gratis: boolean | null };
export type Restaurante = {
  id: string; nome: string; categoria: string; uf: string; regiao: string; cidade_slug: string; nota: number | null; tempo_entrega: number | null;
  taxa_entrega: number | null; frete_gratis: boolean; distancia_km: number | null; faixa_preco: string | null; pedido_minimo?: number | null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, typeof body?.detail === "string" ? body.detail : "Não foi possível carregar os dados.");
  return body as T;
}

export function qs(f: Partial<Filtros>, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  if (f.coleta && f.coleta !== "fev") p.set("coleta", f.coleta);
  (["uf", "regiao", "categoria", "faixa_preco"] as const).forEach((k) => f[k]?.forEach((v) => p.append(k, v)));
  if (f.frete_gratis != null) p.set("frete_gratis", String(f.frete_gratis));
  Object.entries(extra).forEach(([k, v]) => v !== "" && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  status: () => req<{ modo: Modo; descricao: string; registros: { fev: number; nov: number } }>("/status"),
  opcoes: () => req<{ ufs: string[]; regioes: string[]; categorias: string[]; faixas_preco: string[] }>("/opcoes"),
  visaoGeral: () => req<VisaoGeral>("/visao-geral"),
  explorar: (f: Filtros) => req<{ kpis: Kpis; distribuicao: Faixa[]; tempo_vs_nota: TempoNota[]; categorias: Categoria[]; faixa_preco: { faixa: string; n: number; nota_media: number | null; taxa_mediana: number | null }[] }>(`/explorar${qs(f)}`),
  geografia: (f: Partial<Filtros>) => req<{ modo: Modo; ufs: UF[] }>(`/geografia${qs(f)}`),
  categorias: (f: Partial<Filtros>) => req<{ modo: Modo; categorias: Categoria[] }>(`/categorias${qs(f)}`),
  restaurantes: (f: Filtros, o: { busca: string; ordem: string; direcao: string; pagina: number; por_pagina: number }) =>
    req<{ total: number; pagina: number; por_pagina: number; linhas: Restaurante[] }>(`/restaurantes${qs(f, o)}`),
  qualidade: () => req<{ coleta: string; etapa: string; linhas: number; detalhe: string }[]>("/qualidade"),
};
