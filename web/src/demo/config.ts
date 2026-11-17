/** Como o backend deste projeto sobe dentro do navegador na demonstração online. */
export const CONFIG_DEMO = {
  nome: "Panorama Delivery",
  repo: "https://github.com/Luizamiller/analise-restaurantes-ifood",
  servidor: {
    pacotes: ["fastapi", "pydantic", "pandas", "numpy", "duckdb"],
    micropip: ["pydantic-settings"],
    env: {},
    inicio: "from app.main import app",
  },
};
