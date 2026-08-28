"""
QuantPesa Bot Engine - bot_runner.py
=====================================
Entry point invoked by LaunchBotJob.php as a subprocess. Fetches the
bot's parsed AST + config from the internal API, wires up
DerivTradingHooks, and drives the BotInterpreter through a
purchase/settle loop until the bot stops requesting "trade again" or
an unrecoverable error occurs.

Invoked as:
  python bot_runner.py \
      --bot-id <int> --session-id <int> --symbol <str> \
      --api-token <str> --app-id <str> --broker-account-id <str> \
      --is-virtual <0|1> --internal-token <str> --api-base-url <str>

NOTE:
  - contract_type is read per-trade from the interpreter's result
    (result["contract_type"], set in interpreter.py's _stmt_purchase),
    NOT from bot_configurations. This is by design: XML-uploaded bots
    don't have a config row, since the contract type is decided
    dynamically inside the AST's purchase block(s) and can differ
    trade to trade. Requires the one-line addition to
    interpreter.py's _stmt_purchase (see project notes).
  - symbol still has no confirmed source for XML-uploaded bots (no
    column for it exists on user_bots or elsewhere). For now it's
    passed manually via --symbol at the CLI. Flagged as an open
    follow-up: XML-uploaded bots likely need a symbol column on
    user_bots, chosen by the user at upload/start time.
  - duration_ticks is hardcoded to 1 here because deriv_hooks.py's
    _buy_and_wait() currently hardcodes duration=1/duration_unit="t".
    If that ever becomes configurable, this needs to change alongside it.
  - Graceful stop-signal handling is implemented: the loop polls
    control_command each iteration via check_control_command() and
    exits cleanly on "stop". It also honors "pause" by holding in
    place (see the pause-wait block in main()) until control_command
    changes to "none" (resume) or "stop".
"""

import argparse
import asyncio
import json
import sys
import time
import traceback

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import requests
import websockets

from interpreter import BotInterpreter
from deriv_hooks import DerivTradingHooks

DURATION_TICKS = 1  # matches deriv_hooks.py's hardcoded duration=1, duration_unit="t"

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bot-id", type=int, required=True)
    parser.add_argument("--session-id", type=int, required=True)
    parser.add_argument("--symbol", type=str, required=True)
    parser.add_argument("--api-token", type=str, required=True)
    parser.add_argument("--app-id", type=str, required=True)
    parser.add_argument("--broker-account-id", type=str, required=True)
    parser.add_argument("--is-virtual", type=str, required=True)
    parser.add_argument("--internal-token", type=str, required=True)
    parser.add_argument("--api-base-url", type=str, required=True)
    parser.add_argument("--max-iterations", type=int, default=10,
                         help="Hard safety cap on purchase cycles, independent of "
                              "the bot's own stop-loss/take-profit logic. Prevents "
                              "unsupervised runaway loops during testing.")
    return parser.parse_args()


def fetch_runtime_data(api_base_url: str, internal_token: str, bot_id: int) -> dict:
    url = f"{api_base_url}/api/internal/bots/{bot_id}/runtime-data"
    headers = {"Authorization": f"Bearer {internal_token}"}
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    body = response.json()
    if not body.get("success"):
        raise RuntimeError(f"runtime-data returned success=false: {body.get('message')}")
    return body["data"]


def check_control_command(api_base_url: str, internal_token: str, session_id: int) -> str:
    """
    Polls bot_sessions.control_command once per trade-loop iteration so
    the bot can notice a stop request (set by BotController::stop())
    and exit gracefully between trades. Best-effort: any failure to
    check just returns 'none', so a transient network issue never
    accidentally halts a trade loop.
    """
    url = f"{api_base_url}/api/internal/bots/session/{session_id}/control"
    headers = {"Authorization": f"Bearer {internal_token}"}
    try:
        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
        body = response.json()
        return body.get("data", {}).get("control_command", "none")
    except Exception as e:
        print(f"[bot_runner] WARNING: failed to check control_command: {e}", file=sys.stderr)
        return "none"


def report_trade_result(api_base_url: str, internal_token: str, bot_id: int, payload: dict) -> None:
    url = f"{api_base_url}/api/internal/bots/{bot_id}/trade-result"
    headers = {"Authorization": f"Bearer {internal_token}"}
    response = requests.post(url, headers=headers, json=payload, timeout=15)
    if not response.ok:
        print(f"[bot_runner] WARNING: trade-result reporting failed "
              f"({response.status_code}): {response.text}", file=sys.stderr)

def fetch_open_orders(api_base_url: str, internal_token: str, bot_id: int) -> list:
    url = f"{api_base_url}/api/internal/bots/{bot_id}/open-orders"
    headers = {"Authorization": f"Bearer {internal_token}"}
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    body = response.json()
    if not body.get("success"):
        raise RuntimeError(f"open-orders returned success=false: {body.get('message')}")
    return body["data"]


def reconcile_open_orders(api_base_url: str, internal_token: str, bot_id: int,
                           api_token: str, app_id: str, account_id: str) -> None:
    """
    Startup safety check: find any orders left in status='open' from a
    previous run that crashed mid-flight (bought but never settled),
    poll Deriv directly for each contract's TRUE outcome, and report
    the corrected result -- instead of leaving a phantom 'open' row or
    letting a stale guess stand.
    """
    try:
        open_orders = fetch_open_orders(api_base_url, internal_token, bot_id)
    except Exception as e:
        print(f"[bot_runner] WARNING: failed to fetch open-orders for reconciliation: {e}",
              file=sys.stderr)
        return

    if not open_orders:
        return

    print(f"[bot_runner] Found {len(open_orders)} orphaned open order(s) from a previous "
          f"run -- reconciling with Deriv before starting.", file=sys.stderr)

    otp_url = f"https://api.derivws.com/trading/v1/options/accounts/{account_id}/otp"
    otp_headers = {"Deriv-App-ID": app_id, "Authorization": f"Bearer {api_token}"}
    otp_response = requests.post(otp_url, headers=otp_headers, timeout=10)
    otp_response.raise_for_status()
    ws_url = otp_response.json()["data"]["url"]

    async def _poll_all():
        async with websockets.connect(ws_url) as ws:
            for order in open_orders:
                contract_id = order["broker_contract_id"]
                req_id = 1
                await ws.send(json.dumps({
                    "proposal_open_contract": 1,
                    "contract_id": contract_id,
                    "req_id": req_id,
                }))
                while True:
                    raw = await asyncio.wait_for(ws.recv(), timeout=30)
                    msg = json.loads(raw)
                    if msg.get("msg_type") != "proposal_open_contract":
                        continue
                    contract = msg.get("proposal_open_contract", {})
                    if not contract.get("is_sold"):
                        continue
                    profit = float(contract.get("profit", 0))
                    payout = float(contract.get("payout", 0))
                    result = "won" if profit > 0 else "lost"
                    report_trade_result(api_base_url, internal_token, bot_id, {
                        "session_id": order["bot_session_id"],
                        "symbol": order.get("symbol", ""),
                        "contract_type": order.get("contract_type", ""),
                        "stake": order["stake"],
                        "duration_ticks": order["duration_ticks"],
                        "barrier": order.get("barrier"),
                        "status": result,
                        "payout": payout,
                        "broker_contract_id": contract_id,
                    })
                    print(f"[bot_runner] Reconciled orphaned contract {contract_id}: "
                          f"true result={result} profit={profit:.2f}", file=sys.stderr)
                    break

    try:
        asyncio.run(_poll_all())
    except Exception as e:
        print(f"[bot_runner] WARNING: reconciliation failed: {e}", file=sys.stderr)

def report_session_end(api_base_url: str, internal_token: str, bot_id: int, session_id: int,
                        status: str, reason: str = None) -> None:
    """
    Notify Laravel that this bot session has ended.
    status must be 'stopped' or 'error'.
    Best-effort: swallow all exceptions so a reporting failure never
    masks the original exit reason or crashes the process on the way out.
    """
    try:
        url = f"{api_base_url}/api/internal/bots/{bot_id}/session-end"
        headers = {"Authorization": f"Bearer {internal_token}"}
        reason_text = reason or "process_exited"
        if len(reason_text) > 240:
            reason_text = reason_text[:237] + "..."
        payload = {
            "session_id": session_id,
            "status": status,
            "reason": reason_text,
        }
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        if not response.ok:
            print(f"[bot_runner] WARNING: session-end reporting failed "
                  f"({response.status_code}): {response.text}", file=sys.stderr)
        else:
            print(f"[bot_runner] session-end reported: status={status} reason={reason}", file=sys.stderr)
    except Exception as e:
        print(f"[bot_runner] WARNING: exception while reporting session-end: {e}", file=sys.stderr)

def map_result_to_status(result: str) -> str:
    return {"win": "won", "loss": "lost"}.get(result, "open")


def main():
    args = parse_args()

    print(f"[bot_runner] Starting bot_id={args.bot_id} session_id={args.session_id} "
          f"symbol={args.symbol} broker_account_id={args.broker_account_id} "
          f"is_virtual={args.is_virtual}")

    reconcile_open_orders(args.api_base_url, args.internal_token, args.bot_id,
                           args.api_token, args.app_id, args.broker_account_id)

    runtime_data = fetch_runtime_data(args.api_base_url, args.internal_token, args.bot_id)

    ast = runtime_data["parsed_ast"]
    symbol = runtime_data.get("symbol") or args.symbol

    if not ast:
        print("[bot_runner] ERROR: no parsed_ast returned, cannot run.", file=sys.stderr)
        sys.exit(1)

    # NOTE: contract_type is intentionally NOT pulled from bot_configurations
    # here. XML-uploaded bots don't have a config row by design -- the
    # contract type is decided dynamically inside the AST's purchase
    # block(s), which can differ trade to trade (e.g. multiple controls_if
    # branches each with their own PURCHASE_LIST value). It's read per-trade
    # from the interpreter's result below instead.

    hooks = DerivTradingHooks(
        api_token=args.api_token,
        app_id=args.app_id,
        underlying_symbol=symbol,
        account_id=args.broker_account_id,
        api_base_url=args.api_base_url,
        internal_token=args.internal_token,
        bot_id=args.bot_id,
        session_id=args.session_id,
    )

    session_status = "stopped"
    session_reason = "unknown"

    # Fail fast if the WebSocket/OTP handshake never succeeded (e.g.
    # expired token -> 401), instead of entering the trade loop and
    # letting place_purchase() discover a dead connection mid-flight.
    if hooks.connection_failed:
        print(f"[bot_runner] ERROR: connection failed during startup: "
              f"{hooks._connection_error}", file=sys.stderr)
        report_session_end(args.api_base_url, args.internal_token, args.bot_id,
                            args.session_id, "error",
                            f"connection_failed: {hooks._connection_error}")
        hooks.close()
        sys.exit(1)

    interpreter = BotInterpreter(ast, hooks)

    try:
        interpreter.run_initialization()

        iteration = 0
        while True:
            iteration += 1

            control_command = check_control_command(args.api_base_url, args.internal_token, args.session_id)

            if control_command == "stop":
                print("[bot_runner] Received stop command -- stopping gracefully.", file=sys.stderr)
                session_status = "stopped"
                session_reason = "user_requested"
                break

            if control_command == "pause":
                print("[bot_runner] Received pause command -- holding before next trade.", file=sys.stderr)
                while True:
                    time.sleep(2)  # avoid hammering the internal API while idle
                    control_command = check_control_command(args.api_base_url, args.internal_token, args.session_id)
                    if control_command == "stop":
                        print("[bot_runner] Received stop command while paused -- stopping gracefully.", file=sys.stderr)
                        session_status = "stopped"
                        session_reason = "user_requested"
                        break
                    if control_command == "none":
                        print("[bot_runner] Received resume -- continuing trade loop.", file=sys.stderr)
                        break
                if session_status == "stopped":
                    break

            if iteration > args.max_iterations:
                print(f"[bot_runner] SAFETY STOP: reached --max-iterations "
                      f"({args.max_iterations}) -- stopping regardless of the "
                      f"bot's own trade_again logic. Investigate before raising this.",
                      file=sys.stderr)
                session_status = "stopped"
                session_reason = "max_iterations_reached"
                break

            amount, prediction = interpreter.get_trade_amount_and_prediction()
            print(f"[bot_runner] iteration={iteration} next_stake={amount} "
                  f"total_profit_so_far={hooks.get_total_profit():.2f}", file=sys.stderr)

            interpreter.run_before_purchase()

            result = interpreter.scope.get("__last_trade_result__")

            if result:
                trade_contract_type = result.get("contract_type")
                if not trade_contract_type:
                    print("[bot_runner] WARNING: trade result missing contract_type "
                          "-- interpreter.py's _stmt_purchase() may not have the "
                          "result['contract_type'] = contract_type line added.",
                          file=sys.stderr)
                report_trade_result(args.api_base_url, args.internal_token, args.bot_id, {
                    "session_id": args.session_id,
                    "symbol": symbol,
                    "contract_type": trade_contract_type,
                    "stake": result.get("stake"),
                    "duration_ticks": DURATION_TICKS,
                    "barrier": str(prediction) if prediction is not None else None,
                    "status": map_result_to_status(result.get("result")),
                    "payout": result.get("payout"),
                    "broker_contract_id": str(result.get("contract_id")) if result.get("contract_id") else None,
                })
            else:
                print("[bot_runner] WARNING: no trade result found after run_before_purchase() "
                      "-- bot's BEFOREPURCHASE_STACK may not contain a purchase block.",
                      file=sys.stderr)

            trade_again = interpreter.run_after_purchase()

            if not trade_again:
                print("[bot_runner] Bot did not request trade_again -- stopping.")
                session_status = "stopped"
                session_reason = "trade_again_false"
                break

    except Exception as e:
        print("[bot_runner] ERROR: unhandled exception during run loop:", file=sys.stderr)
        traceback.print_exc()
        session_status = "error"
        session_reason = f"exception: {type(e).__name__}"

    finally:
        hooks.close()

    report_session_end(args.api_base_url, args.internal_token, args.bot_id,
                        args.session_id, session_status, session_reason)

    if session_status == "error":
        sys.exit(1)
    


if __name__ == "__main__":
    main()