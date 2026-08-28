"""
check_migration_status.py
Run this FIRST — checks whether your Deriv account is on the new
Options API or still legacy.
"""
import requests
import sys

APP_ID = "33TfzA1atMUkDeXT5UoAU"
PAT_TOKEN = "pat_01a44dc3114d0df4d554682b5a155314006ad5ad1b010b5be32b6501da0ac525"
BASE_URL = "https://api.derivws.com"

def check_migration_status():
    url = f"{BASE_URL}/trading/v1/options/legacy/migration-status"
    headers = {"Deriv-App-ID": APP_ID, "Authorization": f"Bearer {PAT_TOKEN}"}
    try:
        response = requests.get(url, headers=headers, timeout=10)
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Could not reach Deriv API: {e}")
        sys.exit(1)
    print(f"HTTP status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Raw response:")
        print(data)
    elif response.status_code == 409:
        print("409 Conflict: migration pending or failed.")
    elif response.status_code == 401:
        print("401 Unauthorized: check APP_ID and PAT_TOKEN.")
    else:
        print(f"Unexpected response body:\n{response.text}")

if __name__ == "__main__":
    check_migration_status()
