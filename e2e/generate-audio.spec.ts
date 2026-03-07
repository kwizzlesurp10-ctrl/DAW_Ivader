import { test, expect } from '@playwright/test';

const MOCK_AUDIO_DATA_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

async function ensureAppReady(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const splash = page.getByTestId('splash-panel');
  if (await splash.isVisible().catch(() => false)) {
    await page.getByTestId('init-button').click();
    await page.getByTestId('splash-panel').waitFor({ state: 'hidden', timeout: 25_000 });
  }
  await page.getByTestId('generate-prompt-input').waitFor({ state: 'visible', timeout: 10_000 });
}

test.describe('Music generation (Generate)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/generate-audio', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON();
      if (!body?.prompt) {
        await route.fulfill({ status: 400, body: JSON.stringify({ error: 'Missing or empty prompt' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: MOCK_AUDIO_DATA_URL }),
      });
    });
  });

  test('full flow: enter prompt, click Generate, see new loop and cleared prompt', async ({ page }) => {
    await ensureAppReady(page);

    const promptInput = page.getByTestId('generate-prompt-input');
    const generateBtn = page.getByRole('button', { name: /^GENERATE$/i });

    await promptInput.fill('Dark cyberpunk bassline');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    await expect(page.getByText('PROCESSING...')).toBeVisible();
    await expect(page.getByText('PROCESSING...')).toBeHidden({ timeout: 15_000 });

    await expect(promptInput).toHaveValue('');
    await expect(page.getByText(/Loop 1/i)).toBeVisible({ timeout: 5_000 });
  });

  test('Generate button disabled while processing', async ({ page }) => {
    await ensureAppReady(page);

    await page.route('**/api/generate-audio', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: MOCK_AUDIO_DATA_URL }),
      });
    });

    await page.getByTestId('generate-prompt-input').fill('Test prompt');
    await page.getByRole('button', { name: /^GENERATE$/i }).click();

    await expect(page.getByRole('button', { name: /PROCESSING/i })).toBeDisabled();
  });

  test('shows error alert when API returns error', async ({ page }) => {
    await page.route('**/api/generate-audio', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'HuggingFace API error 502' }),
      });
    });

    page.on('dialog', (dialog) => {
      expect(dialog.message()).toContain('Generate audio failed');
      dialog.accept();
    });

    await ensureAppReady(page);
    await page.getByTestId('generate-prompt-input').fill('Fail me');
    await page.getByRole('button', { name: /^GENERATE$/i }).click();

    await expect(page.getByText('PROCESSING...')).toBeHidden({ timeout: 5_000 });
  });
});
