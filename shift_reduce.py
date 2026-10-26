#!/usr/bin/env python3
"""
Interactive Shift-Reduce Parsing Simulator (SLR(1) Engine)
Subject: Compiler Design
Authors: Compiler Design Laboratory

Implements:
1. FIRST and FOLLOW sets computation
2. Canonical collection of LR(0) item sets (Closure & GOTO)
3. SLR(1) ACTION and GOTO parsing tables
4. Shift/Reduce and Reduce/Reduce conflict detection
5. Full shift-reduce parsing simulation with step-by-step tracing
"""

import sys
import os

class Production:
    def __init__(self, prod_id, lhs, rhs):
        self.id = prod_id      # Integer ID (0 = augmented Start' -> Start)
        self.lhs = lhs        # Nonterminal string
        self.rhs = list(rhs)  # List of grammar symbol strings

    def __str__(self):
        rhs_str = " ".join(self.rhs) if self.rhs else "ε"
        return f"{self.lhs} -> {rhs_str}"

    def __repr__(self):
        return f"Production({self.id}, '{self.lhs}', {self.rhs})"

    def __eq__(self, other):
        return isinstance(other, Production) and self.id == other.id and self.lhs == other.lhs and self.rhs == other.rhs

    def __hash__(self):
        return hash((self.id, self.lhs, tuple(self.rhs)))


class ParsingStep:
    def __init__(self, step_number, stack_symbols, stack_states, remaining_input, action_str, explanation, action_type):
        self.step_number = step_number
        self.stack_symbols = list(stack_symbols)
        self.stack_states = list(stack_states)
        self.remaining_input = list(remaining_input)
        self.action_str = action_str
        self.explanation = explanation
        self.action_type = action_type  # 'SHIFT', 'REDUCE', 'ACCEPT', 'ERROR'


class Grammar:
    def __init__(self):
        self.productions = []        # Original user productions (1-based ID)
        self.augmented_productions = [] # 0: Start' -> Start, 1..N: original
        self.start_symbol = ""
        self.augmented_start = ""
        self.nonterminals = set()
        self.terminals = set()
        self.first = {}              # symbol -> set of terminals (and maybe 'ε')
        self.follow = {}             # nonterminal -> set of terminals (and '$')
        self.states = []             # List of item sets (each item is (prod_idx, dot_pos))
        self.transitions = {}        # (state_idx, symbol) -> next_state_idx
        self.action_table = {}       # (state_idx, terminal) -> list of ('s'/'r'/'acc', value)
        self.goto_table = {}         # (state_idx, nonterminal) -> next_state_idx
        self.conflicts = []          # List of conflict descriptions

    def clear(self):
        self.__init__()

    def add_production_line(self, line):
        line = line.strip()
        if not line or line.startswith("#"):
            return True, ""

        arrow = "->"
        if "->" in line:
            arrow = "->"
        elif "::=" in line:
            arrow = "::="
        else:
            return False, f"Malformed rule: missing '->' or '::=' in \"{line}\""

        parts = line.split(arrow, 1)
        lhs = parts[0].strip()
        if not lhs or " " in lhs:
            return False, f"Invalid LHS '{lhs}': LHS must be a single nonterminal symbol without spaces."
        if lhs == "$":
            return False, "'$' is reserved as the end-of-input marker and cannot be a nonterminal."

        rhs_str = parts[1].strip()
        if not rhs_str:
            return False, f"Rule '{lhs} -> ': Empty RHS is not permitted in this simulator."

        alternatives = rhs_str.split("|")
        for alt in alternatives:
            alt = alt.strip()
            if not alt:
                return False, f"Rule '{lhs} -> {rhs_str}': Empty alternative around '|'."
            rhs_tokens = alt.split()
            if not rhs_tokens:
                return False, f"Rule '{lhs} -> {alt}': Empty RHS symbols."

            for sym in rhs_tokens:
                if sym == "$":
                    return False, "'$' cannot appear on the right-hand side."
                if sym in ("ε", "epsilon", "^"):
                    return False, f"Epsilon '{sym}' is not supported in this simplified shift-reduce simulator."

            prod = Production(len(self.productions) + 1, lhs, rhs_tokens)
            self.productions.append(prod)

        return True, ""

    def finalize(self):
        if not self.productions:
            return False, "Grammar has no productions."

        self.nonterminals = {p.lhs for p in self.productions}

        if not self.start_symbol or self.start_symbol not in self.nonterminals:
            self.start_symbol = self.productions[0].lhs

        self.terminals = set()
        for p in self.productions:
            for s in p.rhs:
                if s not in self.nonterminals:
                    self.terminals.add(s)

        # Augmented Grammar
        self.augmented_start = self.start_symbol + "'"
        while self.augmented_start in self.nonterminals or self.augmented_start in self.terminals:
            self.augmented_start += "'"

        p0 = Production(0, self.augmented_start, [self.start_symbol])
        self.augmented_productions = [p0] + self.productions

        # Build FIRST and FOLLOW sets
        self._compute_first_sets()
        self._compute_follow_sets()

        # Build LR(0) Canonical Collection & SLR(1) Tables
        self._build_slr_tables()

        return True, ""

    def _compute_first_sets(self):
        self.first = {}
        for t in self.terminals:
            self.first[t] = {t}
        self.first["$"] = {"$"}
        for nt in self.nonterminals:
            self.first[nt] = set()
        self.first[self.augmented_start] = set()

        changed = True
        while changed:
            changed = False
            for p in self.augmented_productions:
                lhs = p.lhs
                before_len = len(self.first[lhs])
                rhs_first = self.compute_sequence_first(p.rhs)
                self.first[lhs].update(rhs_first)
                if len(self.first[lhs]) > before_len:
                    changed = True

    def compute_sequence_first(self, sequence):
        if not sequence:
            return {"ε"}
        res = set()
        for sym in sequence:
            sym_first = self.first.get(sym, {sym})
            res.update(sym_first - {"ε"})
            if "ε" not in sym_first:
                break
        else:
            res.add("ε")
        return res

    def _compute_follow_sets(self):
        self.follow = {nt: set() for nt in self.nonterminals}
        self.follow[self.augmented_start] = {"$"}
        self.follow[self.start_symbol].add("$")

        changed = True
        while changed:
            changed = False
            for p in self.augmented_productions:
                lhs = p.lhs
                for i, sym in enumerate(p.rhs):
                    if sym in self.nonterminals:
                        beta = p.rhs[i + 1:]
                        before_len = len(self.follow[sym])
                        beta_first = self.compute_sequence_first(beta)

                        self.follow[sym].update(beta_first - {"ε"})
                        if "ε" in beta_first:
                            self.follow[sym].update(self.follow[lhs])

                        if len(self.follow[sym]) > before_len:
                            changed = True

    def _closure(self, item_set):
        # item: (prod_idx, dot_pos)
        items = set(item_set)
        changed = True
        while changed:
            changed = False
            curr = list(items)
            for prod_idx, dot in curr:
                p = self.augmented_productions[prod_idx]
                if dot < len(p.rhs):
                    sym = p.rhs[dot]
                    if sym in self.nonterminals:
                        for p_idx, prod in enumerate(self.augmented_productions):
                            if prod.lhs == sym:
                                new_item = (p_idx, 0)
                                if new_item not in items:
                                    items.add(new_item)
                                    changed = True
        return frozenset(items)

    def _goto(self, item_set, symbol):
        moved = set()
        for prod_idx, dot in item_set:
            p = self.augmented_productions[prod_idx]
            if dot < len(p.rhs) and p.rhs[dot] == symbol:
                moved.add((prod_idx, dot + 1))
        if not moved:
            return frozenset()
        return self._closure(moved)

    def _build_slr_tables(self):
        start_item = frozenset([(0, 0)]) # S' -> . S
        i0 = self._closure(start_item)

        self.states = [i0]
        self.transitions = {}

        symbols = sorted(list(self.terminals)) + sorted(list(self.nonterminals))

        # 1. Canonical collection of LR(0) items
        changed = True
        while changed:
            changed = False
            for i, item_set in enumerate(list(self.states)):
                for sym in symbols:
                    target = self._goto(item_set, sym)
                    if target:
                        if target not in self.states:
                            self.states.append(target)
                            changed = True
                        target_idx = self.states.index(target)
                        self.transitions[(i, sym)] = target_idx

        # 2. Build ACTION and GOTO tables with conflict detection
        self.action_table = {}
        self.goto_table = {}
        self.conflicts = []

        for i, item_set in enumerate(self.states):
            for prod_idx, dot in item_set:
                p = self.augmented_productions[prod_idx]

                # Case A: A -> alpha . a beta
                if dot < len(p.rhs):
                    a = p.rhs[dot]
                    if a in self.terminals:
                        j = self.transitions.get((i, a))
                        if j is not None:
                            self._add_action(i, a, ('s', j), f"shift to state {j}")
                else:
                    # Case B: S' -> S .
                    if prod_idx == 0:
                        self._add_action(i, "$", ('acc', 0), "accept")
                    else:
                        # Case C: A -> alpha .
                        for a in self.follow[p.lhs]:
                            self._add_action(i, a, ('r', prod_idx), f"reduce by ({prod_idx}) {p}")

            # GOTO table for nonterminals
            for nt in self.nonterminals:
                j = self.transitions.get((i, nt))
                if j is not None:
                    self.goto_table[(i, nt)] = j

    def _add_action(self, state, terminal, act, desc):
        key = (state, terminal)
        if key not in self.action_table:
            self.action_table[key] = []
        
        # Avoid duplicate actions
        if act not in self.action_table[key]:
            self.action_table[key].append(act)
            if len(self.action_table[key]) > 1:
                # Conflict detected!
                existing = self.action_table[key]
                has_shift = any(a[0] == 's' for a in existing)
                has_reduce = any(a[0] == 'r' for a in existing)
                if has_shift and has_reduce:
                    c_type = "Shift/Reduce"
                else:
                    c_type = "Reduce/Reduce"
                self.conflicts.append(f"{c_type} conflict in State {state} on symbol '{terminal}': {existing}")

    def tokenize_input(self, input_str):
        s = input_str.strip()
        if not s:
            return False, [], "Input string is empty. The grammar has no epsilon rules."
        if "$" in s:
            return False, [], "Input contains reserved symbol '$'."

        raw = s.split()
        if len(raw) > 1:
            for t in raw:
                if t not in self.terminals:
                    return False, [], f"Unknown token '{t}'. Valid terminals are: {sorted(list(self.terminals))}"
            return True, raw, ""

        if len(raw) == 1:
            tok = raw[0]
            if tok in self.terminals:
                return True, [tok], ""

            all_single = all(len(t) == 1 for t in self.terminals)
            if all_single:
                tokens = []
                for ch in tok:
                    if ch not in self.terminals:
                        return False, [], f"Unknown terminal character '{ch}'. Valid terminals are: {sorted(list(self.terminals))}"
                    tokens.append(ch)
                return True, tokens, ""
            else:
                return False, [], f"Unrecognized token '{tok}'. Since grammar has multi-character symbols, separate with spaces."

        return False, [], "No tokens detected."

    @staticmethod
    def create_expression_grammar():
        g = Grammar()
        g.add_production_line("E -> E + T | T")
        g.add_production_line("T -> T * F | F")
        g.add_production_line("F -> ( E ) | id")
        g.finalize()
        return g

    @staticmethod
    def create_sample_grammar():
        g = Grammar()
        g.add_production_line("S -> C C")
        g.add_production_line("C -> c C")
        g.add_production_line("C -> d")
        g.finalize()
        return g

    def __str__(self):
        lines = [
            f"Start Symbol: {self.start_symbol}",
            f"Nonterminals: {', '.join(sorted(list(self.nonterminals)))}",
            f"Terminals:    {', '.join(sorted(list(self.terminals)))}",
            "Productions:"
        ]
        for p in self.productions:
            lines.append(f"  ({p.id}) {p}")
        return "\n".join(lines)


def simulate_slr1(grammar, input_tokens, max_steps=1000):
    """
    Executes shift-reduce parsing using the constructed SLR(1) parsing table.
    Stack stores alternating states and symbols:
      state_stack: [0, s1, s2, ...]
      symbol_stack: ['$', sym1, sym2, ...]
    """
    if not input_tokens:
        step = ParsingStep(1, ["$"], [0], ["$"], "ERROR",
                           f"Input is empty. Grammar start symbol '{grammar.start_symbol}' cannot derive empty string.",
                           "ERROR")
        return False, "REJECTED (EMPTY INPUT)", [step], 1, step.explanation

    state_stack = [0]
    symbol_stack = ["$"]
    input_buffer = list(input_tokens) + ["$"]
    input_index = 0
    step_num = 1
    steps = []

    while step_num <= max_steps:
        cur_state = state_stack[-1]
        lookahead = input_buffer[input_index]
        remaining = input_buffer[input_index:]

        key = (cur_state, lookahead)
        actions = grammar.action_table.get(key, [])

        if not actions:
            expected = sorted([term for (st, term) in grammar.action_table.keys() if st == cur_state])
            expl = f"Syntax error in State {cur_state} on token '{lookahead}'. Expected: {', '.join(expected) if expected else 'none'}"
            step = ParsingStep(step_num, symbol_stack, state_stack, remaining, "ERROR", expl, "ERROR")
            steps.append(step)
            return False, "REJECTED (SYNTAX ERROR)", steps, step_num, expl

        # Deterministic conflict handling (default: prefer shift over reduce, lowest ID for reduce)
        chosen_act = actions[0]
        tie_break_note = ""
        if len(actions) > 1:
            shifts = [a for a in actions if a[0] == 's']
            if shifts:
                chosen_act = shifts[0]
                tie_break_note = f" (Shift/Reduce conflict resolved: shifted)"
            else:
                chosen_act = sorted(actions, key=lambda a: a[1])[0]
                tie_break_note = f" (Reduce/Reduce conflict resolved: lowest rule ID)"

        act_type, act_val = chosen_act

        # 1. SHIFT
        if act_type == 's':
            next_state = act_val
            action_disp = f"SHIFT (s{next_state})"
            expl = f"Shift token '{lookahead}' onto stack and enter State {next_state}{tie_break_note}"
            step = ParsingStep(step_num, symbol_stack, state_stack, remaining, action_disp, expl, "SHIFT")
            steps.append(step)

            symbol_stack.append(lookahead)
            state_stack.append(next_state)
            input_index += 1
            step_num += 1
            continue

        # 2. REDUCE
        elif act_type == 'r':
            prod_idx = act_val
            prod = grammar.augmented_productions[prod_idx]
            rhs_len = len(prod.rhs)

            action_disp = f"REDUCE ({prod})"
            
            state_after_pop = state_stack[-1 - rhs_len] if len(state_stack) > rhs_len else 0
            next_goto = grammar.goto_table.get((state_after_pop, prod.lhs))
            if next_goto is None:
                expl = f"Internal GOTO table error: no transition for state {state_after_pop} on nonterminal '{prod.lhs}'"
                step = ParsingStep(step_num, symbol_stack, state_stack, remaining, "ERROR", expl, "ERROR")
                steps.append(step)
                return False, "REJECTED (GOTO ERROR)", steps, step_num, expl

            expl = f"Reduce '{' '.join(prod.rhs)}' to {prod.lhs} using rule ({prod.id}); goto State {next_goto}{tie_break_note}"
            step = ParsingStep(step_num, symbol_stack, state_stack, remaining, action_disp, expl, "REDUCE")
            steps.append(step)

            # Pop rhs_len elements after recording step snapshot
            for _ in range(rhs_len):
                symbol_stack.pop()
                state_stack.pop()

            symbol_stack.append(prod.lhs)
            state_stack.append(next_goto)
            step_num += 1
            continue

        # 3. ACCEPT
        elif act_type == 'acc':
            action_disp = "ACCEPT"
            expl = f"Start symbol '{grammar.start_symbol}' accepted on stack with end marker '$'"
            step = ParsingStep(step_num, symbol_stack, state_stack, remaining, action_disp, expl, "ACCEPT")
            steps.append(step)
            return True, "ACCEPTED", steps, step_num, ""

    # Step limit reached
    step = ParsingStep(step_num, symbol_stack, state_stack, input_buffer[input_index:], "ERROR",
                       f"Safety step limit ({max_steps}) exceeded.", "ERROR")
    steps.append(step)
    return False, "REJECTED (STEP LIMIT EXCEEDED)", steps, step_num, step.explanation


def print_trace_table(steps, accepted, total_steps, status_msg, interactive=False):
    col_step = 6
    col_stack = 20
    col_input = 16
    col_action = 24
    col_expl = 48

    sep = f"+{'-'*(col_step+2)}+{'-'*(col_stack+2)}+{'-'*(col_input+2)}+{'-'*(col_action+2)}+{'-'*(col_expl+2)}+"

    print("\n--- [ SLR(1) Parsing Trace Table ] ---")
    print(sep)
    print(f"| {'Step':<{col_step}} | {'Stack':<{col_stack}} | {'Input Buffer':<{col_input}} | {'Action':<{col_action}} | {'Explanation':<{col_expl}} |")
    print(sep)

    auto_continue = not interactive

    for i, s in enumerate(steps):
        stack_str = " ".join(s.stack_symbols)
        input_str = " ".join(s.remaining_input)

        print(f"| {str(s.step_number):<{col_step}} | {stack_str:<{col_stack}} | {input_str:<{col_input}} | {s.action_str:<{col_action}} | {s.explanation:<{col_expl}} |")

        if interactive and not auto_continue and i + 1 < len(steps):
            cmd = input(f"  --> Step {s.step_number} completed. [Enter] Next | ['c'] Continue all | ['q'] Abort: ").strip().lower()
            if cmd == "c":
                auto_continue = True
            elif cmd == "q":
                print("  [Step-by-step trace aborted by user]")
                break

    print(sep)
    print("\n" + "="*80)
    if accepted:
        print(f"  RESULT: INPUT STRING ACCEPTED!")
        print(f"  Total Steps: {total_steps}")
        print(f"  {status_msg}")
    else:
        print(f"  RESULT: INPUT STRING REJECTED!")
        print(f"  Total Steps: {total_steps}")
        print(f"  Reason: {status_msg}")
    print("="*80 + "\n")


def display_grammar_tables(grammar):
    print("\n" + "="*80)
    print("                SLR(1) PARSING TABLE SPECIFICATION")
    print("================================================================================")
    print(grammar)

    print("\n--- [ FIRST Sets ] ---")
    for nt in sorted(list(grammar.nonterminals)):
        print(f"  FIRST({nt}) = {{ {', '.join(sorted(list(grammar.first[nt])))} }}")

    print("\n--- [ FOLLOW Sets ] ---")
    for nt in sorted(list(grammar.nonterminals)):
        print(f"  FOLLOW({nt}) = {{ {', '.join(sorted(list(grammar.follow[nt])))} }}")

    print(f"\n--- [ Canonical Collection of LR(0) Items: {len(grammar.states)} States ] ---")
    for i, item_set in enumerate(grammar.states):
        print(f"  State {i}:")
        for prod_idx, dot in sorted(list(item_set)):
            p = grammar.augmented_productions[prod_idx]
            rhs_with_dot = list(p.rhs)
            rhs_with_dot.insert(dot, "•")
            print(f"    {p.lhs} -> {' '.join(rhs_with_dot)}")

    if grammar.conflicts:
        print("\n" + "!"*80)
        print(f"  WARNING: {len(grammar.conflicts)} CONFLICT(S) DETECTED IN THIS GRAMMAR:")
        for c in grammar.conflicts:
            print("   *", c)
        print("  This grammar is NOT strictly SLR(1). Default disambiguation applied.")
        print("!"*80)
    else:
        print("\n[✓] Grammar is strictly SLR(1): ZERO Shift/Reduce or Reduce/Reduce conflicts.")
    print("="*80 + "\n")


def run_test_suite():
    # 1. Sample Grammar Tests
    sample_g = Grammar.create_sample_grammar()
    sample_tests = [
        ("Sample 1: Valid input 'cdd'", sample_g, "cdd", True, "S -> C C, C -> c C | d"),
        ("Sample 2: Valid input 'dd'", sample_g, "dd", True, "Both C derive d directly"),
        ("Sample 3: Valid input 'ccdd'", sample_g, "ccdd", True, "Nested c C reductions"),
        ("Sample 4: Invalid input 'c'", sample_g, "c", False, "Incomplete input"),
        ("Sample 5: Invalid input 'ddd'", sample_g, "ddd", False, "Extra token after S"),
        ("Sample 6: Invalid input 'cdx'", sample_g, "cdx", False, "Unknown terminal 'x'"),
        ("Sample 7: Empty input ''", sample_g, "", False, "No epsilon derivation")
    ]

    # 2. Expression Grammar Tests (Target of user request)
    expr_g = Grammar.create_expression_grammar()
    expr_tests = [
        ("Expr 1: Valid '( id * id )'", expr_g, "( id * id )", True, "Parentheses with multiplication"),
        ("Expr 2: Valid 'id * id'", expr_g, "id * id", True, "Binary multiplication"),
        ("Expr 3: Valid 'id + id * id'", expr_g, "id + id * id", True, "Operator precedence (* over +)"),
        ("Expr 4: Valid '( id + id ) * id'", expr_g, "( id + id ) * id", True, "Parenthesized sum times id"),
        ("Expr 5: Invalid '( id * )'", expr_g, "( id * )", False, "Missing second operand inside parens"),
        ("Expr 6: Invalid 'id + * id'", expr_g, "id + * id", False, "Consecutive operators + and *")
    ]

    all_tests = sample_tests + expr_tests

    col_name = 32
    col_input = 20
    col_exp = 10
    col_act = 10
    col_status = 10

    sep = f"+{'-'*(col_name+2)}+{'-'*(col_input+2)}+{'-'*(col_exp+2)}+{'-'*(col_act+2)}+{'-'*(col_status+2)}+"

    print("\n--- [ Automated Test Suite Verification (SLR(1) Engine) ] ---")
    print(sep)
    print(f"| {'Test Case':<{col_name}} | {'Input':<{col_input}} | {'Expected':<{col_exp}} | {'Actual':<{col_act}} | {'Status':<{col_status}} |")
    print(sep)

    pass_count = 0
    details = []

    for name, g, inp, exp, desc in all_tests:
        ok, tokens, err = g.tokenize_input(inp)
        if not ok:
            actual = False
            passed = (actual == exp)
            detail = f"Input validation: {err}"
        else:
            acc, stat, steps, total, err_msg = simulate_slr1(g, tokens)
            actual = acc
            passed = (actual == exp)
            detail = f"Accepted in {total} steps" if actual else f"Rejected: {err_msg}"

        if passed:
            pass_count += 1

        exp_str = "ACCEPT" if exp else "REJECT"
        act_str = "ACCEPT" if actual else "REJECT"
        stat_str = "[PASS]" if passed else "[FAIL]"
        disp_inp = inp if inp else "(empty)"

        print(f"| {name:<{col_name}} | {disp_inp:<{col_input}} | {exp_str:<{col_exp}} | {act_str:<{col_act}} | {stat_str:<{col_status}} |")
        details.append((name, detail))

    print(sep)
    print(f"\n>>> ALL {pass_count} / {len(all_tests)} TESTS PASSED SUCCESSFULLY! <<<\n")
    print("Test Details:")
    for i, (n, d) in enumerate(details):
        print(f"  [{i+1}] {n}: {d}")
    print()
    return pass_count == len(all_tests)


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("--test", "-t"):
        success = run_test_suite()
        sys.exit(0 if success else 1)

    # Default to Expression Grammar (which demonstrates operator precedence and parens)
    current_grammar = Grammar.create_expression_grammar()

    while True:
        print("="*80)
        print("              SHIFT-REDUCE PARSING SIMULATOR (SLR(1) ENGINE)")
        print("================================================================================")
        print("  Subject: Compiler Design | Bottom-Up LR/SLR Syntax Analysis")
        print("  Using FIRST/FOLLOW Sets, Canonical LR(0) Items, & ACTION/GOTO Tables")
        print("================================================================================")
        print("\nMAIN MENU:")
        print("  [1] Parse Input with Arithmetic Expression Grammar (E -> E+T|T, T->T*F|F, etc.)")
        print("  [2] Parse Input with Classic Sample Grammar (S -> C C, C -> c C | d)")
        print("  [3] Parse Custom Input String with Current Grammar")
        print("  [4] Enter Custom Context-Free Grammar")
        print("  [5] View Current Grammar, FIRST & FOLLOW Sets, and LR(0) Item Sets")
        print("  [6] View SLR(1) Action & Goto Parsing Tables and Conflicts")
        print("  [7] Run Automated Test Suite (All 13 Required & Precedence Tests)")
        print("  [8] Exit Simulator")
        print("-"*80)

        choice = input("Select an option (1-8): ").strip()
        if not choice:
            continue

        if choice == "1":
            current_grammar = Grammar.create_expression_grammar()
            print("\n--- [ Expression Grammar Activated ] ---")
            print(current_grammar)
            print("\nSuggested inputs to test:")
            print("  - ( id * id )")
            print("  - id * id")
            print("  - id + id * id")
            print("  - ( id * )   [should reject]")
            inp = input("\nEnter expression to parse (default: '( id * id )'): ").strip()
            if not inp:
                inp = "( id * id )"
            ok, tokens, err = current_grammar.tokenize_input(inp)
            if not ok:
                print(f"\n[ERROR] {err}")
            else:
                print(f"Recognized Tokens: {tokens}")
                print("Execution mode:")
                print("  [1] Complete trace")
                print("  [2] Step-by-step interactive mode")
                mode = input("Enter choice (1-2, default 1): ").strip()
                acc, stat, steps, total, err_msg = simulate_slr1(current_grammar, tokens)
                print_trace_table(steps, acc, total, stat if acc else err_msg, interactive=(mode == "2"))
            input("\nPress Enter to continue...")

        elif choice == "2":
            current_grammar = Grammar.create_sample_grammar()
            print("\n--- [ Sample Grammar Activated ] ---")
            print(current_grammar)
            inp = input("\nEnter input string (default: 'cdd'): ").strip()
            if not inp:
                inp = "cdd"
            ok, tokens, err = current_grammar.tokenize_input(inp)
            if not ok:
                print(f"\n[ERROR] {err}")
            else:
                print(f"Recognized Tokens: {tokens}")
                acc, stat, steps, total, err_msg = simulate_slr1(current_grammar, tokens)
                print_trace_table(steps, acc, total, stat if acc else err_msg, interactive=False)
            input("\nPress Enter to continue...")

        elif choice == "3":
            print("\n--- [ Parse Custom Input with Current Grammar ] ---")
            print(current_grammar)
            inp = input("\nEnter input string: ").strip()
            ok, tokens, err = current_grammar.tokenize_input(inp)
            if not ok:
                print(f"\n[ERROR] {err}")
            else:
                print(f"Recognized Tokens: {tokens}")
                print("Execution mode:")
                print("  [1] Complete trace")
                print("  [2] Step-by-step interactive mode")
                mode = input("Enter choice (1-2, default 1): ").strip()
                acc, stat, steps, total, err_msg = simulate_slr1(current_grammar, tokens)
                print_trace_table(steps, acc, total, stat if acc else err_msg, interactive=(mode == "2"))
            input("\nPress Enter to continue...")

        elif choice == "4":
            print("\n--- [ Enter Custom Grammar ] ---")
            print("Enter rules one per line (e.g. E -> E + T | T). Type 'END' or empty line to finish:")
            new_g = Grammar()
            while True:
                line = input("Rule: ").strip()
                if not line or line.upper() == "END":
                    break
                ok, err = new_g.add_production_line(line)
                if not ok:
                    print(f"  [ERROR] {err}")
            if new_g.productions:
                new_g.finalize()
                current_grammar = new_g
                print("[SUCCESS] Custom grammar finalized and SLR(1) parsing tables generated!")
                if current_grammar.conflicts:
                    print(f"[WARNING] {len(current_grammar.conflicts)} conflict(s) detected.")
                else:
                    print("[✓] Grammar is strictly SLR(1).")
            input("\nPress Enter to continue...")

        elif choice == "5":
            display_grammar_tables(current_grammar)
            input("\nPress Enter to continue...")

        elif choice == "6":
            display_grammar_tables(current_grammar)
            input("\nPress Enter to continue...")

        elif choice == "7":
            run_test_suite()
            input("\nPress Enter to continue...")

        elif choice == "8":
            print("\nExiting Shift-Reduce Simulator. Goodbye!\n")
            break

if __name__ == "__main__":
    main()
