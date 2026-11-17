import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Info, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

import { api } from "@/lib/api";
import { cn, num } from "@/lib/utils";

const NAV = [["/", "Panorama"], ["/explorar", "Explorar"], ["/geografia", "Geografia"], ["/categorias", "Categorias"],
  ["/restaurantes", "Restaurantes"], ["/metodologia", "Metodologia"]] as const;

export function useStatus() {
  return useQuery({ queryKey: ["status"], queryFn: api.status, staleTime: Infinity });
}

export function Shell() {
  const { data: s } = useStatus();
  const { pathname } = useLocation();
  const [escuro, setEscuro] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", escuro);
    try { localStorage.setItem("tema", escuro ? "escuro" : "claro"); } catch { /* ignora */ }
  }, [escuro]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">Pular para o conteúdo</a>
      <header className="sticky top-0 z-30 border-b border-line bg-paper/94 backdrop-blur-[6px]">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-5">
          <NavLink to="/" className="font-serif text-[20px] leading-none tracking-tight">Panorama <em className="text-ink-3">Delivery</em></NavLink>
          <nav aria-label="Principal" className="-mb-px hidden h-full items-stretch gap-1 md:flex">
            {NAV.map(([to, r]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) =>
                cn("flex items-center border-b-2 px-2.5 text-[13.5px] transition-colors", isActive ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
                {r}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {s && <span className="hidden font-mono text-[11px] text-ink-3 lg:inline">{num(s.registros.fev)} restaurantes · fev/2021</span>}
            <button onClick={() => setEscuro(!escuro)} aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"} className="text-ink-2 hover:text-ink">
              {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
        <nav aria-label="Principal (celular)" className="flex gap-1 overflow-x-auto border-t border-line px-3 md:hidden">
          {NAV.map(([to, r]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) =>
              cn("whitespace-nowrap border-b-2 px-2.5 py-2 text-[13px]", isActive ? "border-ink text-ink" : "border-transparent text-ink-2")}>{r}</NavLink>
          ))}
        </nav>
      </header>
      {s && s.modo !== "completo" && (
        <div className={cn("border-b px-5 py-2 text-center text-[12.5px]", s.modo === "sintetico" ? "border-warn/30 bg-warn-wash text-warn" : "border-line bg-sunken text-ink-2")} role="note">
          <span className="inline-flex items-center gap-1.5">
            {s.modo === "sintetico" ? <FlaskConical className="size-3.5" /> : <Info className="size-3.5" />}{s.descricao}
          </span>
        </div>
      )}
      <main id="conteudo"><Outlet /></main>
      <footer className="mt-24 border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap gap-x-6 gap-y-2 px-5 py-8 text-[12px] text-ink-3">
          <span>Dados: iFood Restaurants Data, publicado no Kaggle por Ricardo Tachinardi (coletas de nov/2020 e fev/2021).</span>
          <span>Projeto independente, sem vínculo com o iFood.</span>
          <span>Análise e produto: Luiza Miller.</span>
        </div>
      </footer>
    </div>
  );
}
