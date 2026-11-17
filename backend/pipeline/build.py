"""Gera a base analítica (Parquet) a partir dos CSVs do Kaggle, reaproveitando a limpeza original.

A lógica de limpeza NÃO foi reescrita: este script importa `src/limpeza.py` (o mesmo usado no
notebook e no README) e só troca o formato de saída para Parquet, que o DuckDB lê direto.

Uso:
  1. Baixe os dois CSVs do Kaggle para data/raw/ (ver README).
  2. cd backend && uv run python -m pipeline.build
Saída: data/processed/restaurantes_{fev2021,nov2020}.parquet e reports/qualidade_dados.csv
Depois, opcionalmente: uv run python ../src/analise.py  (regenera figures/ e reports/insights.json)
"""
from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "src"))
import limpeza  # noqa: E402  (src/limpeza.py, do projeto original)

PROC = RAIZ / "data" / "processed"


def salvar_parquet(df: pd.DataFrame, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.register("df", df)
    con.execute(f"COPY df TO '{destino.as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
    con.close()


def main() -> None:
    faltando = [a.name for a in (limpeza.ARQ_FEV, limpeza.ARQ_NOV) if not a.exists()]
    if faltando:
        sys.exit(f"Arquivos ausentes em data/raw/: {', '.join(faltando)}. Baixe do Kaggle (ver README).")
    logs = []
    for arq, rotulo, nome in [(limpeza.ARQ_FEV, "fev/2021", "restaurantes_fev2021"),
                              (limpeza.ARQ_NOV, "nov/2020", "restaurantes_nov2020")]:
        bruto = pd.read_csv(arq, low_memory=False)
        limpo, log = limpeza.limpar(bruto, rotulo)
        limpo.to_csv(PROC / f"{nome}.csv", index=False)  # compatível com src/analise.py
        salvar_parquet(limpo, PROC / f"{nome}.parquet")
        logs += log
        print(f"{rotulo}: {len(limpo):,} restaurantes → {nome}.parquet")
    pd.DataFrame(logs).to_csv(RAIZ / "reports" / "qualidade_dados.csv", index=False)


if __name__ == "__main__":
    main()
