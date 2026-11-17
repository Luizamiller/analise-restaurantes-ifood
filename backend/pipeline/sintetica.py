"""Amostra SINTÉTICA com o mesmo esquema da base limpa — só para desenvolvimento e testes.

Os números NÃO são reais. Os pesos por UF e categoria e as notas médias vêm das tabelas
publicadas em reports/ para a amostra ter formato plausível; nomes são "Restaurante sintético N".
A interface mostra um aviso fixo quando esta fonte está ativa.

Uso:  uv run python -m pipeline.sintetica        (gera data/sintetico/*.parquet)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .build import salvar_parquet

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "data" / "sintetico"
FAIXAS = ["1 - Mais barato", "2 - Barato", "3 - Moderado", "4 - Caro", "5 - Mais caro"]


def gerar(n_fev: int = 60_000, semente: int = 7) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(semente)
    uf = pd.read_csv(RAIZ / "reports" / "resumo_por_uf.csv")
    cat = pd.read_csv(RAIZ / "reports" / "resumo_por_categoria.csv")
    cats = list(cat["categoria"]) + ["Outros"]
    pesos_cat = np.append(cat["n"].to_numpy(), cat["n"].sum() * 0.35)
    nota_cat = dict(zip(cat["categoria"], cat["nota_media"])) | {"Outros": 4.5}
    tempo_cat = dict(zip(cat["categoria"], cat["tempo_mediano"])) | {"Outros": 45.0}

    def base(n: int, inicio_id: int) -> pd.DataFrame:
        u = rng.choice(len(uf), n, p=(uf["restaurantes"] / uf["restaurantes"].sum()).to_numpy())
        c = rng.choice(len(cats), n, p=pesos_cat / pesos_cat.sum())
        categoria = np.array(cats)[c]
        tem_nota = rng.random(n) < uf["pct_com_nota"].to_numpy()[u] / 100
        media = np.array([nota_cat[x] for x in categoria]) + (uf["nota_media"].to_numpy()[u] - 4.51)
        nota = np.clip(rng.normal(media, 0.38), 1.0, 5.0)
        nota = np.where(rng.random(n) < 0.21, 5.0, np.round(nota, 1))
        tempo = np.clip(rng.normal([tempo_cat[x] for x in categoria], 13), 10, 170).round()
        nota = np.where(tempo > 60, nota - rng.random(n) * 0.15, nota).clip(1, 5).round(1)
        taxa = np.where(rng.random(n) < 0.18, 0.0, rng.gamma(3.0, 2.3, n).round(2))
        return pd.DataFrame({
            "id": [f"sint-{inicio_id + i:06d}" for i in range(n)],
            "nome": [f"Restaurante sintético {inicio_id + i}" for i in range(n)],
            "categoria": categoria,
            "uf": uf["uf"].to_numpy()[u],
            "regiao": uf["regiao"].to_numpy()[u],
            "cidade_slug": "cidade-sintetica",
            "tem_nota": tem_nota,
            "nota": np.where(tem_nota, nota, np.nan),
            "tempo_entrega": tempo,
            "taxa_entrega": taxa,
            "frete_gratis": taxa == 0,
            "distancia_km": rng.gamma(2.0, 1.6, n).round(2),
            "faixa_preco": rng.choice(FAIXAS, n, p=[0.32, 0.38, 0.22, 0.06, 0.02]),
            "pedido_minimo": rng.choice([0, 10, 15, 20, 25, 30, 40], n, p=[0.3, 0.2, 0.2, 0.15, 0.08, 0.05, 0.02]).astype(float),
        })

    n_nov = int(n_fev / 1.124)
    nov = base(n_nov, 0)
    saem = rng.random(n_nov) < 0.044
    fica = nov[~saem].copy()
    fica["nota"] = np.where(fica["tem_nota"], (fica["nota"] + rng.normal(0, 0.05, len(fica))).clip(1, 5).round(1), np.nan)
    novos = base(n_fev - len(fica), n_nov)
    fev = pd.concat([fica, novos], ignore_index=True)
    fev["tag_novo"] = fev["id"].isin(novos["id"])
    nov = nov.drop(columns=["pedido_minimo"])  # a coleta de nov/2020 não tem pedido mínimo
    return fev, nov


def main() -> None:
    fev, nov = gerar()
    salvar_parquet(fev, DESTINO / "restaurantes_fev2021.parquet")
    salvar_parquet(nov, DESTINO / "restaurantes_nov2020.parquet")
    print(f"Amostra sintética: {len(fev):,} (fev) e {len(nov):,} (nov) em {DESTINO}")


if __name__ == "__main__":
    main()
