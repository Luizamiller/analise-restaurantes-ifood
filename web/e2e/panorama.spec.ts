import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });
const modo = process.env.FONTE === "auto" ? "agregados" : "sintetico";

test("panorama conta a história com os seis achados", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /A nota diz o que parece dizer/ })).toBeVisible();
  for (const n of ["1", "2", "3", "4", "5", "6"]) await expect(page.getByText(`Achado ${n}`)).toBeAttached();
  if (modo === "agregados") await expect(page.getByText("406.399").first()).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `test-results/panorama-${modo}.png` });
  await page.getByText("Achado 3").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `test-results/panorama-achado3-${modo}.png` });
});

test("geografia mostra os 27 estados e destaca ao clicar", async ({ page }) => {
  await page.goto("/geografia?metrica=nota_media");
  await expect(page.getByRole("img", { name: "Nota média" })).toBeVisible();
  await page.getByRole("row", { name: /^SP/ }).click();
  await expect(page).toHaveURL(/uf=SP/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test-results/geografia-${modo}.png` });
});

test("explorar filtra e recalcula", async ({ page }) => {
  await page.goto("/explorar");
  if (modo === "agregados") {
    await expect(page.getByText("Esta visão precisa da base completa")).toBeVisible();
    return;
  }
  const antes = await page.getByText("Restaurantes", { exact: true }).locator("xpath=following-sibling::dd[1]").textContent();
  await page.getByRole("button", { name: /^UF/ }).click();
  await page.getByRole("option", { name: "SP" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/uf=SP/);
  await expect.poll(async () => page.getByText("Restaurantes", { exact: true }).locator("xpath=following-sibling::dd[1]").textContent()).not.toBe(antes);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/explorar.png", fullPage: true });
});

test("explorador de registros busca e ordena no servidor", async ({ page }) => {
  test.skip(modo === "agregados");
  await page.goto("/restaurantes");
  await page.getByPlaceholder("Nome ou categoria").fill("Pizza");
  await expect(page).toHaveURL(/busca=Pizza/);
  await page.getByRole("button", { name: "Tempo" }).click();
  await expect(page).toHaveURL(/ordem=tempo_entrega/);
  await expect(page.getByRole("cell", { name: "Pizza" }).first()).toBeVisible();
});
