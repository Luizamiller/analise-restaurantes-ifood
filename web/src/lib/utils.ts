import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const num = (v: number | null | undefined, casas = 0) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const pct = (v: number | null | undefined, casas = 1) => (v == null ? "—" : `${num(v, casas)}%`);
export const reais = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
export const compacto = (v: number) => (v >= 1000 ? `${num(v / 1000, v >= 10000 ? 0 : 1)} mil` : num(v));
