"""
Análise exploratória dos restaurantes do iFood (fev/2021, com comparação nov/2020).

Gera os gráficos em figures/ e os números-chave em reports/insights.json.
Todos os números citados no README e no notebook saem deste script.

Uso:  python src/analise.py
"""
from pathlib import Path
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
PROC = RAIZ / "data" / "processed"
FIG = RAIZ / "figures"
REL = RAIZ / "reports"

MIN_CATEGORIA = 2000   # restaurantes com nota, para entrar no ranking de categorias
FAIXAS_TEMPO = [0, 30, 40, 50, 60, 90, 180]
ROTULOS_TEMPO = ["até 30", "31–40", "41–50", "51–60", "61–90", "91–180"]

AZUL, LARANJA, CINZA = "#2a78d6", "#eb6834", "#b9b8b3"
TINTA, TINTA_2 = "#0b0b0b", "#52514e"
FONTE = "Fonte: iFood Restaurants Data (Kaggle, R. Tachinardi), coleta de fev/2021"
plt.rcParams.update({
    "figure.dpi": 130, "savefig.dpi": 160, "savefig.bbox": "tight",
    "font.size": 10, "axes.titlesize": 12, "axes.titleweight": "bold",
    "axes.titlelocation": "left", "axes.edgecolor": CINZA,
    "axes.labelcolor": TINTA_2, "xtick.color": TINTA_2, "ytick.color": TINTA_2,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#e8e7e3", "grid.linewidth": 0.6,
    "axes.axisbelow": True, "figure.facecolor": "white",
})


def br(x, casas=1):
    """Número no formato brasileiro: 1.234,5"""
    return f"{x:,.{casas}f}".replace(",", "§").replace(".", ",").replace("§", ".")


def carregar():
    fev = pd.read_csv(PROC / "restaurantes_fev2021.csv", low_memory=False)
    nov = pd.read_csv(PROC / "restaurantes_nov2020.csv", low_memory=False)
    return fev, nov


def virgula(*axes):
    """Separador decimal com vírgula nos eixos numéricos."""
    from matplotlib.ticker import ScalarFormatter
    f = FuncFormatter(lambda v, _: f"{v:g}".replace(".", ","))
    for ax in axes:
        for eixo in (ax.xaxis, ax.yaxis):   # só eixos numéricos; categorias ficam intactas
            if isinstance(eixo.get_major_formatter(), ScalarFormatter):
                eixo.set_major_formatter(f)


def rodape(fig, texto=FONTE):
    fig.text(0.01, -0.02, texto, fontsize=7.5, color=TINTA_2, ha="left", va="top")


# ------------------------------------------------------------------ gráficos
def fig_distribuicao_notas(fev):
    faixas = pd.cut(fev["nota"], [0, 3, 3.5, 4, 4.5, 4.99, 5],
                    labels=["< 3,0", "3,0–3,5", "3,5–4,0", "4,0–4,5", "4,5–4,99", "5,0"])
    cont = faixas.value_counts().reindex(faixas.cat.categories)
    cont = pd.concat([pd.Series({"Sem nota": (~fev["tem_nota"]).sum()}), cont])
    pct = cont / len(fev) * 100
    fig, ax = plt.subplots(figsize=(7.5, 3.8))
    cores = [CINZA] + [AZUL] * (len(pct) - 1)
    ax.bar(pct.index, pct.values, color=cores, width=0.62)
    for x, p in zip(pct.index, pct.values):
        ax.text(x, p + 0.8, f"{br(p, 0)}%", ha="center", fontsize=9, color=TINTA)
    ax.set_title("Quase metade dos restaurantes não exibe nota")
    ax.set_ylabel("% dos restaurantes"); ax.set_xlabel("Nota média do restaurante")
    ax.grid(axis="x", visible=False); virgula(ax)
    rodape(fig, FONTE + f" · n = {br(len(fev), 0)}")
    fig.savefig(FIG / "01_distribuicao_notas.png"); plt.close(fig)


def tabela_tempo(fev):
    base = fev.dropna(subset=["nota", "tempo_entrega"]).copy()
    base["faixa"] = pd.cut(base["tempo_entrega"], FAIXAS_TEMPO, labels=ROTULOS_TEMPO)
    return base.groupby("faixa", observed=True).agg(
        nota_media=("nota", "mean"),
        pct_abaixo_4=("nota", lambda s: (s < 4).mean() * 100),
        n=("nota", "size"))


def fig_tempo_vs_nota(fev):
    g = tabela_tempo(fev)
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    axes[0].plot(g.index.astype(str), g["nota_media"], color=AZUL, lw=2, marker="o", ms=7)
    for x, y in zip(g.index.astype(str), g["nota_media"]):
        axes[0].text(x, y + 0.012, br(y, 2), ha="center", fontsize=9, color=TINTA)
    axes[0].set_ylim(4.3, 4.7)
    axes[0].set_title("Nota média por tempo de entrega")
    axes[0].set_xlabel("Tempo de entrega informado (min)"); axes[0].set_ylabel("Nota média")
    axes[1].bar(g.index.astype(str), g["pct_abaixo_4"], color=LARANJA, width=0.62)
    for x, y in zip(g.index.astype(str), g["pct_abaixo_4"]):
        axes[1].text(x, y + 0.4, f"{br(y, 0)}%", ha="center", fontsize=9, color=TINTA)
    axes[1].set_title("% de restaurantes com nota abaixo de 4,0")
    axes[1].set_xlabel("Tempo de entrega informado (min)"); axes[1].grid(axis="x", visible=False)
    virgula(*axes)
    fig.tight_layout()
    rodape(fig, FONTE + " · apenas restaurantes com nota. Eixo da esquerda começa em 4,3.")
    fig.savefig(FIG / "02_tempo_entrega_vs_nota.png"); plt.close(fig)
    return g


def tabela_categorias(fev):
    return (fev[fev["tem_nota"]].groupby("categoria")
            .agg(nota_media=("nota", "mean"), tempo_mediano=("tempo_entrega", "median"),
                 n=("nota", "size"))
            .query("n >= @MIN_CATEGORIA").sort_values("nota_media"))


def fig_categorias(fev):
    g = tabela_categorias(fev)
    fig, ax = plt.subplots(figsize=(7.5, 5.2))
    ax.barh(g.index, g["nota_media"], color=AZUL, height=0.62)
    for y, (v, n) in enumerate(zip(g["nota_media"], g["n"])):
        ax.text(v + 0.005, y, f"{br(v, 2)}  (n={br(n, 0)})", va="center", fontsize=8, color=TINTA)
    ax.set_xlim(4.2, 4.9)
    ax.set_title("Nota média por categoria")
    ax.set_xlabel(f"Nota média (categorias com ≥ {br(MIN_CATEGORIA, 0)} restaurantes com nota; eixo começa em 4,2)")
    ax.grid(axis="y", visible=False); virgula(ax)
    rodape(fig)
    fig.savefig(FIG / "03_categorias.png"); plt.close(fig)
    return g


def tabela_uf(fev):
    return (fev.groupby("uf")
            .agg(restaurantes=("id", "size"), pct_com_nota=("tem_nota", "mean"),
                 nota_media=("nota", "mean"), tempo_mediano=("tempo_entrega", "median"),
                 taxa_mediana=("taxa_entrega", "median"), regiao=("regiao", "first"))
            .assign(pct_com_nota=lambda d: d["pct_com_nota"] * 100,
                    pct_da_base=lambda d: d["restaurantes"] / d["restaurantes"].sum() * 100)
            .sort_values("restaurantes", ascending=False))


def fig_uf(fev, minimo=500):
    g = tabela_uf(fev).query("restaurantes >= @minimo").sort_values("restaurantes")
    fig, axes = plt.subplots(1, 2, figsize=(10, 6.2), sharey=True)
    axes[0].barh(g.index, g["restaurantes"] / 1000, color=AZUL, height=0.65)
    for y, (v, p) in enumerate(zip(g["restaurantes"], g["pct_da_base"])):
        axes[0].text(v / 1000 + 1.5, y, f"{br(p, 1)}%", va="center", fontsize=7.5, color=TINTA)
    axes[0].set_title("Restaurantes por UF (mil)")
    axes[1].barh(g.index, g["nota_media"], color=CINZA, height=0.65)
    for y, v in enumerate(g["nota_media"]):
        axes[1].text(v + 0.005, y, br(v, 2), va="center", fontsize=7.5, color=TINTA)
    axes[1].set_xlim(4.2, 4.7); axes[1].set_title("Nota média (eixo começa em 4,2)")
    for ax in axes:
        ax.grid(axis="y", visible=False); ax.tick_params(axis="y", labelsize=8)
    virgula(*axes)
    fig.tight_layout()
    rodape(fig, FONTE + f" · UFs com ≥ {minimo} restaurantes (TO, com 109, fica de fora)")
    fig.savefig(FIG / "04_estados.png"); plt.close(fig)


def comparar_coletas(fev, nov):
    nov = nov.assign(saiu=~nov["id"].isin(fev["id"]))
    fev = fev.assign(entrou=~fev["id"].isin(nov["id"]))
    entrada = (fev.groupby("categoria")["entrou"].agg(novos="sum", pct="mean", total="size")
               .query("total >= 3000").assign(pct=lambda d: d["pct"] * 100)
               .sort_values("pct"))
    com_nota = nov[nov["tem_nota"]].copy()
    com_nota["faixa_nota"] = pd.cut(com_nota["nota"], [0, 3.5, 4, 4.5, 4.8, 5.0],
                                    labels=["até 3,5", "3,5–4,0", "4,0–4,5", "4,5–4,8", "4,8–5,0"])
    saida = (com_nota.groupby("faixa_nota", observed=True)["saiu"]
             .agg(pct="mean", n="size").assign(pct=lambda d: d["pct"] * 100))
    pares = nov.merge(fev, on="id", suffixes=("_nov", "_fev"))
    return nov, fev, entrada, saida, pares


def fig_entrada(entrada):
    g = entrada.tail(12)
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    ax.barh(g.index, g["pct"], color=AZUL, height=0.62)
    for y, (v, n) in enumerate(zip(g["pct"], g["novos"])):
        ax.text(v + 0.3, y, f"{br(v, 0)}%  (+{br(n, 0)})", va="center", fontsize=8, color=TINTA)
    ax.set_title("Categorias que mais cresceram entre nov/2020 e fev/2021")
    ax.set_xlabel("% dos restaurantes de fev/2021 que não existiam em nov/2020")
    ax.grid(axis="y", visible=False); virgula(ax)
    rodape(fig, "Fonte: iFood Restaurants Data (Kaggle), coletas de nov/2020 e fev/2021 · categorias com ≥ 3.000 restaurantes")
    fig.savefig(FIG / "05_crescimento_categorias.png"); plt.close(fig)


def fig_saida(saida, taxa_sem_nota):
    s = pd.concat([saida["pct"], pd.Series({"sem nota": taxa_sem_nota})])
    fig, ax = plt.subplots(figsize=(7, 3.6))
    cores = [AZUL] * (len(s) - 1) + [CINZA]
    ax.bar(s.index, s.values, color=cores, width=0.62)
    for x, v in zip(s.index, s.values):
        ax.text(x, v + 0.12, f"{br(v, 1)}%", ha="center", fontsize=9, color=TINTA)
    ax.set_ylim(0, 8)
    ax.set_title("A nota de nov/2020 quase não diferencia quem saiu da plataforma")
    ax.set_ylabel("% que não aparece em fev/2021"); ax.set_xlabel("Nota em nov/2020")
    ax.grid(axis="x", visible=False); virgula(ax)
    rodape(fig, "Fonte: iFood Restaurants Data (Kaggle), coletas de nov/2020 e fev/2021")
    fig.savefig(FIG / "06_saida_por_nota.png"); plt.close(fig)


# ------------------------------------------------------------------ execução
def main():
    FIG.mkdir(exist_ok=True); REL.mkdir(exist_ok=True)
    fev, nov = carregar()

    fig_distribuicao_notas(fev)
    tempo = fig_tempo_vs_nota(fev)
    cats = fig_categorias(fev)
    fig_uf(fev)
    nov2, fev2, entrada, saida, pares = comparar_coletas(fev, nov)
    taxa_saida_sem_nota = nov2.loc[~nov2["tem_nota"], "saiu"].mean() * 100
    fig_entrada(entrada)
    fig_saida(saida, taxa_saida_sem_nota)

    com_nota = fev[fev["tem_nota"]]
    corr = com_nota[["nota", "tempo_entrega", "taxa_entrega", "distancia_km", "pedido_minimo"]] \
        .corr(method="spearman")["nota"].drop("nota")
    perdeu = (pares["tem_nota_nov"] & ~pares["tem_nota_fev"]).sum()
    ganhou = (~pares["tem_nota_nov"] & pares["tem_nota_fev"]).sum()
    ambos = pares[pares["tem_nota_nov"] & pares["tem_nota_fev"]]
    frete = com_nota.groupby("frete_gratis")["nota"].mean()

    insights = {
        "restaurantes_fev2021": int(len(fev)),
        "restaurantes_nov2020": int(len(nov)),
        "pct_sem_nota_fev": round(float((~fev["tem_nota"]).mean() * 100), 1),
        "media_errada_com_zeros": round(float(fev["nota"].fillna(0).mean()), 2),
        "nota_media": round(float(com_nota["nota"].mean()), 2),
        "nota_mediana": round(float(com_nota["nota"].median()), 2),
        "pct_nota_5_entre_avaliados": round(float((com_nota["nota"] == 5).mean() * 100), 1),
        "pct_nota_abaixo_4_entre_avaliados": round(float((com_nota["nota"] < 4).mean() * 100), 1),
        "nota_por_tempo": tempo["nota_media"].round(3).to_dict(),
        "pct_abaixo_4_por_tempo": tempo["pct_abaixo_4"].round(1).to_dict(),
        "spearman_nota": corr.round(3).to_dict(),
        "nota_frete_gratis": round(float(frete.get(True)), 3),
        "nota_com_frete": round(float(frete.get(False)), 3),
        "categorias_maior_nota": cats["nota_media"].tail(3).round(3).to_dict(),
        "categorias_menor_nota": cats["nota_media"].head(3).round(3).to_dict(),
        "pct_base_sp": round(float((fev["uf"] == "SP").mean() * 100), 1),
        "pct_base_sudeste": round(float((fev["regiao"] == "Sudeste").mean() * 100), 1),
        "novos_restaurantes": int(fev2["entrou"].sum()),
        "pct_novos_fev": round(float(fev2["entrou"].mean() * 100), 1),
        "sairam": int(nov2["saiu"].sum()),
        "pct_sairam": round(float(nov2["saiu"].mean() * 100), 1),
        "crescimento_liquido_pct": round(float((len(fev) / len(nov) - 1) * 100), 1),
        "categorias_mais_novos_pct": entrada["pct"].tail(4).round(1).to_dict(),
        "saida_por_faixa_nota_pct": saida["pct"].round(1).to_dict(),
        "saida_sem_nota_pct": round(float(taxa_saida_sem_nota), 1),
        "perderam_nota_nov_fev": int(perdeu),
        "ganharam_nota_nov_fev": int(ganhou),
        "variacao_mediana_nota": round(float((ambos["nota_fev"] - ambos["nota_nov"]).median()), 3),
    }
    tabela_uf(fev).round(2).to_csv(REL / "resumo_por_uf.csv")
    cats.round(3).to_csv(REL / "resumo_por_categoria.csv")
    (REL / "insights.json").write_text(json.dumps(insights, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(insights, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
