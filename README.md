# Shift-Reduce Parsing Simulator (SLR(1))

A minimalist, high-contrast black-and-white **Shift-Reduce Parsing Simulator** designed for Compiler Design education.

The project features:
1. **Single-Screen Web Application**: A zero-backend, browser-based simulator constrained within `100vh` and `100vw` with **no page-level scrolling**, dedicated internal trace table scrolling, step-by-step controls, and an automated **Simulate Workflow** animation.
2. **Terminal Simulator**: An authoritative Python implementation (`shift_reduce.py`) implementing the identical SLR(1) parsing engine, runnable directly from the **MSYS2 UCRT64** terminal.

---

## 1. Project Structure

```
mini_project/
├── index.html        # Single-screen, serverless black-and-white application entry point
├── style.css         # Strict B&W stylesheet (100vh/100vw, no page scrolling, clean borders)
├── app.js            # Standalone client-side SLR(1) parsing engine, step & workflow controller
├── shift_reduce.py   # Authoritative Python SLR(1) parsing engine & interactive terminal CLI
├── README.md         # Documentation, usage guide, and test verification report
└── .gitignore        # Git ignore rules
```

> **Note on Architecture**: The project is completely serverless. No Python HTTP server, Flask/FastAPI backend, Node.js process, or external dependencies are required to run the web application.

---

## 2. Quick Start Guide

### A. Launching the Web Application (No Server Required)
Simply open [`index.html`](index.html) in any modern web browser (Edge, Chrome, Firefox):

- **Command Line (Windows / MSYS2)**:
  ```bash
  start index.html
  ```
- **File Explorer**: Double-click [`index.html`](index.html).

### B. Running the Terminal Simulator in MSYS2 UCRT64
The terminal simulator (`shift_reduce.py`) uses the Python runtime available in MSYS2 UCRT64:

- **Launch Interactive Menu**:
  ```bash
  python shift_reduce.py
  ```
- **Run Automated Verification Suite (13 Tests)**:
  ```bash
  python shift_reduce.py --test
  ```

---

## 3. Strict Black-and-White Design System

The web interface is styled using a strict monochromatic palette:
- **Backgrounds**: Pure white (`#FFFFFF`) and subtle light grey (`#EEEEEE`).
- **Text & Accents**: Solid black (`#000000`).
- **Borders**: Thin black (`1px solid #000000`) and light grey (`1px solid #DDDDDD`).
- **Typography**: Readable monospace font (`SF Mono`, `Fira Code`, `Consolas`, monospace) for grammar rules, token streams, stack states, and execution traces.
- **Removed**: All colored status badges, neon gradients, decorative illustrations, abstract graphics, and distracting CSS animations.

---

## 4. One-Screen Layout (100vh / 100vw)

The entire interface fits within the viewport with zero window-level scrolling:
1. **Compact Top Bar (44px)**:
   - Header with `Shift-Reduce Parser` title and `Compiler Design Simulator [SLR(1)]` subtitle.
   - Quick-access `Reset` and `Help` buttons.
2. **Left Panel (340px)**:
   - **Grammar Selector**: Dropdown to select verified presets (Arithmetic, Classic $S \to C C$, Parentheses, Balanced $a^n b^n$).
   - **Grammar Productions Editor**: Multiline rule editor.
   - **Input String & Start Symbol**: Text fields for tokens and start symbol.
   - **Primary Action Buttons**: `Run Complete`, `Step-by-Step`, `▶ Simulate Workflow`, `Run Tests (13)`, `Reset`.
   - **Step Controls Bar**: Appears during stepping with `← Prev`, `Next →`, `Finish`, and `Step X/Y` badge.
3. **Right Panel (Simulation Workspace)**:
   - **Top Status Bar**: Live `PARSER STATUS` (`READY`, `ACCEPTED`, `REJECTED`, `SIMULATING...`), `CURRENT ACTION`, and step indicator.
   - **Live Stack**: High-contrast token blocks displaying symbols and active LR state numbers (`[$ s0] [( s1] [id s2]`).
   - **Remaining Input Track**: Token sequence showing lookahead highlighted in inverted black (`[tok]`).
   - **Explanation Line**: Detail explaining the current transition.
   - **Internal Trace Table Area**: Scrollable internal table with sticky header displaying `STEP`, `STACK`, `REMAINING INPUT`, `ACTION`, and `EXPLANATION`.

---

## 5. Simulation Modes Explained

### 1. Run Complete
Parses the input and populates the entire trace table instantly, setting the visualizer to the final accepted or rejected state.

### 2. Step-by-Step
Initializes the stack and input buffer at step 0. Use `Next →` and `← Prev` to manually step forward and backward one action at a time.

### 3. Simulate Workflow (Automated Visual Walkthrough)
Visually demonstrates the bottom-up parsing process automatically:
- Click **`▶ Simulate Workflow`** to begin automated execution.
- The button toggles to **`❚❚ Pause`** / **`▶ Resume`**, with a **`■ Stop`** button appearing alongside.
- Adjustable speed selector: Slow (1.2s), Normal (0.7s), Fast (0.35s).
- Dynamically highlights shifted tokens, pops and collapses reduced handles, updates the stack blocks, and auto-scrolls the active row in the trace table.
- Halts cleanly upon reaching `ACCEPT` or `ERROR`.

### 4. Run Tests (13)
Opens a modal evaluating all 13 test cases against the SLR(1) engine, reporting actual vs. expected results and pass/fail status.

---

## 6. Parsing Algorithm: SLR(1) Specifications

Both the Python engine (`shift_reduce.py`) and browser engine (`app.js`) implement the canonical SLR(1) parsing algorithm:
1. **Augmented Grammar**: Generates rule 0: $S' \to S$.
2. **FIRST & FOLLOW Sets**: Computes $FIRST$ for all symbols and $FOLLOW$ for all nonterminals.
3. **Canonical LR(0) Collection**: Constructs item sets using $Closure(I)$ and $GOTO(I, X)$ operations.
4. **SLR(1) Parsing Table**:
   - Shift actions $s_j$ on terminal $a$ where $A \to \alpha \cdot a \beta \in I_i$ and $GOTO(I_i, a) = I_j$.
   - Reduce actions $r_k$ on terminal $a \in FOLLOW(A)$ where $A \to \alpha \cdot \in I_i$.
   - Accept action on `$` where $S' \to S \cdot \in I_i$.
5. **Conflict Resolution**: Audits states for Shift/Reduce and Reduce/Reduce conflicts. Default disambiguation prefers shift over reduce.

### Why `( id * id )` Succeeds in SLR(1)
In naive greedy parsers, stack `$ ( T` with lookahead `*` prematurely reduces $E \to T$. Because $FOLLOW(E) = \{+, ), \$\}$ does not contain `*`, the SLR(1) table contains **no reduction on `*`**. The parser shifts `*`, correctly enforcing operator precedence!

---

## 7. Automated Test Verification Results (13 / 13 Passed)

All 13 test cases were verified using `python shift_reduce.py --test` and the in-browser test runner:

```
--- [ Automated Test Suite Verification (SLR(1) Engine) ] ---
+----------------------------------+----------------------+------------+------------+------------+
| Test Case                        | Input                | Expected   | Actual     | Status     |
+----------------------------------+----------------------+------------+------------+------------+
| Sample 1: Valid input 'cdd'      | cdd                  | ACCEPT     | ACCEPT     | [PASS]     |
| Sample 2: Valid input 'dd'       | dd                   | ACCEPT     | ACCEPT     | [PASS]     |
| Sample 3: Valid input 'ccdd'     | ccdd                 | ACCEPT     | ACCEPT     | [PASS]     |
| Sample 4: Invalid input 'c'      | c                    | REJECT     | REJECT     | [PASS]     |
| Sample 5: Invalid input 'ddd'    | ddd                  | REJECT     | REJECT     | [PASS]     |
| Sample 6: Invalid input 'cdx'    | cdx                  | REJECT     | REJECT     | [PASS]     |
| Sample 7: Empty input ''         | (empty)              | REJECT     | REJECT     | [PASS]     |
| Expr 1: Valid '( id * id )'      | ( id * id )          | ACCEPT     | ACCEPT     | [PASS]     |
| Expr 2: Valid 'id * id'          | id * id              | ACCEPT     | ACCEPT     | [PASS]     |
| Expr 3: Valid 'id + id * id'     | id + id * id         | ACCEPT     | ACCEPT     | [PASS]     |
| Expr 4: Valid '( id + id ) * id' | ( id + id ) * id     | ACCEPT     | ACCEPT     | [PASS]     |
| Expr 5: Invalid '( id * )'       | ( id * )             | REJECT     | REJECT     | [PASS]     |
| Expr 6: Invalid 'id + * id'      | id + * id            | REJECT     | REJECT     | [PASS]     |
+----------------------------------+----------------------+------------+------------+------------+

>>> ALL 13 / 13 TESTS PASSED (100%) <<<
```

---

## 8. Summary of Removed Server Files

In accordance with requirements:
- `server.py`: Completely removed. No backend server or localhost port binding is required.
- `simulator.html`: Removed in favor of [`index.html`](index.html).
- The web app is 100% serverless, static, and runs directly from disk or any static file server.
