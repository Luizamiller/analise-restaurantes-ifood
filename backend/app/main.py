import logging
import time
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import RAIZ, get_settings
from .dados import Filtros, SemMicrodados, fonte, insights_publicados, tabela

cfg = get_settings()
logging.basicConfig(level=cfg.log_level, format="%(asctime)s %(levelname)s %(name)s · %(message)s")
log = logging.getLogger("panorama")

app = FastAPI(title="Panorama Delivery", version="2.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=cfg.cors_origins, allow_methods=["GET"], allow_headers=["*"])

DESCRICAO = {
    "completo": "Base completa do Kaggle, limpa pelo pipeline original (nov/2020 e fev/2021).",
    "sintetico": "Amostra SINTÉTICA para desenvolvimento. Os números não são reais.",
    "agregados": "Microdados não carregados: exibindo os números publicados da análise original. Filtros e explorador indisponíveis.",
}


@app.exception_handler(SemMicrodados)
async def sem_microdados(_: Request, __: SemMicrodados):
    return JSONResponse({"detail": "Esta visão precisa da base completa. Baixe os CSVs do Kaggle e rode `uv run python -m pipeline.build`."},
                        status_code=409)


@app.middleware("http")
async def tempo(request: Request, call_next):
    t0 = time.perf_counter()
    resp = await call_next(request)
    resp.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - t0) * 1000:.1f}"
    return resp


def filtros(coleta: Literal["fev", "nov"] = "fev", uf: list[str] = Query(default=[]), regiao: list[str] = Query(default=[]),
            categoria: list[str] = Query(default=[]), faixa_preco: list[str] = Query(default=[]), frete_gratis: bool | None = None) -> Filtros:
    return Filtros(coleta, uf, regiao, categoria, faixa_preco, frete_gratis)


@app.get("/api/status")
def status():
    f = fonte()
    return {"modo": f.modo, "descricao": DESCRICAO[f.modo],
            "registros": {"fev": f.total("fev"), "nov": f.total("nov")} if f.con else
            {"fev": insights_publicados()["restaurantes_fev2021"], "nov": insights_publicados()["restaurantes_nov2020"]}}


@app.get("/api/opcoes")
def opcoes():
    return fonte().opcoes()


@app.get("/api/visao-geral")
def visao_geral():
    """Os seis insights do README. Com microdados, recalculados; sem eles, os números publicados."""
    f = fonte()
    pub = insights_publicados()
    if f.con is None:
        com_nota = 100 - pub["pct_sem_nota_fev"]
        return {
            "modo": f.modo,
            "kpis": {"restaurantes": pub["restaurantes_fev2021"], "pct_sem_nota": pub["pct_sem_nota_fev"], "nota_media": pub["nota_media"],
                     "nota_mediana": pub["nota_mediana"], "media_com_zeros": pub["media_errada_com_zeros"],
                     "pct_nota_5": pub["pct_nota_5_entre_avaliados"], "pct_abaixo_4": pub["pct_nota_abaixo_4_entre_avaliados"]},
            # sem microdados, a distribuição sai em 4 faixas reconstruídas dos percentuais publicados
            "distribuicao": [
                {"faixa": "Sem nota", "pct": pub["pct_sem_nota_fev"]},
                {"faixa": "< 4,0", "pct": round(com_nota * pub["pct_nota_abaixo_4_entre_avaliados"] / 100, 1)},
                {"faixa": "4,0–4,99", "pct": round(com_nota * (100 - pub["pct_nota_abaixo_4_entre_avaliados"] - pub["pct_nota_5_entre_avaliados"]) / 100, 1)},
                {"faixa": "5,0", "pct": round(com_nota * pub["pct_nota_5_entre_avaliados"] / 100, 1)},
            ],
            "tempo_vs_nota": [{"faixa": k, "nota_media": v, "pct_abaixo_4": pub["pct_abaixo_4_por_tempo"][k]} for k, v in pub["nota_por_tempo"].items()],
            "spearman": pub["spearman_nota"],
            "categorias": tabela("resumo_por_categoria.csv"),
            "dinamica": {"restaurantes_fev": pub["restaurantes_fev2021"], "restaurantes_nov": pub["restaurantes_nov2020"],
                         "novos": pub["novos_restaurantes"], "sairam": pub["sairam"], "crescimento_pct": pub["crescimento_liquido_pct"],
                         "entrada_por_categoria": [{"categoria": k, "pct": v} for k, v in sorted(pub["categorias_mais_novos_pct"].items(), key=lambda x: -x[1])],
                         "saida_por_faixa": [{"faixa": k, "pct": v} for k, v in pub["saida_por_faixa_nota_pct"].items()]
                                            + [{"faixa": "sem nota", "pct": pub["saida_sem_nota_pct"]}]},
            "perderam_nota": pub["perderam_nota_nov_fev"],
        }
    fil = Filtros()
    w = "WHERE nota IS NOT NULL"
    corr = f.q(f"""SELECT corr(rn, rt) tempo_entrega, corr(rn, rx) taxa_entrega, corr(rn, rd) distancia_km, corr(rn, rp) pedido_minimo FROM (
                   SELECT rank() OVER (ORDER BY nota) rn, rank() OVER (ORDER BY tempo_entrega) rt, rank() OVER (ORDER BY taxa_entrega) rx,
                          rank() OVER (ORDER BY distancia_km) rd, rank() OVER (ORDER BY pedido_minimo) rp
                   FROM fev {w} AND tempo_entrega IS NOT NULL AND distancia_km IS NOT NULL AND pedido_minimo IS NOT NULL)""").iloc[0]
    perderam = int(f.q("SELECT count(*) n FROM nov n JOIN fev f USING (id) WHERE n.tem_nota AND NOT f.tem_nota").n[0])
    return {"modo": f.modo, "kpis": f.kpis(fil), "distribuicao": f.distribuicao(fil), "tempo_vs_nota": f.tempo_vs_nota(fil),
            "spearman": {k: round(float(v), 3) for k, v in corr.items()}, "categorias": f.categorias(fil),
            "dinamica": f.dinamica(fil), "perderam_nota": perderam}


@app.get("/api/explorar")
def explorar(fil: Filtros = Depends(filtros)):
    f = fonte()
    return {"kpis": f.kpis(fil), "distribuicao": f.distribuicao(fil), "tempo_vs_nota": f.tempo_vs_nota(fil),
            "categorias": f.categorias(fil)[:12], "faixa_preco": f.faixa_preco(fil)}


@app.get("/api/geografia")
def geografia(fil: Filtros = Depends(filtros)):
    f = fonte()
    if f.con is None:
        if fil.categoria or fil.faixa_preco or fil.frete_gratis is not None or fil.coleta != "fev":
            raise SemMicrodados()
        return {"modo": f.modo, "ufs": tabela("resumo_por_uf.csv")}
    return {"modo": f.modo, "ufs": f.ufs(Filtros(fil.coleta, [], [], fil.categoria, fil.faixa_preco, fil.frete_gratis))}


@app.get("/api/categorias")
def categorias(fil: Filtros = Depends(filtros)):
    f = fonte()
    if f.con is None:
        return {"modo": f.modo, "categorias": sorted(tabela("resumo_por_categoria.csv"), key=lambda r: -r["nota_media"])}
    return {"modo": f.modo, "categorias": f.categorias(fil)}


@app.get("/api/dinamica")
def dinamica(fil: Filtros = Depends(filtros)):
    return fonte().dinamica(fil)


@app.get("/api/restaurantes")
def restaurantes(fil: Filtros = Depends(filtros), busca: str = Query("", max_length=80), ordem: str = "nota",
                 direcao: Literal["asc", "desc"] = "desc", pagina: int = Query(1, ge=1), por_pagina: int = Query(25, ge=5, le=100)):
    return fonte().restaurantes(fil, busca.strip(), ordem, direcao, pagina, por_pagina)


@app.get("/api/qualidade")
def qualidade():
    return tabela("qualidade_dados.csv")


@app.exception_handler(Exception)
async def erro(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    log.exception("erro em %s", request.url.path)
    return JSONResponse({"detail": "Algo deu errado do nosso lado. Tente de novo."}, status_code=500)


FIGURAS = RAIZ / "figures"
app.mount("/api/figuras", StaticFiles(directory=FIGURAS), name="figuras")

DIST = Path(__file__).resolve().parents[2] / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{caminho:path}", include_in_schema=False)
    def spa(caminho: str):
        alvo = DIST / caminho
        return FileResponse(alvo if alvo.is_file() else DIST / "index.html")
