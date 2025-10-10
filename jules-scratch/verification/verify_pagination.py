from playwright.sync_api import sync_playwright
import requests
import time

def create_user_in_emulator(email, password):
    """Creates a user in the Firebase Auth Emulator."""
    api_key = "AIzaSyAyMsDnA4TadOXrwxUqumwPAji9S3QiEAE"  # From config.js for hcali
    signup_url = f"http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}"
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }
    try:
        response = requests.post(signup_url, json=payload)
        response.raise_for_status()  # Raise an exception for bad status codes
        print(f"Successfully created user: {email}")
        return response.json()
    except requests.exceptions.RequestException as e:
        # It's possible the user already exists, which is fine for our test.
        if e.response and "EMAIL_EXISTS" in e.response.text:
            print(f"User {email} already exists.")
        else:
            print(f"Error creating user: {e}")
            if e.response:
                print(f"Response body: {e.response.text}")
            raise  # Re-raise the exception to fail the script if it's an unexpected error


def run(playwright):
    # Give emulators time to start
    time.sleep(10)

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        # 0. Create user in emulator
        create_user_in_emulator("test@test.com", "123456")

        # 1. Login
        page.goto("http://127.0.0.1:8000")
        page.locator("#clientSelector").fill("hcali")
        page.locator("#loginEmail").fill("test@test.com")
        page.locator("#loginPassword").fill("123456")
        page.locator("#loginBtn").click()

        # Wait for the main app view to be visible
        page.wait_for_selector("#appView:not(.d-none)", timeout=15000)

        # 2. Navigate to Products Page
        page.click('a[data-page="productsPage"]')

        # Wait for the products table to be populated
        page.wait_for_selector("#productsTableBody tr")

        # 3. Take a screenshot of the first page
        page.screenshot(path="jules-scratch/verification/products_page_1.png")

        # 4. Go to the next page and take a screenshot
        page.click("#productsPagination-nextBtn")
        page.wait_for_selector("#productsTableBody tr")
        page.screenshot(path="jules-scratch/verification/products_page_2.png")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="jules-scratch/verification/error.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)