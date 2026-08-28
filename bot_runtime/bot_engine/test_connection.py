import asyncio
import json
import websockets

APP_ID = "1089"
API_TOKEN = "pat_aebcef3bee4ef7bf42c427af6caaec67dca918ebdbc913f1a875dfc3ebe5f068"

DERIV_WS_URL = f"wss://ws.derivws.com/websockets/v3?app_id={APP_ID}"


async def main():
    async with websockets.connect(DERIV_WS_URL) as ws:
        await ws.send(json.dumps({"authorize": API_TOKEN}))
        response = json.loads(await ws.recv())

        if "error" in response:
            print(f"AUTH FAILED: {response['error'].get('message')}")
            return

        auth = response.get("authorize", {})
        loginid = auth.get("loginid", "")
        balance = auth.get("balance")
        currency = auth.get("currency")
        is_virtual = auth.get("is_virtual")

        print(f"loginid:    {loginid}")
        print(f"is_virtual: {is_virtual}")
        print(f"balance:    {balance} {currency}")

        if not loginid.startswith("VRTC") or is_virtual != 1:
            print("\n>>> STOPPING: this is NOT a demo/virtual account. <<<")
            print(">>> No tick subscription or trade test will run. <<<")
            return

        print("\nConfirmed demo account. Safe to proceed with further testing.")


if __name__ == "__main__":
    asyncio.run(main())
