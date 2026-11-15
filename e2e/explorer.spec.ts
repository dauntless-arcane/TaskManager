import { expect, test, type Page } from '@playwright/test';

/** Waits for the inline editor of a freshly created task, then renames it. */
async function rename(page: Page, title: string) {
  const input = page.getByRole('tree').getByRole('textbox');
  await expect(input).toBeFocused();
  await input.fill(title);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
}

test('create nested tasks, complete, reload persists, delete subtree', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await rename(page, 'Alpha');

  // add a child three levels deep
  for (const name of ['Beta', 'Gamma', 'Delta']) {
    await page.getByRole('treeitem').last().hover();
    await page.getByRole('treeitem').last().getByRole('button', { name: 'Add child' }).click();
    await rename(page, name);
  }
  await expect(page.getByRole('treeitem')).toHaveCount(4);
  await expect(page.getByRole('treeitem').last()).toHaveAttribute('aria-level', '4');

  // complete the deepest leaf => Alpha chain derives 100%
  await page.getByRole('treeitem').last().getByRole('button', { name: 'Mark completed' }).click();
  await expect(page.getByRole('treeitem').first()).toContainText('100%');
  // parent was NOT auto-completed
  await expect(page.getByRole('treeitem').first().getByRole('button', { name: 'Mark completed' })).toBeVisible();

  await page.reload();
  await page.getByRole('treeitem').first().getByRole('button', { name: 'Expand' }).click();
  await expect(page.getByRole('treeitem')).toHaveCount(2);
  await expect(page.getByRole('treeitem').first()).toContainText('100%');

  // delete requires confirmation and warns about descendants
  await page.getByRole('treeitem').first().click();
  await page.getByRole('button', { name: 'Delete task…' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('all of its descendants');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No projects yet')).toBeVisible();
});
