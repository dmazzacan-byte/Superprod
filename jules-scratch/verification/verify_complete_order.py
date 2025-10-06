import re
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 1. Navigate to the app
        page.goto("http://localhost:8000")

        # 2. Log in
        page.locator("#clientSelector").fill("operis-2")
        page.locator("#loginEmail").fill("administrador2@example.com")
        page.locator("#loginPassword").fill("123456")
        page.locator("#loginBtn").click()

        # 3. Wait for dashboard and navigate to Production Orders
        expect(page.locator("#dashboardPage")).to_be_visible(timeout=15000)
        page.locator("a[data-page='productionOrdersPage']").click()
        expect(page.locator("#productionOrdersPage")).to_be_visible()

        # 4. Find a pending order and click to complete it
        # We find a row with a "Pendiente" badge and get its corresponding complete button
        pending_order_row = page.locator("tr:has(span.badge.bg-warning:has-text('Pendiente'))").first

        # Get the order ID from the first cell of that row for later verification
        order_id_element = pending_order_row.locator("td").first
        order_id = order_id_element.inner_text()

        complete_button = pending_order_row.locator("button.complete-order-btn")

        # Check if a pending order was found
        if complete_button.count() == 0:
            print("No pending orders found to complete. Cannot verify.")
            # Take a screenshot anyway to show the state of the page
            page.screenshot(path="jules-scratch/verification/no_pending_orders.png")
            return

        complete_button.click()

        # 5. Fill and submit the completion modal
        completion_modal = page.locator("#confirmCloseOrderModal")
        expect(completion_modal).to_be_visible()

        # Use a real quantity, let's say 10
        completion_modal.locator("#realQuantityInput").fill("10")

        # Select the first available warehouse
        completion_modal.locator("#completionAlmacenSelect").select_option(index=1)

        completion_modal.locator("button[type='submit']").click()

        # 6. Wait for the success toast and verify the order is now "Completada"
        expect(page.locator("div.toastify.on.toast-bottom.toast-right")).to_have_text(re.compile(".*completada con éxito.*"), timeout=10000)

        # Find the row for the order we just completed
        completed_order_row = page.locator(f"tr:has(td:has-text('{order_id}'))")

        # Assert that it now has the "Completada" badge
        completed_badge = completed_order_row.locator("span.badge.bg-success:has-text('Completada')")
        expect(completed_badge).to_be_visible()

        # 7. Take a screenshot for final verification
        page.screenshot(path="jules-scratch/verification/verification.png")
        print("Screenshot taken. Verification successful.")

    except Exception as e:
        print(f"An error occurred during verification: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as p:
    run(p)