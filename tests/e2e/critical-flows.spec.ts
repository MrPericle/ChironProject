import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

const password = "E2ePassword123!";
const apiBaseUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:18000";

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = value
    .replace(/=+$/u, "")
    .toUpperCase()
    .split("")
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, "0"))
    .join("");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function scenario(projectName: string) {
  const variant = projectName.startsWith("mobile") ? "mobile" : "desktop";
  return {
    adminEmail: `e2e.admin.${variant}@maka.local`,
    memberEmail: `e2e.member.${variant}@maka.local`,
    locationName: `Sede E2E ${variant}`,
    courseTitle: `Corso E2E ${variant}`,
  };
}

test.describe.configure({ mode: "serial" });

test("admin configura il 2FA e prepara un corso prenotabile", async ({ page }, testInfo) => {
  const data = scenario(testInfo.project.name);

  await page.goto("/");
  await page.getByLabel("Email").fill(data.adminEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Entra nell'area utente" }).click();

  await expect(page.getByRole("heading", { name: "Configura il 2FA" })).toBeVisible();
  const secret = await page.getByLabel("Chiave manuale 2FA").inputValue();
  await page.getByLabel("Codice 2FA").fill(totpCode(secret));
  await page.getByRole("button", { name: "Attiva e accedi" }).click();
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Sedi" }).click();
  await page.getByRole("button", { name: "Nuova sede" }).click();
  await page.getByLabel("Nome sede").fill(data.locationName);
  await page.getByLabel("Indirizzo").fill("Via Test 1");
  await page.getByLabel("Citta").fill("Milano");
  await page.getByRole("button", { name: "Crea sede" }).click();
  await expect(page.getByRole("heading", { name: data.locationName })).toBeVisible();

  await page.getByRole("button", { name: "Utenti" }).click();
  await page.getByRole("button", { name: "Nuovo utente" }).click();
  await page.getByLabel("Email utente").fill(data.memberEmail);
  await page.getByLabel("Nome utente", { exact: true }).fill("Utente");
  await page.getByLabel("Cognome utente", { exact: true }).fill("E2E");
  await page.getByLabel("Password provvisoria").fill(password);
  await page.getByRole("button", { name: "Crea utente" }).click();
  await expect(page.getByRole("heading", { name: data.memberEmail })).toBeVisible();
  await page.getByRole("button", { name: `Modifica dati e iscrizione ${data.memberEmail}` }).click();
  await page.getByRole("button", { name: `Crea iscrizione ${data.memberEmail}` }).click();
  await expect(page.getByText("Iscrizione aggiornata.")).toBeVisible();

  await page.getByRole("button", { name: "Corsi" }).click();
  await page.getByRole("button", { name: "Nuovo corso" }).click();
  await page.getByLabel("Titolo corso").fill(data.courseTitle);
  await page.getByLabel("Descrizione corso").fill("Corso creato dalla suite end-to-end");
  await page.getByLabel("Sede corso").selectOption({ label: data.locationName });
  await page.getByRole("button", { name: "Crea corso" }).click();
  await expect(page.getByRole("heading", { name: data.courseTitle })).toBeVisible();

  const manageCourse = page.getByRole("button", { name: `Gestisci ${data.courseTitle}` });
  if ((await manageCourse.getAttribute("aria-expanded")) !== "true") {
    await manageCourse.click();
  }
  await page.getByRole("button", { name: `Configura orari ${data.courseTitle}` }).click();
  await page.getByLabel("Data singola").check();
  await page.getByLabel("Data della lezione").fill(tomorrowIso());
  await page.getByLabel("Ora inizio").fill("20:00");
  await page.getByLabel("Ora fine").fill("21:00");
  await page.getByLabel("Posti per lezione").fill("6");
  await page.getByLabel("Ore limite cancellazione").fill("0");
  await page.getByRole("button", { name: "Aggiungi lezione" }).click();
  await expect(page.getByText("Lezione singola creata.")).toBeVisible();
});

test("utente prenota, vede lo stato aggiornato e cancella", async ({ page, request }, testInfo) => {
  const data = scenario(testInfo.project.name);
  const isMobile = testInfo.project.name.startsWith("mobile");

  await page.goto("/");
  await page.getByLabel("Email").fill(data.memberEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Entra nell'area utente" }).click();

  const course = page.getByRole("article", { name: data.courseTitle });
  await expect(course).toBeVisible();
  await course.getByRole("button", { name: "Prenota" }).click();
  await expect(page.getByText("Prenotazione confermata.")).toBeVisible();
  await expect(course.getByRole("button", { name: "Prenotato" })).toBeDisabled();

  const session = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("chiron.user.session") ?? "null"),
  );
  const forbidden = await request.get(`${apiBaseUrl}/admin/users`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  expect(forbidden.status()).toBe(403);

  if (isMobile) {
    await page.getByRole("button", { name: "Prenotazioni" }).click();
  }
  await page.getByRole("button", { name: `Cancella ${data.courseTitle}` }).click();
  await expect(page.getByText("Prenotazione cancellata.")).toBeVisible();
  await expect(page.getByText("Non hai prenotazioni attive.")).toBeVisible();
});
