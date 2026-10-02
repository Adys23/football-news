import { expect, test, type Page } from "@playwright/test";

// Dane z scripts/e2e-seed.mjs.
const ARTICLE_PATH = "/ekstraklasa/e2e-lech-poznan-przedluzyl-kontrakt-z-trenerem";
const ARTICLE_TITLE = "Lech Poznań przedłużył kontrakt z trenerem do 2028 roku";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectWellFormedXml(page: Page, path: string): Promise<string> {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");

  const xml = await response.text();
  const parseError = await page.evaluate(
    (source) =>
      new DOMParser().parseFromString(source, "application/xml").querySelector("parsererror")
        ?.textContent ?? null,
    xml,
  );
  expect(parseError).toBeNull();
  return xml;
}

test("strona glowna renderuje liste artykulow", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");

  await expect(page.getByRole("link", { name: ARTICLE_TITLE }).first()).toHaveAttribute(
    "href",
    ARTICLE_PATH,
  );
  expect(errors).toEqual([]);
});

test("strona artykulu renderuje bloki i informacje o roli AI", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto(ARTICLE_PATH);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ARTICLE_TITLE);
  await expect(page.getByRole("heading", { level: 2, name: "Szczegóły umowy" })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Umowa do czerwca 2028" }),
  ).toBeVisible();
  await expect(page.locator("blockquote")).toContainText("Chcemy budować zespół na lata.");
  await expect(page.getByRole("heading", { name: "Jak powstał ten tekst" })).toBeVisible();
  await expect(page.getByText("sprawdził go i zatwierdził redaktor")).toBeVisible();
  expect(errors).toEqual([]);
});

test("artykul zawiera JSON-LD NewsArticle z datami", async ({ page }) => {
  await page.goto(ARTICLE_PATH);

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const newsArticle = blocks
    .map((block) => JSON.parse(block) as Record<string, unknown>)
    .find((data) => data["@type"] === "NewsArticle");

  expect(newsArticle).toBeDefined();
  expect(newsArticle?.headline).toBe(ARTICLE_TITLE);
  for (const key of ["datePublished", "dateModified"]) {
    const value = newsArticle?.[key];
    expect(typeof value).toBe("string");
    expect(Number.isNaN(Date.parse(String(value)))).toBe(false);
  }
});

test("/admin bez sesji przekierowuje do logowania", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
});

test("sitemapy zwracaja poprawny XML z artykulem", async ({ page }) => {
  await page.goto("/");

  const sitemap = await expectWellFormedXml(page, "/sitemap.xml");
  expect(sitemap).toContain(ARTICLE_PATH);

  const newsSitemap = await expectWellFormedXml(page, "/sitemap-news.xml");
  expect(newsSitemap).toContain(ARTICLE_PATH);
});
