import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import "./index.css";
import { Shell } from "@/components/shell";
import { PanoramaPage } from "@/pages/panorama";

try {
  const t = localStorage.getItem("tema");
  if (t === "escuro" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
} catch { /* sem armazenamento */ }

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 5 * 60_000 } } });
const v = (nome: "ExplorarPage" | "GeografiaPage" | "CategoriasPage" | "RestaurantesPage" | "MetodologiaPage") =>
  async () => ({ Component: (await import("@/pages/views"))[nome] });

if (import.meta.env.VITE_DEMO) await (await import("./demo/ponte")).iniciarDemo();

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <PanoramaPage /> },
      { path: "/explorar", lazy: v("ExplorarPage") },
      { path: "/geografia", lazy: v("GeografiaPage") },
      { path: "/categorias", lazy: v("CategoriasPage") },
      { path: "/restaurantes", lazy: v("RestaurantesPage") },
      { path: "/metodologia", lazy: v("MetodologiaPage") },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" });

const preload = () => import("@/pages/views");
if ("requestIdleCallback" in window) requestIdleCallback(preload); else setTimeout(preload, 1500);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
