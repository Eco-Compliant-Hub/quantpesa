"""
QuantPesa Bot Engine - Layer 2: Generic AST Interpreter
==========================================================
Walks the generic JSON tree produced by Layer 1 (xml_parser.py) and
executes it. Strategy-agnostic: evaluates whatever block tree it is
given. External trading actions are delegated to a TradingHooks
object so this can be tested against a simulated market or wired to
the real Deriv WebSocket API without changing interpreter code.
"""

from typing import Any, Optional
import random


class TradingHooks:
    def get_last_digit(self) -> int:
        raise NotImplementedError

    def get_tick_n_ago(self, n: int) -> float:
        raise NotImplementedError

    def get_total_profit(self) -> float:
        raise NotImplementedError

    def place_purchase(self, contract_type: str, stake: float, prediction):
        raise NotImplementedError

    def get_last_contract_result(self) -> str:
        raise NotImplementedError

    def log(self, message: str) -> None:
        print(f"[bot] {message}")


class BotInterpreter:
    def __init__(self, ast: dict, hooks: TradingHooks):
        self.ast = ast
        self.hooks = hooks
        self.scope = {}
        self.procedures = {}
        self._trade_again_requested = False

        for proc in ast.get("top_level_blocks", {}).get("procedures", []):
            name = self._get_field(proc, "NAME")
            if name:
                self.procedures[name] = proc

    def run_initialization(self):
        trade_def = self.ast["top_level_blocks"].get("trade_definition")
        if not trade_def:
            return
        init_stack = trade_def.get("statements", {}).get("INITIALIZATION", [])
        for node in init_stack:
            self._exec(node)

    def run_before_purchase(self):
        bp = self.ast["top_level_blocks"].get("before_purchase")
        if not bp:
            return
        for node in bp.get("statements", {}).get("BEFOREPURCHASE_STACK", []):
            self._exec(node)

    def run_after_purchase(self):
        self._trade_again_requested = False
        ap = self.ast["top_level_blocks"].get("after_purchase")
        if not ap:
            return
        for node in ap.get("statements", {}).get("AFTERPURCHASE_STACK", []):
            self._exec(node)
        return self._trade_again_requested

    def get_trade_amount_and_prediction(self):
        trade_def = self.ast["top_level_blocks"].get("trade_definition")
        options_block = self._find_block_type(trade_def, "trade_definition_tradeoptions")
        if not options_block:
            return None, None
        amount = self._eval(options_block.get("values", {}).get("AMOUNT")) if options_block.get("values", {}).get("AMOUNT") else None
        prediction = None
        if "PREDICTION" in options_block.get("values", {}):
            prediction = self._eval(options_block["values"]["PREDICTION"])
        return amount, prediction

    def _exec(self, node):
        if node is None:
            return
        block_type = node.get("block_type")
        method = getattr(self, f"_stmt_{block_type}", None)
        if method:
            method(node)
        else:
            self.hooks.log(f"[warn] no statement handler for block_type='{block_type}', skipping")

    def _eval(self, node):
        if node is None:
            return None
        block_type = node.get("block_type")
        method = getattr(self, f"_eval_{block_type}", None)
        if method:
            return method(node)
        self.hooks.log(f"[warn] no eval handler for block_type='{block_type}', returning None")
        return None

    def _get_field(self, node, field_name):
        for f in node.get("fields", []):
            if f["name"] == field_name:
                return f["value"]
        return None

    def _find_block_type(self, node, target_type):
        if node is None:
            return None
        if node.get("block_type") == target_type:
            return node
        for stack in node.get("statements", {}).values():
            for child in stack:
                found = self._find_block_type(child, target_type)
                if found:
                    return found
        for value in node.get("values", {}).values():
            found = self._find_block_type(value, target_type)
            if found:
                return found
        return None

    def _stmt_variables_set(self, node):
        var_name = self._get_field(node, "VAR")
        value = self._eval(node.get("values", {}).get("VALUE"))
        self.scope[var_name] = value

    def _stmt_math_change(self, node):
        var_name = self._get_field(node, "VAR")
        delta = self._eval(node.get("values", {}).get("DELTA"))
        self.scope[var_name] = (self.scope.get(var_name) or 0) + (delta or 0)

    def _stmt_controls_if(self, node):
        values = node.get("values", {})
        statements = node.get("statements", {})
        i = 0
        while f"IF{i}" in values:
            condition = self._eval(values[f"IF{i}"])
            if condition:
                for stmt in statements.get(f"DO{i}", []):
                    self._exec(stmt)
                return
            i += 1
        if "ELSE" in statements:
            for stmt in statements["ELSE"]:
                self._exec(stmt)

    def _stmt_purchase(self, node):
        contract_type = self._get_field(node, "PURCHASE_LIST")
        amount, prediction = self.get_trade_amount_and_prediction()
        stake = amount if amount is not None else self.scope.get("Stake", 1)
        self.hooks.log(f"PURCHASE requested: type={contract_type} stake={stake} prediction={prediction}")
        result = self.hooks.place_purchase(contract_type, stake, prediction)
        result["contract_type"] = contract_type
        self.scope["__last_trade_result__"] = result

    def _stmt_trade_again(self, node):
        self._trade_again_requested = True

    def _stmt_notify(self, node):
        msg = self._eval(node.get("values", {}).get("MESSAGE"))
        ntype = self._get_field(node, "NOTIFICATION_TYPE")
        self.hooks.log(f"[notify:{ntype}] {msg}")

    def _stmt_text_print(self, node):
        msg = self._eval(node.get("values", {}).get("TEXT"))
        self.hooks.log(f"[print] {msg}")

    def _stmt_text_join(self, node):
        var_name = self._get_field(node, "VARIABLE")
        parts = []
        for stmt in node.get("statements", {}).get("STACK", []):
            val = self._eval(stmt.get("values", {}).get("TEXT"))
            parts.append("" if val is None else str(val))
        self.scope[var_name] = "".join(parts)

    def _stmt_lists_create_with(self, node):
        var_name = self._get_field(node, "VARIABLE")
        self.scope[var_name] = []

    def _stmt_procedures_defnoreturn(self, node):
        pass

    def _stmt_procedures_callnoreturn(self, node):
        name = node.get("mutation", {}).get("name") or self._get_field(node, "NAME")
        proc = self.procedures.get(name)
        if proc:
            for stmt in proc.get("statements", {}).get("STACK", []):
                self._exec(stmt)

    def _eval_math_number(self, node):
        val = self._get_field(node, "NUM")
        try:
            return float(val) if "." in val else int(val)
        except (TypeError, ValueError):
            return None

    def _eval_variables_get(self, node):
        var_name = self._get_field(node, "VAR")
        return self.scope.get(var_name)

    def _eval_math_arithmetic(self, node):
        op = self._get_field(node, "OP")
        a = self._eval(node.get("values", {}).get("A"))
        b = self._eval(node.get("values", {}).get("B"))
        if a is None or b is None:
            return None
        return {
            "ADD": a + b,
            "MINUS": a - b,
            "MULTIPLY": a * b,
            "DIVIDE": a / b if b != 0 else None,
            "POWER": a ** b,
        }.get(op)

    def _eval_math_single(self, node):
        op = self._get_field(node, "OP")
        num = self._eval(node.get("values", {}).get("NUM"))
        if num is None:
            return None
        return {"ABS": abs(num), "NEG": -num, "SQRT": num ** 0.5}.get(op, num)

    def _eval_math_random_int(self, node):
        low = self._eval(node.get("values", {}).get("FROM")) or 0
        high = self._eval(node.get("values", {}).get("TO")) or 0
        return random.randint(int(low), int(high))

    def _eval_math_number_property(self, node):
        prop = self._get_field(node, "PROPERTY")
        num = self._eval(node.get("values", {}).get("NUMBER_TO_CHECK"))
        if num is None:
            return None
        return {"NEGATIVE": num < 0, "POSITIVE": num > 0, "EVEN": num % 2 == 0, "ODD": num % 2 != 0}.get(prop)

    def _eval_logic_compare(self, node):
        op = self._get_field(node, "OP")
        a = self._eval(node.get("values", {}).get("A"))
        b = self._eval(node.get("values", {}).get("B"))
        if a is None or b is None:
            return False
        return {
            "EQ": a == b, "NEQ": a != b,
            "LT": a < b, "LTE": a <= b,
            "GT": a > b, "GTE": a >= b,
        }.get(op, False)

    def _eval_logic_operation(self, node):
        op = self._get_field(node, "OP")
        a = self._eval(node.get("values", {}).get("A"))
        b = self._eval(node.get("values", {}).get("B"))
        return (a and b) if op == "AND" else (a or b)

    def _eval_logic_boolean(self, node):
        return self._get_field(node, "BOOL") == "TRUE"

    def _eval_logic_ternary(self, node):
        cond = self._eval(node.get("values", {}).get("IF"))
        return self._eval(node.get("values", {}).get("THEN")) if cond else self._eval(node.get("values", {}).get("ELSE"))

    def _eval_text(self, node):
        return self._get_field(node, "TEXT")

    def _eval_lists_getIndex(self, node):
        list_val = self._eval(node.get("values", {}).get("VALUE")) or []
        idx = self._eval(node.get("values", {}).get("AT"))
        where = self._get_field(node, "WHERE") or "FROM_START"
        if idx is None:
            return None
        try:
            if where == "FROM_START":
                return list_val[int(idx) - 1]
            elif where == "FROM_END":
                return list_val[-int(idx)]
        except (IndexError, TypeError):
            return None
        return None

    def _eval_total_profit(self, node):
        return self.hooks.get_total_profit()

    def _eval_contract_check_result(self, node):
        expected = self._get_field(node, "CHECK_RESULT")
        return self.hooks.get_last_contract_result() == expected

    def _eval_last_digit(self, node):
        return self.hooks.get_last_digit()

    def _eval_read_details(self, node):
        result = self.scope.get("__last_trade_result__", {})
        return result.get("stake", 0)
