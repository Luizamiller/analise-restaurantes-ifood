import { useQuery } from "@tanstack/react-query";
import { animate, motion, useInView } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { Barras, BarrasH, Figura, Kpi, Linha } from "@/components/charts";
import { Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { num, pct } from "@/lib/utils";

/** Rolagem suave (Lenis) só nesta página longa, de leitura; respeita prefers-reduced-motion. */
function useRolagemSuave() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let parar = () => {};
    import("lenis").then(({ default: Lenis }) => {
      const lenis = new Lenis({ lerp: 0.12 });
      let id = 0;
      const raf = (t: number) => { lenis.raf(t); id = requestAnimationFrame(raf); };
      id = requestAnimationFrame(raf);
      parar = () => { cancelAnimationFrame(id); lenis.destroy(); };
    });
    return () => parar();
  }, []);
}

function Contador({ ate, casas = 0, sufixo = "" }: { ate: number; casas?: number; sufixo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visto = useInView(ref, { once: true, margin: "-10% 0px" });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!visto) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(ate); return; }
    const c = animate(0, ate, { duration: 1.1, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => c.stop();
  }, [visto, ate]);
  return <span ref={ref} className="tnum">{num(v, casas)}{sufixo}</span>;
}

/** A virada da média: GSAP com ScrollTrigger faz o número sair de 2,52 para 4,51 conforme a leitura avança. */
function ViradaDaMedia({ errada, certa }: { errada: number; certa: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const alvo = useRef<HTMLSpanElement>(null);
  const barra = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!caixa.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { alvo.current!.textContent = num(certa, 2); return; }
    let limpar = () => {};
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      const estado = { v: errada };
      const ctx = gsap.context(() => {
        gsap.timeline({ scrollTrigger: { trigger: caixa.current, start: "top 75%", end: "top 30%", scrub: 0.6 } })
          .to(estado, { v: certa, ease: "none", onUpdate: () => { if (alvo.current) alvo.current.textContent = num(estado.v, 2); } }, 0)
          .fromTo(barra.current, { scaleX: errada / 5 }, { scaleX: certa / 5, ease: "none" }, 0);
      });
      limpar = () => ctx.revert();
    });
    return () => limpar();
  }, [errada, certa]);
  return (
    <div ref={caixa} className="rounded-[8px] border border-line bg-surface p-6">
      <p className="text-[13px] text-ink-3">Nota média, tratando “sem nota” como nota zero → só entre quem tem nota</p>
      <p className="mt-2 font-serif text-[64px] leading-none tracking-tight"><span ref={alvo} className="tnum">{num(errada, 2)}</span></p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunken">
        <span ref={barra} className="block h-full origin-left rounded-full bg-serie-1" style={{ transform: `scaleX(${errada / 5})` }} />
      </div>
      <p className="mt-2 flex justify-between font-mono text-[11px] text-ink-3"><span>0</span><span>5</span></p>
    </div>
  );
}

function Secao({ n, titulo, children, texto }: { n: string; titulo: ReactNode; texto: ReactNode; children: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="grid gap-10 border-t border-line py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <p className="eyebrow">Achado {n}</p>
        <h2 className="mt-3 text-[30px] leading-[1.15]">{titulo}</h2>
        <div className="mt-4 space-y-3 text-[15.5px] leading-relaxed text-ink-2">{texto}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </motion.section>
  );
}

export function PanoramaPage() {
  useRolagemSuave();
  const { data: v, isLoading } = useQuery({ queryKey: ["visao-geral"], queryFn: api.visaoGeral, staleTime: Infinity });
  if (isLoading || !v) return <div className="mx-auto max-w-[1200px] space-y-6 px-5 py-16"><Skeleton className="h-24 w-2/3" /><Skeleton className="h-64" /></div>;
  const k = v.kpis, d = v.dinamica;
  const cats = [...v.categorias].sort((a, b) => a.nota_media - b.nota_media);
  const top3 = new Set(cats.slice(-3).map((c) => c.categoria)), fim3 = new Set(cats.slice(0, 3).map((c) => c.categoria));
  const tv = v.tempo_vs_nota;

  return (
    <div className="mx-auto max-w-[1200px] px-5">
      <header className="pt-16 pb-12">
        <p className="eyebrow">Análise de {num(k.restaurantes)} restaurantes do iFood · fev/2021</p>
        <h1 className="mt-5 max-w-[880px] text-[44px] leading-[1.04] tracking-[-0.02em] sm:text-[64px]">
          A nota diz o que parece dizer? <em className="text-ink-3">Quase metade dos restaurantes nem exibe uma.</em>
        </h1>
        <dl className="mt-12 grid grid-cols-2 gap-x-8 border-y border-line sm:grid-cols-4">
          <Kpi rotulo="Restaurantes" valor={num(k.restaurantes)} detalhe="coleta de fev/2021" />
          <Kpi rotulo="Sem nota exibida" valor={pct(k.pct_sem_nota)} detalhe="aparecem com nota 0" destaque />
          <Kpi rotulo="Nota média (com nota)" valor={num(k.nota_media, 2)} detalhe={`mediana ${num(k.nota_mediana, 2)}`} />
          <Kpi rotulo="Crescimento em 3 meses" valor={`+${num(d.crescimento_pct ?? 0, 1)}%`} detalhe={`+${num(d.novos)} entradas, −${num(d.sairam)} saídas`} />
        </dl>
      </header>

      <Secao n="1" titulo={<>44% sem nota: tratar o zero como nota derruba a média pela metade</>}
        texto={<>
          <p>Na base, {pct(k.pct_sem_nota)} dos restaurantes aparecem com nota 0 — e quase não existem notas entre 0 e 1. Zero não é nota ruim: é ausência de nota.</p>
          <p>Prova adicional: <strong className="font-medium text-ink">{num(v.perderam_nota)}</strong> restaurantes tinham nota em nov/2020 e aparecem com 0 em fev/2021. O app parece mostrar a nota só quando há avaliações recentes suficientes.</p>
        </>}>
        <div className="grid gap-8">
          <ViradaDaMedia errada={k.media_com_zeros} certa={k.nota_media} />
          <Figura titulo="Quase metade dos restaurantes não exibe nota" subtitulo="% dos restaurantes por faixa de nota"
            nota={v.modo === "agregados" ? "Sem os microdados, a distribuição aparece em 4 faixas reconstruídas dos percentuais publicados." : undefined}
            tabela={{ colunas: ["Faixa", "% dos restaurantes"], linhas: v.distribuicao.map((f) => [f.faixa, pct(f.pct)]) }}>
            <Barras ariaLabel="Distribuição das notas" formato={(x) => `${num(x, 0)}%`}
              dados={v.distribuicao.map((f) => ({ rotulo: f.faixa, valor: f.pct, tom: f.faixa === "Sem nota" ? "neutro" : "serie" }))} />
          </Figura>
        </div>
      </Secao>

      <Secao n="2" titulo="As notas se concentram no topo e diferenciam pouco"
        texto={<p>Entre quem tem nota, a mediana é {num(k.nota_mediana, 2)}. Uma em cada cinco notas é 5,0 cravado, e só {pct(k.pct_abaixo_4, 0)} ficam abaixo de 4. Numa escala tão comprimida, décimos importam mais do que parecem.</p>}>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[8px] border border-line bg-line">
          {[["Mediana", <Contador ate={k.nota_mediana} casas={2} />], ["Com nota 5,0", <Contador ate={k.pct_nota_5} casas={0} sufixo="%" />],
            ["Abaixo de 4,0", <Contador ate={k.pct_abaixo_4} casas={0} sufixo="%" />]].map(([r, val]) => (
            <div key={r as string} className="bg-surface p-6">
              <dt className="text-[12px] text-ink-3">{r}</dt>
              <dd className="mt-2 font-serif text-[48px] leading-none">{val}</dd>
            </div>
          ))}
        </dl>
      </Secao>

      <Secao n="3" titulo="Entrega mais lenta, nota um pouco menor — o efeito é pequeno"
        texto={<>
          <p>A nota média cai de {num(tv[0]?.nota_media, 2)} (até 30 min) para {num(tv.at(-1)?.nota_media, 2)} (acima de 90 min). Real, mas modesto: a correlação de Spearman entre nota e tempo é {num(v.spearman.tempo_entrega, 2)}.</p>
          <p className="text-[13.5px]">Taxa ({num(v.spearman.taxa_entrega, 2)}), distância ({num(v.spearman.distancia_km, 2)}) e pedido mínimo ({num(v.spearman.pedido_minimo, 2)}) se relacionam ainda menos com a nota.</p>
        </>}>
        <div className="grid gap-10">
          <Figura titulo="Nota média por tempo de entrega" subtitulo="minutos informados no app · apenas restaurantes com nota" nota="O eixo começa em 4,30 para tornar a diferença visível; a variação total é de ~0,13 ponto."
            tabela={{ colunas: ["Tempo (min)", "Nota média", "% abaixo de 4"], linhas: tv.map((t) => [t.faixa, num(t.nota_media, 3), pct(t.pct_abaixo_4)]) }}>
            <Linha ariaLabel="Nota média por faixa de tempo de entrega" dominio={[4.3, 4.7]}
              dados={tv.map((t) => ({ rotulo: t.faixa, valor: t.nota_media, detalhe: [["abaixo de 4", pct(t.pct_abaixo_4)]] }))} />
          </Figura>
          <Figura titulo="% de restaurantes com nota abaixo de 4,0" subtitulo="por faixa de tempo de entrega">
            <Barras ariaLabel="Porcentagem abaixo de 4 por tempo" altura={200} formato={(x) => `${num(x, 0)}%`}
              dados={tv.map((t) => ({ rotulo: t.faixa, valor: t.pct_abaixo_4, tom: "destaque" }))} />
          </Figura>
        </div>
      </Secao>

      <Secao n="4" titulo="A categoria pesa mais que o tempo"
        texto={<>
          <p>Sorvetes, Doces & Bolos e Bebidas passam de 4,7; Marmita, Pizza e Brasileira ficam perto de 4,4 — uma distância maior que a de qualquer faixa de tempo.</p>
          <p>Implicação prática: compare restaurantes <em>dentro</em> da mesma categoria. <Link to="/categorias" className="text-accent-ink underline-offset-4 hover:underline">Ver todas as categorias</Link></p>
        </>}>
        <Figura titulo="Nota média por categoria" subtitulo={v.modo === "agregados" ? "categorias com ≥ 2.000 restaurantes com nota" : "categorias com amostra mínima de restaurantes com nota"}
          nota="Eixo começa em 4,2. Em azul-escuro, as três maiores e as três menores notas."
          tabela={{ colunas: ["Categoria", "Nota média", "Com nota (n)"], linhas: [...cats].reverse().map((c) => [c.categoria, num(c.nota_media, 3), num(c.n)]) }}>
          <BarrasH ariaLabel="Nota média por categoria" dominio={[4.2, 4.85]} rotuloExtra={(b) => `n=${num(cats.find((c) => c.categoria === b.rotulo)?.n)}`}
            dados={[...cats].reverse().map((c) => ({ rotulo: c.categoria, valor: c.nota_media, tom: top3.has(c.categoria) || fim3.has(c.categoria) ? "serie" : "neutro",
              detalhe: [["tempo mediano", `${num(c.tempo_mediano)} min`], ["com nota", num(c.n)]] }))} />
        </Figura>
      </Secao>

      <Secao n="5" titulo={<>A base cresceu {num(d.crescimento_pct ?? 0, 1)}% em três meses — além da comida</>}
        texto={<p>Entre nov/2020 e fev/2021 entraram {num(d.novos)} restaurantes e saíram {num(d.sairam)}. Mercado e Conveniência lideram a renovação, seguidos de Açaí e Bebidas: expansão para além das refeições, somada ao efeito do verão.</p>}>
        <Figura titulo="Categorias que mais cresceram" subtitulo="% dos restaurantes de fev/2021 que não existiam em nov/2020"
          tabela={{ colunas: ["Categoria", "% novos"], linhas: d.entrada_por_categoria.map((c) => [c.categoria, pct(c.pct)]) }}>
          <BarrasH ariaLabel="Categorias com mais restaurantes novos" dominio={[0, Math.max(...d.entrada_por_categoria.map((c) => c.pct)) * 1.15]}
            formato={(x) => `${num(x, 1)}%`} dados={d.entrada_por_categoria.map((c) => ({ rotulo: c.categoria, valor: c.pct, detalhe: c.novos ? [["novos", num(c.novos)]] : [] }))} />
        </Figura>
      </Secao>

      <Secao n="6" titulo="A nota de nov/2020 não diferenciou quem saiu"
        texto={<p>A taxa de saída ficou entre 4,5% e 5,7% em todas as faixas de nota. Quem saiu da plataforma não era, em média, pior avaliado: a decisão parece movida por outros fatores.</p>}>
        <Figura titulo="% que não aparece em fev/2021" subtitulo="por faixa de nota em nov/2020"
          tabela={{ colunas: ["Nota em nov/2020", "% que saiu"], linhas: d.saida_por_faixa.map((f) => [f.faixa, pct(f.pct)]) }}>
          <Barras ariaLabel="Taxa de saída por faixa de nota" max={8} formato={(x) => `${num(x, 1)}%`}
            dados={d.saida_por_faixa.map((f) => ({ rotulo: f.faixa, valor: f.pct, tom: f.faixa === "sem nota" ? "neutro" : "serie" }))} />
        </Figura>
      </Secao>

      <section className="border-t border-line py-16">
        <p className="eyebrow">Limites desta leitura</p>
        <ul className="mt-5 grid gap-6 text-[14.5px] text-ink-2 sm:grid-cols-2 lg:grid-cols-4">
          <li><strong className="block font-medium text-ink">Nível restaurante</strong>Sem comentários, sem número de avaliações e sem nota por pedido.</li>
          <li><strong className="block font-medium text-ink">Ponto de busca</strong>Tempo e taxa são os do ponto usado na coleta, não da entrega real.</li>
          <li><strong className="block font-medium text-ink">Cobertura desigual</strong>Tocantins aparece com só 109 restaurantes.</li>
          <li><strong className="block font-medium text-ink">2020–2021</strong>Dados da pandemia. Correlação não é causalidade.</li>
        </ul>
        <Link to="/metodologia" className="mt-8 inline-block text-[14px] text-accent-ink underline-offset-4 hover:underline">Como os dados foram limpos</Link>
      </section>
    </div>
  );
}
