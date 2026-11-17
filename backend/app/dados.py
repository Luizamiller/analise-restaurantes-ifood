"""Acesso aos dados: DuckDB sobre Parquet, com três fontes possíveis.

- `completo`: base real limpa (data/processed/*.parquet), gerada por `pipeline.build` a partir do Kaggle.
- `sintetico`: amostra de desenvolvimento (data/sintetico/*.parquet). Só com FONTE=sintetica.
- `agregados`: sem microdados — usa as tabelas publicadas em reports/ (números reais da análise
  original). Filtros e explorador ficam indisponíveis, e a interface explica por quê.

As consultas reproduzem as definições de `src/analise.py`: nota 0 = sem nota, faixas de tempo
(0,30], (30,40]…, categorias com n mínimo de restaurantes com nota, e assim por diante.
"""
from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import duckdb
import pandas as pd

from .config import RAIZ, get_settings

REL = RAIZ / "reports"
FAIXAS_TEMPO = [(0, 30, "até 30"), (30, 40, "31–40"), (40, 50, "41–50"), (50, 60, "51–60"), (60, 90, "61–90"), (90, 180, "91–180")]
FAIXAS_NOTA = [(0, 3, "< 3,0"), (3, 3.5, "3,0–3,5"), (3.5, 4, "3,5–4,0"), (4, 4.5, "4,0–4,5"), (4.5, 4.99, "4,5–4,99"), (4.99, 5, "5,0")]
ORDENAVEIS = {"nome", "categoria", "uf", "nota", "tempo_entrega", "taxa_entrega", "distancia_km", "pedido_minimo", "faixa_preco"}


class SemMicrodados(Exception):
    pass


@dataclass
class Filtros:
    coleta: str = "fev"
    uf: list[str] = field(default_factory=list)
    regiao: list[str] = field(default_factory=list)
    categoria: list[str] = field(default_factory=list)
    faixa_preco: list[str] = field(default_factory=list)
    frete_gratis: bool | None = None

    def sql(self, alias: str = "") -> tuple[str, list]:
        a = f"{alias}." if alias else ""
        partes, params = [], []
        for col, vals in (("uf", self.uf), ("regiao", self.regiao), ("categoria", self.categoria), ("faixa_preco", self.faixa_preco)):
            if vals:
                partes.append(f"{a}{col} IN ({', '.join('?' * len(vals))})")
                params += vals
        if self.frete_gratis is not None:
            partes.append(f"{a}frete_gratis = ?")
            params.append(self.frete_gratis)
        return (" WHERE " + " AND ".join(partes)) if partes else "", params


class Fonte:
    def __init__(self):
        cfg = get_settings()
        self.lock = threading.Lock()
        reais = RAIZ / "data" / "processed"
        sint = RAIZ / "data" / "sintetico"
        if (reais / "restaurantes_fev2021.parquet").exists() and cfg.fonte != "sintetica":
            self.modo, pasta = "completo", reais
        elif cfg.fonte == "sintetica" and (sint / "restaurantes_fev2021.parquet").exists():
            self.modo, pasta = "sintetico", sint
        else:
            self.modo, pasta = "agregados", None
        self.con = None
        if pasta:
            self.con = duckdb.connect(database=":memory:")
            for nome, arq in (("fev", "restaurantes_fev2021.parquet"), ("nov", "restaurantes_nov2020.parquet")):
                self.con.execute(f"CREATE VIEW {nome} AS SELECT * FROM read_parquet('{(pasta / arq).as_posix()}')")

    def q(self, sql: str, params: list | None = None) -> pd.DataFrame:
        if self.con is None:
            raise SemMicrodados()
        with self.lock:  # conexão DuckDB compartilhada entre threads do servidor
            return self.con.execute(sql, params or []).df()

    # ------------------------------------------------------------------ consultas
    def total(self, coleta: str = "fev") -> int:
        return int(self.q(f"SELECT count(*) n FROM {coleta}").n[0])

    def kpis(self, f: Filtros) -> dict:
        w, p = f.sql()
        r = self.q(f"""
            SELECT count(*) restaurantes,
                   avg(CASE WHEN NOT tem_nota THEN 1 ELSE 0 END) * 100 pct_sem_nota,
                   avg(nota) nota_media, median(nota) nota_mediana,
                   avg(coalesce(nota, 0)) media_com_zeros,
                   avg(CASE WHEN nota = 5 THEN 1.0 WHEN nota IS NOT NULL THEN 0 END) * 100 pct_nota_5,
                   avg(CASE WHEN nota < 4 THEN 1.0 WHEN nota IS NOT NULL THEN 0 END) * 100 pct_abaixo_4,
                   median(tempo_entrega) tempo_mediano, median(taxa_entrega) taxa_mediana,
                   avg(CASE WHEN frete_gratis THEN 1 ELSE 0 END) * 100 pct_frete_gratis
            FROM {f.coleta}{w}""", p).iloc[0]
        return {k: (None if pd.isna(v) else round(float(v), 3)) for k, v in r.items()} | {"restaurantes": int(r.restaurantes)}

    def distribuicao(self, f: Filtros) -> list[dict]:
        w, p = f.sql()
        casos = " ".join(f"WHEN nota > {a} AND nota <= {b} THEN '{r}'" for a, b, r in FAIXAS_NOTA)
        df = self.q(f"""SELECT CASE WHEN NOT tem_nota THEN 'Sem nota' {casos} END faixa, count(*) n
                        FROM {f.coleta}{w} GROUP BY 1""", p)
        total = df.n.sum() or 1
        ordem = ["Sem nota"] + [r for *_, r in FAIXAS_NOTA]
        d = dict(zip(df.faixa, df.n))
        return [{"faixa": o, "n": int(d.get(o, 0)), "pct": round(d.get(o, 0) / total * 100, 2)} for o in ordem]

    def tempo_vs_nota(self, f: Filtros) -> list[dict]:
        w, p = f.sql()
        w = (w + " AND " if w else " WHERE ") + "nota IS NOT NULL AND tempo_entrega IS NOT NULL"
        casos = " ".join(f"WHEN tempo_entrega > {a} AND tempo_entrega <= {b} THEN '{r}'" for a, b, r in FAIXAS_TEMPO)
        df = self.q(f"""SELECT CASE {casos} END faixa, avg(nota) nota_media, avg(CASE WHEN nota < 4 THEN 1 ELSE 0 END) * 100 pct_abaixo_4,
                               count(*) n FROM {f.coleta}{w} GROUP BY 1""", p).set_index("faixa")
        return [{"faixa": r, "nota_media": round(float(df.nota_media[r]), 3), "pct_abaixo_4": round(float(df.pct_abaixo_4[r]), 1),
                 "n": int(df.n[r])} for *_, r in FAIXAS_TEMPO if r in df.index]

    def categorias(self, f: Filtros, minimo: int | None = None) -> list[dict]:
        w, p = f.sql()
        total = self.q(f"SELECT count(*) n FROM {f.coleta}{w}", p).n[0]
        minimo = minimo if minimo is not None else max(30, int(total * 0.005))
        df = self.q(f"""SELECT categoria, avg(nota) nota_media, median(tempo_entrega) tempo_mediano, count(nota) n, count(*) total,
                               avg(CASE WHEN tem_nota THEN 1 ELSE 0 END) * 100 pct_com_nota
                        FROM {f.coleta}{w} GROUP BY 1 HAVING count(nota) >= ? ORDER BY nota_media DESC""", p + [minimo])
        return [{"categoria": r.categoria, "nota_media": round(r.nota_media, 3), "tempo_mediano": None if pd.isna(r.tempo_mediano) else float(r.tempo_mediano),
                 "n": int(r.n), "total": int(r.total), "pct_com_nota": round(r.pct_com_nota, 1)} for r in df.itertuples()]

    def ufs(self, f: Filtros) -> list[dict]:
        w, p = f.sql()
        df = self.q(f"""SELECT uf, any_value(regiao) regiao, count(*) restaurantes, avg(CASE WHEN tem_nota THEN 1 ELSE 0 END) * 100 pct_com_nota,
                               avg(nota) nota_media, median(tempo_entrega) tempo_mediano, median(taxa_entrega) taxa_mediana
                        FROM {f.coleta}{w} GROUP BY 1 ORDER BY restaurantes DESC""", p)
        tot = df.restaurantes.sum() or 1
        return [{"uf": r.uf, "regiao": r.regiao, "restaurantes": int(r.restaurantes), "pct_com_nota": round(r.pct_com_nota, 2),
                 "nota_media": None if pd.isna(r.nota_media) else round(r.nota_media, 2),
                 "tempo_mediano": None if pd.isna(r.tempo_mediano) else float(r.tempo_mediano),
                 "taxa_mediana": None if pd.isna(r.taxa_mediana) else float(r.taxa_mediana),
                 "pct_da_base": round(r.restaurantes / tot * 100, 2)} for r in df.itertuples()]

    def faixa_preco(self, f: Filtros) -> list[dict]:
        w, p = f.sql()
        df = self.q(f"""SELECT faixa_preco, count(*) n, avg(nota) nota_media, median(taxa_entrega) taxa_mediana
                        FROM {f.coleta}{w} GROUP BY 1 HAVING faixa_preco IS NOT NULL ORDER BY 1""", p)
        return [{"faixa": r.faixa_preco, "n": int(r.n), "nota_media": None if pd.isna(r.nota_media) else round(r.nota_media, 3),
                 "taxa_mediana": None if pd.isna(r.taxa_mediana) else float(r.taxa_mediana)} for r in df.itertuples()]

    def dinamica(self, f: Filtros) -> dict:
        w, p = f.sql("x")
        total_fev = self.q(f"SELECT count(*) n FROM fev x{w}", p).n[0]
        minimo = max(30, int(total_fev * 0.0074))  # 3.000 de 406 mil na análise original
        entrada = self.q(f"""SELECT x.categoria, sum(CASE WHEN n.id IS NULL THEN 1 ELSE 0 END) novos, count(*) total
                             FROM fev x LEFT JOIN nov n USING (id){w} GROUP BY 1 HAVING count(*) >= ?
                             ORDER BY novos * 1.0 / total DESC LIMIT 12""", p + [minimo])
        saida = self.q(f"""SELECT CASE WHEN NOT x.tem_nota THEN 'sem nota' WHEN x.nota <= 3.5 THEN 'até 3,5' WHEN x.nota <= 4 THEN '3,5–4,0'
                                       WHEN x.nota <= 4.5 THEN '4,0–4,5' WHEN x.nota <= 4.8 THEN '4,5–4,8' ELSE '4,8–5,0' END faixa,
                                  avg(CASE WHEN f.id IS NULL THEN 1 ELSE 0 END) * 100 pct, count(*) n
                           FROM nov x LEFT JOIN fev f USING (id){w} GROUP BY 1""", p).set_index("faixa")
        tot = self.q(f"""SELECT (SELECT count(*) FROM fev x{w}) fev, (SELECT count(*) FROM nov x{w}) nov,
                                (SELECT count(*) FROM fev x LEFT JOIN nov n USING (id){w}{' AND' if w else ' WHERE'} n.id IS NULL) novos,
                                (SELECT count(*) FROM nov x LEFT JOIN fev f USING (id){w}{' AND' if w else ' WHERE'} f.id IS NULL) sairam""",
                     p * 4).iloc[0]
        ordem = ["até 3,5", "3,5–4,0", "4,0–4,5", "4,5–4,8", "4,8–5,0", "sem nota"]
        return {
            "restaurantes_fev": int(tot.fev), "restaurantes_nov": int(tot.nov), "novos": int(tot.novos), "sairam": int(tot.sairam),
            "crescimento_pct": round((tot.fev / tot.nov - 1) * 100, 1) if tot.nov else None,
            "entrada_por_categoria": [{"categoria": r.categoria, "novos": int(r.novos), "pct": round(r.novos / r.total * 100, 1)} for r in entrada.itertuples()],
            "saida_por_faixa": [{"faixa": o, "pct": round(float(saida.pct[o]), 1), "n": int(saida.n[o])} for o in ordem if o in saida.index],
        }

    def restaurantes(self, f: Filtros, busca: str, ordem: str, direcao: str, pagina: int, por_pagina: int) -> dict:
        w, p = f.sql()
        if busca:
            w = (w + " AND " if w else " WHERE ") + "(nome ILIKE ? OR categoria ILIKE ?)"
            p = p + [f"%{busca}%", f"%{busca}%"]
        ordem = ordem if ordem in ORDENAVEIS else "nota"
        direcao = "ASC" if direcao == "asc" else "DESC"
        total = int(self.q(f"SELECT count(*) n FROM {f.coleta}{w}", p).n[0])
        cols = "id, nome, categoria, uf, regiao, cidade_slug, nota, tempo_entrega, taxa_entrega, frete_gratis, distancia_km, faixa_preco"
        if f.coleta == "fev":
            cols += ", pedido_minimo"
        df = self.q(f"SELECT {cols} FROM {f.coleta}{w} ORDER BY {ordem} {direcao} NULLS LAST, id LIMIT ? OFFSET ?",
                    p + [por_pagina, (pagina - 1) * por_pagina])
        return {"total": total, "pagina": pagina, "por_pagina": por_pagina,
                "linhas": json.loads(df.to_json(orient="records", force_ascii=False))}

    def opcoes(self) -> dict:
        if self.con is None:
            uf = pd.read_csv(REL / "resumo_por_uf.csv")
            cat = pd.read_csv(REL / "resumo_por_categoria.csv")
            return {"ufs": sorted(uf.uf), "regioes": sorted(uf.regiao.unique()), "categorias": sorted(cat.categoria),
                    "faixas_preco": ["1 - Mais barato", "2 - Barato", "3 - Moderado", "4 - Caro", "5 - Mais caro"]}
        d = lambda col: sorted(x for x in self.q(f"SELECT DISTINCT {col} v FROM fev").v if x is not None)  # noqa: E731
        cats = self.q("SELECT categoria v, count(*) n FROM fev GROUP BY 1 ORDER BY n DESC").v.tolist()
        return {"ufs": d("uf"), "regioes": d("regiao"), "categorias": cats, "faixas_preco": d("faixa_preco")}


_fonte: Fonte | None = None


def fonte() -> Fonte:
    global _fonte
    if _fonte is None:
        _fonte = Fonte()
    return _fonte


@lru_cache
def insights_publicados() -> dict:
    return json.loads((REL / "insights.json").read_text(encoding="utf-8"))


def tabela(nome: str) -> list[dict]:
    return json.loads(pd.read_csv(REL / nome).to_json(orient="records", force_ascii=False))


def aplicar_fonte_teste(f: Fonte | None) -> None:
    """Usado nos testes para trocar a fonte sem reiniciar o processo."""
    global _fonte
    _fonte = f


__all__ = ["Filtros", "Fonte", "SemMicrodados", "fonte", "insights_publicados", "tabela", "Path"]
