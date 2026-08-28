"""
QuantPesa Bot Engine - DerivTradingHooks
==========================================
Real implementation of TradingHooks (see interpreter.py) that connects
to Deriv's Options API (REST + OTP-based WebSocket, post-migration).
Runs the async WebSocket connection in a background thread with its
own event loop, exposing simple synchronous methods to the
interpreter -- the interpreter never needs to know async is happening
underneath.

Deriv Options API docs: https://developers.deriv.com/docs/options/websocket/

Confirmed flow (per Deriv docs, verified 2026-07-23):
  1. POST https://api.derivws.com/trading/v1/options/accounts/{account_id}/otp
     headers: Deriv-App-ID, Authorization: Bearer {PAT_TOKEN}
     -> returns {"data": {"url": "wss://.../ws/demo?otp=..."}}
  2. Connect directly to that URL. No further {"authorize": ...} message
     is required -- the OTP in the URL handles authentication.
"""

import asyncio
import json
import math
import threading
import time
import requests
import websockets

from interpreter import TradingHooks

DERIV_REST_BASE = "https://api.derivws.com"


class DerivTradingHooks(TradingHooks):
    def __init__(self, api_token: str, app_id: str, underlying_symbol: str, account_id: str,
                 api_base_url: str = None, internal_token: str = None,
                 bot_id: int = None, session_id: int = None):
        self.api_token = api_token
        self.app_id = app_id
        self.underlying_symbol = underlying_symbol
        self.account_id = account_id

        # Laravel-reporting credentials -- optional so DerivTradingHooks
        # can still be constructed/tested without them, but required in
        # practice for contract-opened persistence to work.
        self.api_base_url = api_base_url
        self.internal_token = internal_token
        self.bot_id = bot_id
        self.session_id = session_id

        self._request_id = 0
        self._pending = {}          # req_id -> queue.Queue for that request's response
        self._latest_ticks = []     # rolling buffer of (quote, pip_size) tuples
        self._last_pip_size = None  # most recently known pip_size for this symbol     # rolling buffer of recent tick quotes
        self._total_profit = 0.0
        self._last_contract_result = None
        self._ready = threading.Event()
        self._loop = None
        self._ws = None
        self._stop_flag = threading.Event()
        self._main_task = None
        self._connection_failed = False
        self._connection_error = None

        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()
        self._ready.wait(timeout=15)  # block __init__ until connected

    # ---------- REST step: exchange PAT token for an OTP-embedded WS URL ----------

    def _fetch_otp_ws_url(self) -> str:
        """
        POST to the confirmed OTP endpoint with the PAT token as a
        Bearer header. Returns data.url -- a wss:// URL with the OTP
        already embedded as a query param. No request body needed.
        """
        url = f"{DERIV_REST_BASE}/trading/v1/options/accounts/{self.account_id}/otp"
        headers = {
            "Deriv-App-ID": self.app_id,
            "Authorization": f"Bearer {self.api_token}",
        }
        response = requests.post(url, headers=headers, timeout=10)
        response.raise_for_status()
        body = response.json()
        return body["data"]["url"]

    def _report_contract_opened(self, contract_type: str, stake: float, prediction,
                                 contract_id: str) -> None:
        """
        Best-effort persistence of an opened contract to Laravel, called
        right after Deriv confirms the buy but BEFORE awaiting settlement.
        If this process crashes during the in-flight window, the next
        bot_runner.py startup can find this row (status='open') and poll
        Deriv directly for the true outcome instead of guessing a loss.
        Swallows all exceptions -- a reporting failure here should never
        block the actual trade from proceeding.
        """
        if not (self.api_base_url and self.internal_token and self.bot_id and self.session_id):
            self.log("[warn] contract-opened reporting skipped -- missing Laravel credentials")
            return
        try:
            url = f"{self.api_base_url}/api/internal/bots/{self.bot_id}/contract-opened"
            headers = {"Authorization": f"Bearer {self.internal_token}"}
            payload = {
                "session_id": self.session_id,
                "symbol": self.underlying_symbol,
                "contract_type": contract_type,
                "stake": round(stake, 2),
                "duration_ticks": 1,
                "barrier": str(prediction) if prediction is not None else None,
                "broker_contract_id": str(contract_id),
            }
            response = requests.post(url, headers=headers, json=payload, timeout=15)
            if not response.ok:
                self.log(f"[warn] contract-opened reporting failed "
                         f"({response.status_code}): {response.text}")
        except Exception as e:
            self.log(f"[warn] exception while reporting contract-opened: {e}")

    def _report_heartbeat(self, status: str, symbol: str = None, reason: str = None) -> None:
        """
        Best-effort connection status update to Laravel. Called once on
        successful connect and once on clean disconnect, so
        accounts.connection_status/last_heartbeat_at reflect reality
        instead of staying permanently stale.
        """
        if not (self.api_base_url and self.internal_token and self.bot_id):
            return
        try:
            url = f"{self.api_base_url}/api/internal/bots/{self.bot_id}/heartbeat"
            headers = {"Authorization": f"Bearer {self.internal_token}"}
            payload = {"status": status}
            if symbol:
                payload["symbol"] = symbol
            if reason:
                payload["reason"] = reason
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            if not response.ok:
                self.log(f"[warn] heartbeat reporting failed ({response.status_code}): {response.text}")
        except Exception as e:
            self.log(f"[warn] exception while reporting heartbeat: {e}")

    # ---------- thread / event loop management ----------

    def _run_event_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._main())
        except asyncio.CancelledError:
            # Expected on graceful shutdown via close() -- the main task
            # was cancelled on purpose, this isn't an error.
            pass
        except Exception as e:
            # Connection/auth failure (e.g. expired token -> 401 on the
            # OTP fetch). Mark the hooks as dead instead of letting the
            # loop close silently -- place_purchase() and close() both
            # check this flag before touching self._loop again.
            self._connection_failed = True
            self._connection_error = str(e)
            self.log(f"[error] event loop failed to start/run: {e}")
            # Unblock __init__'s self._ready.wait() -- otherwise a failure
            # before _ready.set() in _main() leaves the constructor
            # blocked for the full 15s timeout instead of failing fast.
            self._ready.set()
        finally:
            self._loop.close()

    async def _main(self):
        self._main_task = asyncio.current_task()

        # REST POST is synchronous and happens before the WS connect --
        # fine to call from here since we're at the top of _main().
        ws_url = self._fetch_otp_ws_url()

        async with websockets.connect(ws_url) as ws:
            self._ws = ws
            # No {"authorize": token} message needed -- the OTP
            # embedded in ws_url already authenticates this session,
            # per Deriv's docs. We go straight to subscribing.
            self._ready.set()
            self.log(f"Connected via OTP WebSocket for account {self.account_id}")
            self._report_heartbeat("connected", symbol=self.underlying_symbol)

            await self._send({"ticks": self.underlying_symbol, "subscribe": 1})

            async for raw_message in ws:
                if self._stop_flag.is_set():
                    break
                await self._handle_message(json.loads(raw_message))

    async def _send(self, payload: dict) -> int:
        self._request_id += 1
        req_id = self._request_id
        payload["req_id"] = req_id
        self._pending[req_id] = self._loop.create_future()
        await self._ws.send(json.dumps(payload))
        return req_id

    async def _handle_message(self, msg: dict):
        msg_type = msg.get("msg_type")

        if msg_type == "tick":
            tick = msg["tick"]
            quote = tick["quote"]
            pip_size = tick.get("pip_size", self._last_pip_size)
            if pip_size is not None:
                self._last_pip_size = pip_size
            self._latest_ticks.append((quote, pip_size))
            if len(self._latest_ticks) > 50:
                self._latest_ticks.pop(0)

        elif msg_type == "buy":
            req_id = msg.get("req_id")
            if req_id in self._pending and not self._pending[req_id].done():
                self._pending[req_id].set_result(msg)

        elif msg_type == "proposal_open_contract":
            contract = msg.get("proposal_open_contract", {})
            req_id = msg.get("req_id")
            if contract.get("is_sold") and req_id in self._pending and not self._pending[req_id].done():
                self._pending[req_id].set_result(msg)

        elif msg_type == "error":
            req_id = msg.get("req_id")
            self.log(f"[error] {msg['error'].get('message')}")
            if req_id in self._pending and not self._pending[req_id].done():
                self._pending[req_id].set_result(msg)

    # ---------- synchronous public interface (called by the interpreter) ----------

    def get_last_digit(self) -> int:
        if not self._latest_ticks:
            return 0
        quote, pip_size = self._latest_ticks[-1]
        if pip_size is None:
            # No pip_size ever received for this symbol -- we cannot safely
            # infer decimal precision. Log loudly rather than guessing at
            # a fixed decimal count, since a wrong guess produces a wrong
            # digit silently, which is worse than a visible failure.
            self.log(f"[warn] get_last_digit: no pip_size known for "
                     f"{self.underlying_symbol}, cannot extract digit safely")
            return 0
        decimals = max(0, -int(round(math.log10(pip_size))))
        quote_str = f"{quote:.{decimals}f}"
        return int(quote_str[-1])

    def get_tick_n_ago(self, n: int) -> float:
        if len(self._latest_ticks) < n:
            return 0.0
        return self._latest_ticks[-n][0]

    def get_total_profit(self) -> float:
        return self._total_profit

    def get_last_contract_result(self) -> str:
        return self._last_contract_result

    @property
    def connection_failed(self) -> bool:
        """
        True if the WebSocket/OTP handshake failed during startup (e.g.
        expired token -> 401) or the event loop otherwise died before
        _ready was set. bot_runner.py checks this immediately after
        construction, before entering the trade loop.
        """
        return self._connection_failed

    @property
    def connection_error(self) -> str | None:
        """Human-readable reason connection_failed is True, if it is. None otherwise."""
        return self._connection_error

    def place_purchase(self, contract_type: str, stake: float, prediction) -> dict:
        """
        Blocking call from the interpreter's perspective -- internally
        schedules the async buy+settle-wait on the background loop and
        waits for the result.
        """
        if self._connection_failed or self._loop is None or self._loop.is_closed():
            raise ConnectionError(
                f"Cannot place purchase -- WebSocket connection is not "
                f"available (reason: {self._connection_error or 'loop closed'})"
            )
        future = asyncio.run_coroutine_threadsafe(
            self._buy_and_wait(contract_type, stake, prediction), self._loop
        )
        return future.result(timeout=60)

    async def _buy_and_wait(self, contract_type: str, stake: float, prediction) -> dict:
        # Deriv rejects prices with more than 2 decimal places. Martingale
        # multipliers (e.g. x1.8) produce float drift like 1.1340000000000001,
        # so round-and-format right at the API boundary rather than touching
        # the interpreter's general math.
        rounded_stake = round(stake, 2)
        parameters = {
            "amount": rounded_stake,
            "basis": "stake",
            "contract_type": contract_type,
            "currency": "USD",
            "duration": 1,
            "duration_unit": "t",
            "underlying_symbol": self.underlying_symbol,
        }
        if prediction is not None:
            parameters["barrier"] = str(prediction)

        req_id = await self._send({"buy": 1, "price": rounded_stake, "parameters": parameters})
        try:
            buy_response = await asyncio.wait_for(self._pending[req_id], timeout=30)
        except asyncio.TimeoutError:
            self.log(f"Buy request timed out waiting for response (req_id={req_id})")
            return {"result": "loss", "payout": 0, "stake": stake}

        if "error" in buy_response:
            self.log(f"Buy failed: {buy_response['error'].get('message')}")
            return {"result": "loss", "payout": 0, "stake": stake}

        contract_id = buy_response["buy"]["contract_id"]

        # Persist BEFORE awaiting settlement -- this is the in-flight
        # window where a crash would otherwise be unrecoverable.
        self._report_contract_opened(contract_type, stake, prediction, contract_id)

        settle_req_id = await self._send({
            "proposal_open_contract": 1,
            "contract_id": contract_id,
            "subscribe": 1,
        })
        try:
            settled = await asyncio.wait_for(self._pending[settle_req_id], timeout=60)
        except asyncio.TimeoutError:
            self.log(f"Settle wait timed out for contract_id={contract_id}")
            return {"result": "loss", "payout": 0, "stake": stake, "contract_id": contract_id}
        contract = settled.get("proposal_open_contract", {})

        profit = float(contract.get("profit", 0))
        payout = float(contract.get("payout", 0))
        result = "win" if profit > 0 else "loss"

        self._total_profit += profit
        self._last_contract_result = result

        self.log(f"Contract settled: id={contract_id} result={result} "
                 f"profit={profit:.2f} total_profit={self._total_profit:.2f}")

        return {"result": result, "payout": payout, "stake": stake, "contract_id": contract_id}

    def close(self):
        self._stop_flag.set()
        if self._loop and self._main_task and not self._loop.is_closed():
            try:
                self._loop.call_soon_threadsafe(self._main_task.cancel)
            except RuntimeError:
                # Loop closed between the check above and this call --
                # benign race, nothing left to cancel.
                pass
        if self._thread.is_alive():
            self._thread.join(timeout=10)
        self._report_heartbeat(
            "disconnected",
            symbol=self.underlying_symbol,
            reason=self._connection_error if self._connection_failed else None,
        )