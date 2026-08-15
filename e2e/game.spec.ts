import { expect, test } from '@playwright/test'

/**
 * Minimal happy-path scenario, resilient to the new daily order generation:
 * open the game -> pick the first feasible (order, rover) pair -> see the
 * preview -> start the delivery -> wait for the server-controlled completion
 * -> see the result and the updated operation counter.
 *
 * Orders are now generated deterministically per day, so their ids change with
 * the seed/day. The test therefore discovers a startable pair from the UI
 * instead of hard-coding a specific order. Rover ids remain static.
 *
 * The test resets the game through the API first so the run is deterministic.
 * `ALLOW_GAME_RESET=true` must be set for the dev server (see README).
 */
test('delivery happy path', async ({ page, request }) => {
  const reset = await request.post('/api/game/reset')
  expect(reset.ok()).toBeTruthy()

  await page.goto('/')

  // The counter starts the day at 0/3.
  await expect(page.getByTestId('operations-today')).toContainText('0/3')

  const creditsBefore = await page.getByTestId('credits').innerText()

  const orderButtons = page.getByTestId(/^order-order-/)
  const roverButtons = page.getByTestId(/^rover-rover-/)
  const orderCount = await orderButtons.count()
  const roverCount = await roverButtons.count()
  expect(orderCount).toBeGreaterThan(0)
  expect(roverCount).toBeGreaterThan(0)

  const startButton = page.getByTestId('start-delivery')
  let started = false

  for (let i = 0; i < orderCount && !started; i += 1) {
    const order = orderButtons.nth(i)
    if (!(await order.isEnabled())) continue
    await order.click()

    for (let j = 0; j < roverCount; j += 1) {
      const rover = roverButtons.nth(j)
      if (!(await rover.isEnabled())) continue
      await rover.click()

      await expect(page.getByTestId('preview')).toBeVisible()
      try {
        await expect(startButton).toBeEnabled({ timeout: 2000 })
        started = true
        break
      } catch {
        // This rover cannot perform the order; try the next one.
      }
    }
  }

  expect(started).toBeTruthy()

  await startButton.click()

  // Starting a delivery counts as one operation for the day.
  await expect(page.getByTestId('operations-today')).toContainText('1/3')

  // The end-day lock is removed only after the server has completed the
  // delivery and reloaded game state. Then inspect the floating results panel.
  await expect(page.getByTestId('end-day')).toBeEnabled({ timeout: 45_000 })
  await page.getByTestId('activity-open').click()
  await page.getByTestId('activity-tab-results').click()
  await expect(page.getByTestId('recent-results')).toBeVisible()
  await expect(
    page.getByTestId('delivery-result-status').first(),
  ).toContainText(/успех|провал/)
  await page.getByTestId('activity-tab-journal').click()
  await expect(page.getByTestId('event-log')).toBeVisible()

  const creditsAfter = await page.getByTestId('credits').innerText()
  const ratingAfter = await page.getByTestId('rating').innerText()
  expect(
    creditsAfter !== creditsBefore || ratingAfter !== '100',
  ).toBeTruthy()
})
