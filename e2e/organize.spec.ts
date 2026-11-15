import { expect, test, type Page } from '@playwright/test';

async function rename(page: Page, title: string) {
  const input = page.getByRole('tree').getByRole('textbox');
  await expect(input).toBeFocused();
  await input.fill(title);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
}

const row = (page: Page, title: string) => page.getByRole('treeitem').filter({ hasText: title });
const titles = (page: Page) => page.getByRole('treeitem').evaluateAll((els) => els.map((e) => e.textContent?.replace(/\d+%$/, '').trim()));

async function addRoot(page: Page, title: string) {
  await page.getByRole('button', { name: 'New project' }).click();
  await rename(page, title);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await addRoot(page, 'Alpha');
  await addRoot(page, 'Bravo');
  await addRoot(page, 'Charlie');
});

test('context menu: add sibling, duplicate, priority, delete with warning', async ({ page }) => {
  await row(page, 'Alpha').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add child' }).click();
  await rename(page, 'Alpha child');

  await row(page, 'Alpha child').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add sibling' }).click();
  await rename(page, 'Alpha sibling');
  await expect(row(page, 'Alpha sibling')).toHaveAttribute('aria-level', '2');

  await row(page, 'Alpha').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(row(page, 'Alpha (copy)')).toBeVisible();

  await row(page, 'Bravo').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Critical' }).click();
  await row(page, 'Bravo').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Critical/ })).toContainText('✓');
  await page.keyboard.press('Escape');

  await row(page, 'Charlie').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row(page, 'Charlie')).toHaveCount(0);
});

test('search and filters show matches in context', async ({ page }) => {
  await row(page, 'Alpha').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add child' }).click();
  await rename(page, 'Needle');

  await page.getByLabel('Search tasks').fill('needle');
  await expect(page.getByRole('treeitem')).toHaveCount(2); // match + its ancestor
  await expect(row(page, 'Bravo')).toHaveCount(0);

  await page.getByLabel('Search tasks').fill('zzz');
  await expect(page.getByText('No tasks match these filters.')).toBeVisible();

  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByLabel('Filter by priority').selectOption('critical');
  await expect(page.getByText('No tasks match these filters.')).toBeVisible();
});

test('move dialog relocates a task with its subtree and blocks invalid targets', async ({ page }) => {
  await row(page, 'Alpha').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add child' }).click();
  await rename(page, 'Kid');

  await row(page, 'Alpha').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move…' }).click();
  const options = await page.getByRole('dialog').getByRole('option').allTextContents();
  expect(options.some((o) => o.includes('Kid'))).toBe(false); // own descendant is not offered
  await page.getByRole('dialog').getByRole('option', { name: 'Bravo' }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();

  await expect(row(page, 'Alpha').first()).toHaveAttribute('aria-level', '2');
  await expect(row(page, 'Kid')).toBeVisible();
});

test('drag and drop: reorder siblings and nest into a task', async ({ page }) => {
  expect(await titles(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);

  // drop Charlie on the top edge of Alpha => becomes first
  const alpha = (await row(page, 'Alpha').boundingBox())!;
  const charlie = (await row(page, 'Charlie').boundingBox())!;
  await page.mouse.move(charlie.x + 60, charlie.y + charlie.height / 2);
  await page.mouse.down();
  await page.mouse.move(charlie.x + 60, charlie.y - 20, { steps: 5 });
  await page.mouse.move(alpha.x + 60, alpha.y + 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => titles(page)).toEqual(['Charlie', 'Alpha', 'Bravo']);

  // drop Bravo on the middle of Alpha => nested inside Alpha
  const a2 = (await row(page, 'Alpha').boundingBox())!;
  const b2 = (await row(page, 'Bravo').boundingBox())!;
  await page.mouse.move(b2.x + 60, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + 60, b2.y - 10, { steps: 5 });
  await page.mouse.move(a2.x + 60, a2.y + a2.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(row(page, 'Bravo')).toHaveAttribute('aria-level', '2');

  await page.reload();
  await expect(row(page, 'Charlie')).toHaveAttribute('aria-level', '1');
  expect((await titles(page))[0]).toBe('Charlie');
});
