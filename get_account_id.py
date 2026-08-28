"""
get_account_id.py
Calls the Create Account endpoint with account_type=demo. Per Deriv's
docs, if a demo account already exists, this returns it (200 OK)
rather than creating a duplicate -- so this is really "get my existing
demo account_id" in practice.
"""
import requests

APP_ID = "33TfzA1atMUkDeXT5UoAU"
PAT_TOKEN = "pat_deb185970af9e450c99ef1c152ddb6f6ef59330213ee01c67482428e328cbed1"
BASE_URL = "https://api.derivws.com"

def get_account_id():
    url = f"{BASE_URL}/trading/v1/options/accounts"
    headers = {
        "Deriv-App-ID": APP_ID,
        "Authorization": f"Bearer {PAT_TOKEN}",
        "Content-Type": "application/json",
    }
    body = {
        "currency": "USD",
        "group": "row",
        "account_type": "demo",
    }
    response = requests.post(url, headers=headers, json=body, timeout=10)
    print(f"HTTP status: {response.status_code}")
    print("Response body:", response.text)

if __name__ == "__main__":
    get_account_id()