import { qs } from "../api";
import { compacto, num, pct } from "../utils";

test("formato brasileiro", () => {
  expect(num(406399)).toBe("406.399");
  expect(pct(44.1)).toBe("44,1%");
  expect(compacto(147721)).toBe("148 mil");
});

test("filtros viram query string estável", () => {
  expect(qs({ coleta: "fev", uf: ["SP", "RJ"], frete_gratis: true })).toBe("?uf=SP&uf=RJ&frete_gratis=true");
  expect(qs({ coleta: "nov" })).toBe("?coleta=nov");
});
