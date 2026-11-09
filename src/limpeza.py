"""
Limpeza da base pública de restaurantes do iFood (Kaggle, R. Tachinardi).

Duas coletas: nov/2020 e fev/2021. Cada linha é um restaurante com nota média,
tempo e taxa de entrega, distância, pedido mínimo, faixa de preço e categoria.

Cada etapa registra quantas linhas afetou, e o relatório de qualidade é gerado
a partir desse log (reports/qualidade_dados.csv).

Uso:  python src/limpeza.py
Entrada: data/raw/ifood-restaurants-february-2021.csv
         data/raw/ifood-restaurants-november-2020.csv
Saída:   data/processed/restaurantes_fev2021.csv
         data/processed/restaurantes_nov2020.csv
         reports/qualidade_dados.csv
"""
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
RAW = RAIZ / "data" / "raw"
PROC = RAIZ / "data" / "processed"
REL = RAIZ / "reports"

ARQ_FEV = RAW / "ifood-restaurants-february-2021.csv"
ARQ_NOV = RAW / "ifood-restaurants-november-2020.csv"

TEMPO_MIN, TEMPO_MAX = 5, 180        # minutos plausíveis
DIST_MAX = 50                        # km; acima disso é erro de geolocalização
PEDIDO_MIN_MAX = 500                 # R$; 99.999.999,99 é valor-sentinela
FAIXA_PRECO = {"CHEAPEST": "1 - Mais barato", "CHEAP": "2 - Barato",
               "MODERATE": "3 - Moderado", "EXPENSIVE": "4 - Caro",
               "MOST_EXPENSIVE": "5 - Mais caro"}
UF_REGIAO = {
    **dict.fromkeys(["AC", "AP", "AM", "PA", "RO", "RR", "TO"], "Norte"),
    **dict.fromkeys(["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"], "Nordeste"),
    **dict.fromkeys(["DF", "GO", "MT", "MS"], "Centro-Oeste"),
    **dict.fromkeys(["ES", "MG", "RJ", "SP"], "Sudeste"),
    **dict.fromkeys(["PR", "RS", "SC"], "Sul"),
}


def limpar(df: pd.DataFrame, rotulo: str):
    """Aplica as regras de limpeza a uma coleta e devolve (base, log)."""
    df = df.copy()
    log = []

    def registrar(etapa, n, detalhe=""):
        log.append({"coleta": rotulo, "etapa": etapa, "linhas": int(n), "detalhe": detalhe})

    registrar("Base original", len(df), f"{df.shape[1]} colunas")

    # 1. identificador do restaurante (último trecho da URL) e duplicatas
    df["id"] = df["url"].str.split("/").str[-1]
    n0 = len(df)
    df = df.drop_duplicates("id")
    registrar("Duplicatas por id removidas", n0 - len(df), "id = último trecho da URL")

    # 2. cidade e UF a partir da URL (…/delivery/sao-paulo-sp/…)
    #    O código IBGE da base é o do ponto de busca, não do restaurante.
    slug = df["url"].str.split("/").str[4]
    df["uf"] = slug.str[-2:].str.upper()
    df["cidade_slug"] = slug.str[:-3]
    df["regiao"] = df["uf"].map(UF_REGIAO)
    registrar("Cidade/UF extraídas da URL", len(df),
              f"{df['cidade_slug'].nunique()} cidades, {df['uf'].nunique()} UFs; "
              f"{df['regiao'].isna().sum()} sem região")

    # 3. nota 0 = restaurante sem nota exibida (não é nota ruim)
    sem_nota = df["rating"].eq(0)
    df["tem_nota"] = ~sem_nota
    df["nota"] = df["rating"].where(~sem_nota)
    registrar("Nota 0 tratada como 'sem nota'", sem_nota.sum(),
              f"{sem_nota.mean():.1%} da base; a menor nota real é "
              f"{df['nota'].min():.1f}")

    # 4. tempo de entrega implausível
    fora = ~df["delivery_time"].between(TEMPO_MIN, TEMPO_MAX)
    df["tempo_entrega"] = df["delivery_time"].where(~fora)
    registrar("Tempos de entrega implausíveis anulados", fora.sum(),
              f"fora de {TEMPO_MIN}–{TEMPO_MAX} min (mín. {df['delivery_time'].min()}, "
              f"máx. {df['delivery_time'].max()})")

    # 5. distância implausível
    fora = df["distance"] > DIST_MAX
    df["distancia_km"] = df["distance"].where(~fora)
    registrar("Distâncias implausíveis anuladas", fora.sum(), f"> {DIST_MAX} km (máx. {df['distance'].max():,.0f} km)")

    df["taxa_entrega"] = df["delivery_fee"]
    df["frete_gratis"] = df["taxa_entrega"].eq(0)

    # 6. pedido mínimo (só existe na coleta de fev/2021)
    if "minimumOrderValue" in df:
        fora = df["minimumOrderValue"] > PEDIDO_MIN_MAX
        df["pedido_minimo"] = df["minimumOrderValue"].where(~fora)
        registrar("Pedidos mínimos implausíveis anulados", fora.sum(),
                  f"> R$ {PEDIDO_MIN_MAX} (máx. R$ {df['minimumOrderValue'].max():,.2f})")

    # 7. faixa de preço legível e ordenada
    df["faixa_preco"] = df["price_range"].map(FAIXA_PRECO)

    # 8. tags (só fev/2021): marcar restaurantes sinalizados como novos
    if "tags" in df:
        df["tag_novo"] = df["tags"].fillna("").str.contains(r"\bNOVO\b")

    df = df.rename(columns={"name": "nome", "category": "categoria"})
    cols = ["id", "nome", "categoria", "uf", "regiao", "cidade_slug", "tem_nota", "nota",
            "tempo_entrega", "taxa_entrega", "frete_gratis", "distancia_km", "faixa_preco",
            "pedido_minimo", "tag_novo"]
    df = df[[c for c in cols if c in df.columns]].reset_index(drop=True)
    registrar("Base final", len(df), f"{df.shape[1]} colunas")
    return df, log


def main():
    PROC.mkdir(parents=True, exist_ok=True)
    REL.mkdir(parents=True, exist_ok=True)
    logs = []
    for arq, rotulo, saida in [(ARQ_FEV, "fev/2021", "restaurantes_fev2021.csv"),
                               (ARQ_NOV, "nov/2020", "restaurantes_nov2020.csv")]:
        bruto = pd.read_csv(arq, low_memory=False)
        limpo, log = limpar(bruto, rotulo)
        limpo.to_csv(PROC / saida, index=False)
        logs += log
    log = pd.DataFrame(logs)
    log.to_csv(REL / "qualidade_dados.csv", index=False)
    print(log.to_string(index=False))


if __name__ == "__main__":
    main()
