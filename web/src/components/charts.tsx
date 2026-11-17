/**
 * Gráficos em SVG, sem biblioteca: controle total da tipografia, leves (~0 kB extra) e acessíveis.
 * Regras (skill de dataviz): marcas finas, pontas arredondadas de 4px ancoradas na base, linha de 2px,
 * marcadores >= 8px, grade recessiva, um eixo só, tooltip em toda marca, tabela alternativa em toda figura.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn, num } from "@/lib/utils";

export function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

type Dica = { x: number; y: number; titulo: string; linhas: [string, string][] } | null;

function Tooltip({ dica }: { dica: Dica }) {
  if (!dica) return null;
  return (
    <div role="status" className="pointer-events-none absolute z-20 min-w-[140px] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-[6px] border border-line bg-surface px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,.12)]"
      style={{ left: dica.x, top: dica.y }}>
      <p className="text-[12px] font-medium text-ink">{dica.titulo}</p>
      {dica.linhas.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4 text-[12px] text-ink-2"><span>{k}</span><span className="font-mono text-ink">{v}</span></p>
      ))}
    </div>
  );
}

/** Retângulo com pontas superiores (ou direitas) arredondadas e base reta. */
function barra(x: number, y: number, w: number, h: number, horizontal = false, r = 4) {
  if (w <= 0 || h <= 0) return "";
  r = Math.min(r, horizontal ? h / 2 : w / 2, horizontal ? w : h);
  return horizontal
    ? `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`
    : `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function Figura({ titulo, subtitulo, nota, tabela, children, className, id }: {
  titulo: string; subtitulo?: string; nota?: string; tabela?: { colunas: string[]; linhas: (string | number)[][] };
  children: ReactNode; className?: string; id?: string;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <figure id={id} className={cn("min-w-0", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <figcaption className="font-serif text-[19px] leading-snug text-ink">{titulo}</figcaption>
          {subtitulo && <p className="mt-0.5 text-[13px] text-ink-3">{subtitulo}</p>}
        </div>
        {tabela && (
          <button onClick={() => setVerTabela(!verTabela)} aria-pressed={verTabela} className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3 hover:text-ink">
            {verTabela ? "gráfico" : "tabela"}
          </button>
        )}
      </div>
      <div className="mt-4">
        {verTabela && tabela ? (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line text-left text-ink-3">{tabela.colunas.map((c) => <th key={c} className="py-1.5 pr-3 font-medium">{c}</th>)}</tr></thead>
            <tbody>{tabela.linhas.map((l, i) => <tr key={i} className="border-b border-line/60">{l.map((c, j) => <td key={j} className={cn("py-1.5 pr-3", j > 0 && "font-mono tnum")}>{c}</td>)}</tr>)}</tbody>
          </table>
        ) : children}
      </div>
      {nota && <p className="mt-3 text-[11.5px] text-ink-3">{nota}</p>}
    </figure>
  );
}

export type Barra = { rotulo: string; valor: number; tom?: "serie" | "neutro" | "destaque"; detalhe?: [string, string][] };

export function Barras({ dados, formato = (v) => num(v, 1), altura = 240, max, ariaLabel }: {
  dados: Barra[]; formato?: (v: number) => string; altura?: number; max?: number; ariaLabel: string;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica>(null);
  const m = { t: 22, b: 30, l: 4, r: 4 };
  const top = max ?? Math.max(...dados.map((d) => d.valor)) * 1.08;
  const ih = altura - m.t - m.b;
  const banda = (w - m.l - m.r) / Math.max(1, dados.length);
  const bw = Math.min(56, banda * 0.62);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setDica(null)}>
      {w > 0 && (
        <svg width={w} height={altura} role="img" aria-label={ariaLabel} className="block overflow-visible">
          <line x1={m.l} x2={w - m.r} y1={altura - m.b} y2={altura - m.b} stroke="var(--line-strong)" />
          {dados.map((d, i) => {
            const h = (d.valor / top) * ih;
            const x = m.l + banda * i + (banda - bw) / 2;
            const y = altura - m.b - h;
            const cor = d.tom === "neutro" ? "var(--neutro)" : d.tom === "destaque" ? "var(--serie-2)" : "var(--serie-1)";
            return (
              <g key={d.rotulo}>
                <path d={barra(x, y, bw, h)} fill={cor} />
                <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="12" className="fill-ink font-mono">{formato(d.valor)}</text>
                <text x={x + bw / 2} y={altura - m.b + 18} textAnchor="middle" fontSize="12" className="fill-ink-2">{d.rotulo}</text>
                <rect x={m.l + banda * i} y={m.t - 10} width={banda} height={ih + 10} fill="transparent"
                  onMouseMove={() => setDica({ x: x + bw / 2, y: Math.max(y, m.t), titulo: d.rotulo, linhas: [["valor", formato(d.valor)], ...(d.detalhe ?? [])] })} />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip dica={dica} />
    </div>
  );
}

export function BarrasH({ dados, dominio, formato = (v) => num(v, 2), rotuloExtra, alturaLinha = 26, ariaLabel }: {
  dados: Barra[]; dominio: [number, number]; formato?: (v: number) => string; rotuloExtra?: (d: Barra) => string;
  alturaLinha?: number; ariaLabel: string;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica>(null);
  const ml = Math.min(150, Math.max(90, w * 0.26)), mr = 96;
  const ih = dados.length * alturaLinha;
  const esc = (v: number) => ((Math.max(v, dominio[0]) - dominio[0]) / (dominio[1] - dominio[0])) * (w - ml - mr);
  const ticks = Array.from({ length: 5 }, (_, i) => dominio[0] + ((dominio[1] - dominio[0]) * i) / 4);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setDica(null)}>
      {w > 0 && (
        <svg width={w} height={ih + 24} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ml + esc(t)} x2={ml + esc(t)} y1={0} y2={ih} stroke="var(--grade)" />
              <text x={ml + esc(t)} y={ih + 16} textAnchor="middle" fontSize="11" className="fill-ink-3 font-mono">{num(t, 1)}</text>
            </g>
          ))}
          {dados.map((d, i) => {
            const y = i * alturaLinha + 5;
            const bh = alturaLinha - 10;
            const cor = d.tom === "neutro" ? "var(--neutro)" : d.tom === "destaque" ? "var(--serie-2)" : "var(--serie-1)";
            return (
              <g key={d.rotulo}>
                <text x={ml - 10} y={y + bh / 2 + 4} textAnchor="end" fontSize="12.5" className="fill-ink-2">{d.rotulo}</text>
                <path d={barra(ml, y, esc(d.valor), bh, true)} fill={cor} />
                <text x={ml + esc(d.valor) + 6} y={y + bh / 2 + 4} fontSize="11.5" className="fill-ink font-mono">
                  {formato(d.valor)}{rotuloExtra && <tspan className="fill-ink-3"> {rotuloExtra(d)}</tspan>}
                </text>
                <rect x={0} y={i * alturaLinha} width={w} height={alturaLinha} fill="transparent"
                  onMouseMove={() => setDica({ x: ml + esc(d.valor), y, titulo: d.rotulo, linhas: [["valor", formato(d.valor)], ...(d.detalhe ?? [])] })} />
              </g>
            );
          })}
          <line x1={ml} x2={ml} y1={0} y2={ih} stroke="var(--line-strong)" />
        </svg>
      )}
      <Tooltip dica={dica} />
    </div>
  );
}

export function Linha({ dados, dominio, formato = (v) => num(v, 2), altura = 240, ariaLabel, rotuloY }: {
  dados: { rotulo: string; valor: number; detalhe?: [string, string][] }[]; dominio: [number, number]; formato?: (v: number) => string;
  altura?: number; ariaLabel: string; rotuloY?: string;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);
  const m = { t: 24, b: 30, l: 40, r: 16 };
  const ih = altura - m.t - m.b, iw = w - m.l - m.r;
  const x = (i: number) => m.l + (dados.length === 1 ? iw / 2 : (iw * i) / (dados.length - 1));
  const y = (v: number) => m.t + ih - ((v - dominio[0]) / (dominio[1] - dominio[0])) * ih;
  const ticks = Array.from({ length: 5 }, (_, i) => dominio[0] + ((dominio[1] - dominio[0]) * i) / 4);
  const caminho = dados.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.valor)}`).join(" ");
  const d = ativo != null ? dados[ativo] : null;
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setAtivo(null)}>
      {w > 0 && (
        <svg width={w} height={altura} role="img" aria-label={ariaLabel} className="block overflow-visible"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left - m.l) / iw) * (dados.length - 1));
            setAtivo(Math.max(0, Math.min(dados.length - 1, i)));
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--grade)" />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" className="fill-ink-3 font-mono">{num(t, 2)}</text>
            </g>
          ))}
          {rotuloY && <text x={m.l} y={10} fontSize="11" className="fill-ink-3">{rotuloY}</text>}
          {ativo != null && <line x1={x(ativo)} x2={x(ativo)} y1={m.t} y2={m.t + ih} stroke="var(--line-strong)" strokeDasharray="3 3" />}
          <path d={caminho} fill="none" stroke="var(--serie-1)" strokeWidth="2" strokeLinejoin="round" />
          {dados.map((p, i) => (
            <g key={p.rotulo}>
              <circle cx={x(i)} cy={y(p.valor)} r={ativo === i ? 5.5 : 4.5} fill="var(--serie-1)" stroke="var(--surface)" strokeWidth="2" />
              {(i === 0 || i === dados.length - 1) && (
                <text x={x(i) + (i === 0 ? 8 : -8)} y={y(p.valor) - 12} textAnchor={i === 0 ? "start" : "end"} fontSize="12" className="fill-ink font-mono">{formato(p.valor)}</text>
              )}
              <text x={x(i)} y={altura - 8} textAnchor="middle" fontSize="12" className="fill-ink-2">{p.rotulo}</text>
            </g>
          ))}
        </svg>
      )}
      {d && ativo != null && <Tooltip dica={{ x: x(ativo), y: y(d.valor), titulo: d.rotulo, linhas: [["nota média", formato(d.valor)], ...(d.detalhe ?? [])] }} />}
    </div>
  );
}

/** Mapa em grade: cada UF ocupa uma célula igual — honesto para comparar estados de áreas muito diferentes. */
const GRADE: Record<string, [number, number]> = {
  RR: [2, 0], AP: [4, 0], AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [0, 2], RO: [1, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2],
  MT: [2, 3], GO: [3, 3], BA: [4, 3], SE: [5, 3], AL: [6, 3],
  DF: [3, 4], MG: [4, 4], ES: [5, 4], MS: [2, 5], SP: [3, 5], RJ: [4, 5], PR: [3, 6], SC: [3, 7], RS: [3, 8],
};

export function MapaGrade({ valores, formato, destaque, onSelecionar, rotulo }: {
  valores: Record<string, number | null>; formato: (v: number) => string; destaque?: string | null;
  onSelecionar?: (uf: string) => void; rotulo: string;
}) {
  const [dica, setDica] = useState<Dica>(null);
  const vs = Object.values(valores).filter((v): v is number => v != null).sort((a, b) => a - b);
  const quantis = Array.from({ length: 6 }, (_, i) => vs[Math.floor(((i + 1) / 7) * (vs.length - 1))]);
  const passo = (v: number) => quantis.filter((q) => v > q).length + 1;
  const tam = 60, gap = 4;
  const largura = 7 * (tam + gap), altura = 9 * (tam + gap);
  const [escuro, setEscuro] = useState(false);
  useEffect(() => { setEscuro(document.documentElement.classList.contains("dark")); }, []);
  return (
    <div className="relative" onMouseLeave={() => setDica(null)}>
      <svg viewBox={`0 0 ${largura} ${altura}`} className="mx-auto block h-auto w-full max-w-[400px]" role="img" aria-label={rotulo}>
        {Object.entries(GRADE).map(([uf, [c, r]]) => {
          const v = valores[uf];
          const s = v == null ? 0 : passo(v);
          const x = c * (tam + gap), y = r * (tam + gap);
          const claroTexto = escuro ? s <= 5 : s >= 4;
          return (
            <g key={uf} transform={`translate(${x} ${y})`} className={onSelecionar ? "cursor-pointer" : undefined}
              onClick={() => onSelecionar?.(uf)} tabIndex={onSelecionar ? 0 : undefined}
              onKeyDown={(e) => e.key === "Enter" && onSelecionar?.(uf)}
              onMouseMove={() => setDica({ x: ((x + tam / 2) / largura) * 100, y: (y / altura) * 100, titulo: uf, linhas: [[rotulo, v == null ? "—" : formato(v)]] })}>
              <rect width={tam} height={tam} rx={5} fill={v == null ? "var(--sunken)" : `var(--seq-${s})`}
                stroke={destaque === uf ? "var(--ink)" : "var(--surface)"} strokeWidth={destaque === uf ? 2 : 1} />
              <text x={8} y={18} fontSize="12" fontWeight="600" fill={claroTexto ? "#fff" : "var(--ink)"} className="font-sans">{uf}</text>
              <text x={7} y={tam - 9} fontSize="10" fill={claroTexto ? "rgba(255,255,255,.85)" : "var(--ink-2)"} className="font-mono">{v == null ? "—" : formato(v)}</text>
            </g>
          );
        })}
      </svg>
      {dica && (
        <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-[6px] border border-line bg-surface px-3 py-1.5 text-[12px] shadow-lg"
          style={{ left: `${dica.x}%`, top: `${dica.y}%` }}>
          <span className="font-medium">{dica.titulo}</span> <span className="font-mono text-ink-2">{dica.linhas[0][1]}</span>
        </div>
      )}
      <div className="mx-auto mt-4 flex max-w-[400px] items-center gap-2 text-[11px] text-ink-3">
        <span className="font-mono">{vs.length ? formato(vs[0]) : ""}</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full">
          {[1, 2, 3, 4, 5, 6, 7].map((s) => <span key={s} className="flex-1" style={{ background: `var(--seq-${s})` }} />)}
        </div>
        <span className="font-mono">{vs.length ? formato(vs[vs.length - 1]) : ""}</span>
      </div>
      <p className="mx-auto mt-1 max-w-[400px] text-center text-[11px] text-ink-3">sete faixas por quantil · cada estado ocupa uma célula igual</p>
    </div>
  );
}

export function Kpi({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className="py-4">
      <dt className="text-[12px] text-ink-3">{rotulo}</dt>
      <dd className={cn("tnum mt-1 font-serif text-[30px] leading-none tracking-tight", destaque && "text-accent-ink")}>{valor}</dd>
      {detalhe && <dd className="mt-1.5 text-[12px] text-ink-3">{detalhe}</dd>}
    </div>
  );
}
