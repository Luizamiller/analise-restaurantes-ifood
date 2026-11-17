"""As consultas DuckDB precisam bater com as funções originais de src/analise.py (pandas).

Roda sobre a amostra sintética (mesmo esquema da base limpa) e sobre o modo "agregados",
que serve os números publicados quando os microdados não estão na máquina.
"""
import sys

import duckdb
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import dados
from app.config import RAIZ, get_settings
from app.main import app
from pipeline.sintetica import DESTINO, main as gerar_sintetica

sys.path.insert(0, str(RAIZ / "src"))
import analise  # noqa: E402  (análise original)


@pytest.fixture(scope="module")
def sintetica():
    if not (DESTINO / "restaurantes_fev2021.parquet").exists():
        gerar_sintetica()
    get_settings().fonte = "sintetica"
    dados.aplicar_fonte_teste(dados.Fonte())
    yield dados.fonte()
    get_settings().fonte = "auto"
    dados.aplicar_fonte_teste(None)


@pytest.fixture(scope="module")
def df_fev():
    return duckdb.sql(f"SELECT * FROM read_parquet('{(DESTINO / 'restaurantes_fev2021.parquet').as_posix()}')").df()


def test_tempo_vs_nota_igual_ao_original(sintetica, df_fev):
    original = analise.tabela_tempo(df_fev)
    novo = {r["faixa"]: r for r in sintetica.tempo_vs_nota(dados.Filtros())}
    for faixa, linha in original.iterrows():
        assert novo[faixa]["n"] == linha["n"]
        assert novo[faixa]["nota_media"] == pytest.approx(linha["nota_media"], abs=1e-3)
        assert novo[faixa]["pct_abaixo_4"] == pytest.approx(linha["pct_abaixo_4"], abs=0.1)


def test_categorias_igual_ao_original(sintetica, df_fev, monkeypatch):
    monkeypatch.setattr(analise, "MIN_CATEGORIA", 300)
    original = analise.tabela_categorias(df_fev)
    novo = {r["categoria"]: r for r in sintetica.categorias(dados.Filtros(), minimo=300)}
    assert set(novo) == set(original.index)
    for cat, linha in original.iterrows():
        assert novo[cat]["nota_media"] == pytest.approx(linha["nota_media"], abs=1e-3)
        assert novo[cat]["n"] == linha["n"]


def test_uf_igual_ao_original(sintetica, df_fev):
    original = analise.tabela_uf(df_fev)
    novo = {r["uf"]: r for r in sintetica.ufs(dados.Filtros())}
    for uf, linha in original.iterrows():
        assert novo[uf]["restaurantes"] == linha["restaurantes"]
        assert novo[uf]["pct_com_nota"] == pytest.approx(linha["pct_com_nota"], abs=0.01)


def test_kpis_e_distribuicao(sintetica, df_fev):
    k = sintetica.kpis(dados.Filtros())
    com = df_fev[df_fev.tem_nota]
    assert k["restaurantes"] == len(df_fev)
    assert k["nota_media"] == pytest.approx(com.nota.mean(), abs=1e-3)
    assert k["media_com_zeros"] == pytest.approx(df_fev.nota.fillna(0).mean(), abs=1e-3)
    assert sum(d["pct"] for d in sintetica.distribuicao(dados.Filtros())) == pytest.approx(100, abs=0.05)


def test_filtros_restringem(sintetica):
    tudo = sintetica.kpis(dados.Filtros())["restaurantes"]
    sp_pizza = sintetica.kpis(dados.Filtros(uf=["SP"], categoria=["Pizza"]))["restaurantes"]
    assert 0 < sp_pizza < tudo


def test_dinamica_bate_com_os_totais(sintetica):
    d = sintetica.dinamica(dados.Filtros())
    assert d["restaurantes_fev"] - d["novos"] == d["restaurantes_nov"] - d["sairam"]


def test_api_com_microdados(sintetica):
    c = TestClient(app)
    assert c.get("/api/status").json()["modo"] == "sintetico"
    r = c.get("/api/restaurantes", params={"busca": "sintético 12", "ordem": "nome", "direcao": "asc", "por_pagina": 10}).json()
    assert r["total"] > 0 and len(r["linhas"]) <= 10 and all("12" in l["nome"] for l in r["linhas"])
    assert c.get("/api/restaurantes", params={"ordem": "id; drop table fev"}).status_code == 200  # ordem fora da lista é ignorada
    assert c.get("/api/explorar", params={"uf": ["SP", "RJ"], "frete_gratis": "true"}).json()["kpis"]["pct_frete_gratis"] == 100


def test_modo_agregados_serve_numeros_publicados():
    dados.aplicar_fonte_teste(None)
    get_settings().fonte = "auto"
    f = dados.Fonte()
    if f.modo != "agregados":
        pytest.skip("base completa presente nesta máquina")
    dados.aplicar_fonte_teste(f)
    c = TestClient(app)
    v = c.get("/api/visao-geral").json()
    assert v["kpis"]["restaurantes"] == 406399 and v["kpis"]["pct_sem_nota"] == 44.1 and v["kpis"]["media_com_zeros"] == 2.52
    assert len(c.get("/api/geografia").json()["ufs"]) == 27
    assert c.get("/api/explorar").status_code == 409
    assert c.get("/api/restaurantes").status_code == 409
    assert c.get("/api/qualidade").json()[0]["linhas"] == 406399
    dados.aplicar_fonte_teste(None)


def test_tabelas_publicadas_consistentes():
    uf = pd.read_csv(RAIZ / "reports" / "resumo_por_uf.csv")
    assert uf.restaurantes.sum() == dados.insights_publicados()["restaurantes_fev2021"] == 406399
