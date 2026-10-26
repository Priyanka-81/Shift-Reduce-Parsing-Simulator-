/**
 * Shift-Reduce Parser — Minimalist Black & White Single-Screen Controller
 * Features full SLR(1) parsing, step-by-step navigation, and automated workflow simulation.
 * Standalone client-side engine (No backend or server required).
 */

// Presets
const PRESETS = {
    expr: {
        grammar: "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id",
        input: "( id * id )",
        start: "E"
    },
    sample: {
        grammar: "S -> C C\nC -> c C\nC -> d",
        input: "c d d",
        start: "S"
    },
    paren: {
        grammar: "E -> ( E )\nE -> id",
        input: "( ( id ) )",
        start: "E"
    },
    repeat: {
        grammar: "S -> a S b\nS -> a b",
        input: "a a b b",
        start: "S"
    }
};

// Application State
let activeSteps = [];
let currentStepIdx = 0;
let isStepMode = false;
let workflowTimer = null;
let isWorkflowRunning = false;
let isWorkflowPaused = false;
let currentGrammarObj = null;

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    // Run complete automatically with default arithmetic grammar so workspace is active immediately
    handleRunComplete();
});

// Load Preset
function loadPreset(key) {
    const preset = PRESETS[key];
    if (!preset) return;

    handleStopWorkflow();
    document.getElementById("grammarInput").value = preset.grammar;
    document.getElementById("tokenInput").value = preset.input;
    document.getElementById("startSymbolInput").value = preset.start;

    const sel = document.getElementById("presetSelect");
    if (sel) sel.value = key;

    handleRunComplete();
}

// Read Inputs & Execute SLR(1) Parser
function executeParser() {
    const grammarText = document.getElementById("grammarInput").value;
    const inputText = document.getElementById("tokenInput").value;
    const startSymbol = document.getElementById("startSymbolInput").value.trim();

    const g = buildSLR1Grammar(grammarText, startSymbol);
    if (!g.ok) {
        return { success: false, error: g.error };
    }
    currentGrammarObj = g;

    // Update grammar info line
    const infoEl = document.getElementById("grammarStatusLine");
    if (infoEl) {
        if (g.conflicts.length > 0) {
            infoEl.innerText = `Grammar: ${g.productions.length} rules, ${g.conflicts.length} conflict(s)`;
        } else {
            infoEl.innerText = `Grammar: ${g.productions.length} rules, SLR(1) Verified (0 conflicts)`;
        }
    }

    const tok = tokenizeInput(inputText, g.terminals);
    if (!tok.ok) {
        return { success: false, error: tok.error, grammar: g };
    }

    const sim = simulateSLR1(g, tok.tokens);
    return {
        success: true,
        accepted: sim.accepted,
        status: sim.status,
        totalSteps: sim.steps.length,
        errorMessage: sim.errorMessage,
        steps: sim.steps,
        tokens: tok.tokens,
        grammar: g
    };
}

// ==========================================================================
// 1. Run Complete
// ==========================================================================
function handleRunComplete() {
    handleStopWorkflow();
    const result = executeParser();
    if (!result) return;

    if (!result.success) {
        showGlobalError(result.error);
        return;
    }

    activeSteps = result.steps;
    isStepMode = false;
    document.getElementById("stepControlsBar").style.display = "none";

    renderTraceTable(activeSteps);
    showStep(activeSteps.length - 1, false);

    if (result.accepted) {
        updateStatusTag("ACCEPTED", "status-accepted");
    } else {
        updateStatusTag("REJECTED", "status-rejected");
    }
}

// ==========================================================================
// 2. Step-by-Step Interactive Mode
// ==========================================================================
function handleStartStep() {
    handleStopWorkflow();
    const result = executeParser();
    if (!result) return;

    if (!result.success) {
        showGlobalError(result.error);
        return;
    }

    activeSteps = result.steps;
    isStepMode = true;
    currentStepIdx = 0;

    document.getElementById("stepControlsBar").style.display = "flex";
    renderTraceTable(activeSteps);
    showStep(currentStepIdx, true);
    updateStatusTag("STEPPING", "status-ready");
}

function handleNextStep() {
    if (!activeSteps || activeSteps.length === 0) return;
    if (currentStepIdx + 1 < activeSteps.length) {
        currentStepIdx++;
        showStep(currentStepIdx, true);
    }
}

function handlePrevStep() {
    if (!activeSteps || activeSteps.length === 0) return;
    if (currentStepIdx > 0) {
        currentStepIdx--;
        showStep(currentStepIdx, true);
    }
}

function handleFinishAll() {
    if (!activeSteps || activeSteps.length === 0) return;
    currentStepIdx = activeSteps.length - 1;
    showStep(currentStepIdx, true);
}

// ==========================================================================
// 3. Simulate Workflow (Automated Visual Demonstration)
// ==========================================================================
function handleToggleSimulateWorkflow() {
    const btnSim = document.getElementById("btnSimulateWorkflow");
    const btnStop = document.getElementById("btnStopWorkflow");

    if (isWorkflowRunning && !isWorkflowPaused) {
        // Pause active simulation
        clearInterval(workflowTimer);
        isWorkflowPaused = true;
        btnSim.innerText = "▶ Resume";
        updateStatusTag("PAUSED", "status-ready");
        return;
    }

    if (isWorkflowRunning && isWorkflowPaused) {
        // Resume simulation
        isWorkflowPaused = false;
        btnSim.innerText = "❚❚ Pause";
        updateStatusTag("SIMULATING...", "status-running");
        startWorkflowInterval();
        return;
    }

    // Start fresh workflow simulation
    const result = executeParser();
    if (!result || !result.success) {
        showGlobalError(result ? result.error : "Failed to initialize parser.");
        return;
    }

    activeSteps = result.steps;
    currentStepIdx = 0;
    isWorkflowRunning = true;
    isWorkflowPaused = false;
    isStepMode = true;

    btnSim.innerText = "❚❚ Pause";
    btnStop.style.display = "inline-flex";
    document.getElementById("stepControlsBar").style.display = "flex";

    updateStatusTag("SIMULATING...", "status-running");
    renderTraceTable(activeSteps);
    showStep(currentStepIdx, true);

    startWorkflowInterval();
}

function startWorkflowInterval() {
    const speed = parseInt(document.getElementById("simSpeedSelect").value, 10) || 700;
    clearInterval(workflowTimer);

    workflowTimer = setInterval(() => {
        if (currentStepIdx + 1 < activeSteps.length) {
            currentStepIdx++;
            showStep(currentStepIdx, true);
        } else {
            // Workflow complete
            handleFinishWorkflow();
        }
    }, speed);
}

function handleSpeedChange() {
    if (isWorkflowRunning && !isWorkflowPaused) {
        startWorkflowInterval();
    }
}

function handleStopWorkflow() {
    clearInterval(workflowTimer);
    isWorkflowRunning = false;
    isWorkflowPaused = false;

    const btnSim = document.getElementById("btnSimulateWorkflow");
    const btnStop = document.getElementById("btnStopWorkflow");
    if (btnSim) btnSim.innerText = "▶ Simulate Workflow";
    if (btnStop) btnStop.style.display = "none";
}

function handleFinishWorkflow() {
    handleStopWorkflow();
    const lastStep = activeSteps[activeSteps.length - 1];
    const isAcc = (lastStep.action_type === "ACCEPT");
    updateStatusTag(isAcc ? "ACCEPTED" : "REJECTED", isAcc ? "status-accepted" : "status-rejected");
}

// ==========================================================================
// 4. Reset & Help Handling
// ==========================================================================
function handleReset() {
    handleStopWorkflow();
    activeSteps = [];
    currentStepIdx = 0;
    isStepMode = false;

    document.getElementById("stepControlsBar").style.display = "none";
    updateStatusTag("READY", "status-ready");
    updateActionTag("NONE", "action-idle");
    document.getElementById("stepIndicatorText").innerText = "0 / 0";

    updateStackDisplay(["$"]);
    updateInputDisplay(document.getElementById("tokenInput").value.trim().split(/\s+/).concat(["$"]), 0);
    document.getElementById("explanationText").innerText = 'Simulator reset. Enter grammar and click "Run Complete" or "Simulate Workflow".';
    document.getElementById("traceSummaryText").innerText = "0 steps recorded";

    const tbody = document.getElementById("traceTableBody");
    tbody.innerHTML = `<tr><td colspan="5" class="empty-trace-cell">No trace loaded. Click "Run Complete" or "Simulate Workflow" to start.</td></tr>`;
}

function openHelpModal() {
    document.getElementById("helpModal").style.display = "flex";
}

function closeHelpModal(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close")) return;
    document.getElementById("helpModal").style.display = "none";
}

function openTestsModal() {
    document.getElementById("testsModal").style.display = "flex";
    runAutomatedTests();
}

function closeTestsModal(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains("modal-close")) return;
    document.getElementById("testsModal").style.display = "none";
}

// ==========================================================================
// 5. Visualizer Updates (Single-Screen Synchronized Display)
// ==========================================================================
function showStep(idx, autoScrollTable = true) {
    if (!activeSteps || idx >= activeSteps.length || idx < 0) return;
    currentStepIdx = idx;
    const step = activeSteps[idx];

    // Update Stack Blocks
    updateStackDisplay(step.stack, step.states);

    // Update Remaining Input Track with Lookahead Highlight
    updateInputDisplay(step.remaining, 0);

    // Update Action Indicator Pill
    const actType = step.action_type;
    updateActionTag(step.action, getActionClass(actType));

    // Update Explanation Detail
    document.getElementById("explanationText").innerText = step.explanation;

    // Update Step Indicators
    document.getElementById("stepIndicatorText").innerText = `${idx + 1} / ${activeSteps.length}`;
    document.getElementById("stepCounterBadge").innerText = `Step ${idx + 1}/${activeSteps.length}`;

    // Highlight row in Trace Table
    highlightTraceRow(idx, autoScrollTable);

    // Update Prev/Next button states
    const btnPrev = document.getElementById("btnPrevStep");
    const btnNext = document.getElementById("btnNextStep");
    if (btnPrev) btnPrev.disabled = (idx === 0);
    if (btnNext) btnNext.disabled = (idx === activeSteps.length - 1);

    // If final step reached in step mode, show verdict
    if (idx === activeSteps.length - 1) {
        const isAcc = (actType === "ACCEPT");
        updateStatusTag(isAcc ? "ACCEPTED" : "REJECTED", isAcc ? "status-accepted" : "status-rejected");
    }
}

function updateStackDisplay(symbols, states) {
    const cont = document.getElementById("stackContainer");
    if (!symbols || symbols.length === 0) {
        cont.innerHTML = `<div class="stack-block stack-bottom">$</div>`;
        return;
    }

    cont.innerHTML = symbols.map((sym, i) => {
        const isTop = (i === symbols.length - 1);
        const stNum = (states && i < states.length) ? `<span class="stack-state-idx">s${states[i]}</span>` : "";
        return `<div class="stack-block ${isTop ? 'stack-top' : ''}">${escapeHtml(sym)}${stNum}</div>`;
    }).join("");

    // Keep rightmost (top of stack) visible
    cont.scrollLeft = cont.scrollWidth;
}

function updateInputDisplay(remainingTokens) {
    const cont = document.getElementById("inputTokensTrack");
    if (!remainingTokens || remainingTokens.length === 0) {
        cont.innerHTML = `<span class="token-item token-end">$</span>`;
        return;
    }

    cont.innerHTML = remainingTokens.map((tok, i) => {
        const isNext = (i === 0 && tok !== "$");
        const isEnd = (tok === "$");
        return `<span class="token-item ${isNext ? 'token-next' : ''} ${isEnd ? 'token-end' : ''}">${escapeHtml(tok)}</span>`;
    }).join("");
}

function updateStatusTag(text, className) {
    const el = document.getElementById("statusBanner");
    el.className = `status-tag ${className}`;
    el.innerText = text;
}

function updateActionTag(text, className) {
    const el = document.getElementById("actionBanner");
    el.className = `action-tag ${className}`;
    el.innerText = text;
}

function getActionClass(actType) {
    switch (actType) {
        case "SHIFT": return "action-shift";
        case "REDUCE": return "action-reduce";
        case "ACCEPT": return "action-accept";
        case "ERROR": return "action-error";
        default: return "action-idle";
    }
}

function getTableActionClass(actType) {
    switch (actType) {
        case "SHIFT": return "tbl-act-shift";
        case "REDUCE": return "tbl-act-reduce";
        case "ACCEPT": return "tbl-act-accept";
        case "ERROR": return "tbl-act-error";
        default: return "";
    }
}

// Render Trace Table Rows
function renderTraceTable(steps) {
    const tbody = document.getElementById("traceTableBody");
    if (!steps || steps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-trace-cell">No trace recorded.</td></tr>`;
        return;
    }

    tbody.innerHTML = steps.map((s) => {
        const actClass = getTableActionClass(s.action_type);
        return `
            <tr id="traceRow-${s.step}">
                <td style="font-weight: 700;">${s.step}</td>
                <td>${escapeHtml(s.stack.join(" "))}</td>
                <td>${escapeHtml(s.remaining.join(" "))}</td>
                <td><span class="${actClass}">${escapeHtml(s.action)}</span></td>
                <td>${escapeHtml(s.explanation)}</td>
            </tr>
        `;
    }).join("");

    document.getElementById("traceSummaryText").innerText = `${steps.length} steps recorded`;
}

function highlightTraceRow(stepIdx, autoScroll = true) {
    const rows = document.querySelectorAll("#traceTableBody tr");
    rows.forEach((r, i) => {
        if (i === stepIdx) {
            r.classList.add("active-step-row");
            if (autoScroll) {
                r.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        } else {
            r.classList.remove("active-step-row");
        }
    });
}

function showGlobalError(msg) {
    updateStatusTag("ERROR", "status-rejected");
    updateActionTag("ERROR", "action-error");
    document.getElementById("explanationText").innerText = msg;
    const tbody = document.getElementById("traceTableBody");
    tbody.innerHTML = `<tr><td colspan="5" class="empty-trace-cell" style="color:#000000; font-weight:700;">${escapeHtml(msg)}</td></tr>`;
}

// ==========================================================================
// 6. Automated Test Suite (13 Tests)
// ==========================================================================
function runAutomatedTests() {
    const sampleText = "S -> C C\nC -> c C\nC -> d";
    const exprText = "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id";

    const testDefs = [
        { name: "Sample 1: Valid 'cdd'", grammar: sampleText, input: "cdd", exp: true },
        { name: "Sample 2: Valid 'dd'", grammar: sampleText, input: "dd", exp: true },
        { name: "Sample 3: Valid 'ccdd'", grammar: sampleText, input: "ccdd", exp: true },
        { name: "Sample 4: Invalid 'c'", grammar: sampleText, input: "c", exp: false },
        { name: "Sample 5: Invalid 'ddd'", grammar: sampleText, input: "ddd", exp: false },
        { name: "Sample 6: Invalid 'cdx'", grammar: sampleText, input: "cdx", exp: false },
        { name: "Sample 7: Empty ''", grammar: sampleText, input: "", exp: false },
        { name: "Expr 1: Valid '( id * id )'", grammar: exprText, input: "( id * id )", exp: true },
        { name: "Expr 2: Valid 'id * id'", grammar: exprText, input: "id * id", exp: true },
        { name: "Expr 3: Valid 'id + id * id'", grammar: exprText, input: "id + id * id", exp: true },
        { name: "Expr 4: Valid '( id + id ) * id'", grammar: exprText, input: "( id + id ) * id", exp: true },
        { name: "Expr 5: Invalid '( id * )'", grammar: exprText, input: "( id * )", exp: false },
        { name: "Expr 6: Invalid 'id + * id'", grammar: exprText, input: "id + * id", exp: false }
    ];

    let passCount = 0;
    const results = [];

    for (const t of testDefs) {
        const g = buildSLR1Grammar(t.grammar);
        let actual = false;
        let details = "";
        if (!g.ok) {
            actual = false;
            details = g.error;
        } else {
            const tok = tokenizeInput(t.input, g.terminals);
            if (!tok.ok) {
                actual = false;
                details = tok.error;
            } else {
                const sim = simulateSLR1(g, tok.tokens);
                actual = sim.accepted;
                details = actual ? `Accepted in ${sim.steps.length} steps` : sim.errorMessage;
            }
        }

        const passed = (actual === t.exp);
        if (passed) passCount++;

        results.push({
            name: t.name,
            input: t.input || "(empty)",
            expected: t.exp ? "ACCEPT" : "REJECT",
            actual: actual ? "ACCEPT" : "REJECT",
            passed: passed,
            details: details
        });
    }

    const summaryEl = document.getElementById("testsSummaryText");
    summaryEl.innerText = `${passCount} / ${testDefs.length} Tests Passed (${Math.round(passCount / testDefs.length * 100)}%)`;

    const tbody = document.getElementById("testsTableBody");
    tbody.innerHTML = results.map((r, i) => `
        <tr>
            <td style="font-weight:700;">${i + 1}</td>
            <td>
                <div><strong>${escapeHtml(r.name)}</strong></div>
                <div style="font-size:10px; color:#555555;">${escapeHtml(r.details)}</div>
            </td>
            <td><code>${escapeHtml(r.input)}</code></td>
            <td>${r.expected}</td>
            <td>${r.actual}</td>
            <td style="font-weight:700;">${r.passed ? '[PASS]' : '[FAIL]'}</td>
        </tr>
    `).join("");
}

// ==========================================================================
// 7. Standalone SLR(1) Grammar Engine & Shift-Reduce Simulator (JS)
// ==========================================================================

function buildSLR1Grammar(text, customStart) {
    const lines = text.split("\n");
    const productions = [];
    const nonterminals = new Set();
    const terminals = new Set();
    let idCounter = 1;

    for (let raw of lines) {
        raw = raw.trim();
        if (!raw || raw.startsWith("#")) continue;

        const arrow = raw.includes("->") ? "->" : (raw.includes("::=") ? "::=" : null);
        if (!arrow) return { ok: false, error: `Malformed rule: missing '->' in "${raw}"` };

        const [lhsRaw, rhsRaw] = raw.split(arrow);
        const lhs = lhsRaw.trim();
        if (!lhs || lhs.includes(" ")) return { ok: false, error: `Invalid LHS "${lhs}": must be a single symbol.` };
        if (lhs === "$") return { ok: false, error: "'$' cannot be a nonterminal symbol." };

        const alts = rhsRaw.trim().split("|");
        for (const alt of alts) {
            const syms = alt.trim().split(/\s+/).filter(Boolean);
            if (syms.length === 0) return { ok: false, error: `Empty alternative in production for ${lhs}.` };
            for (const s of syms) {
                if (s === "$") return { ok: false, error: "'$' cannot appear on the right-hand side." };
            }
            productions.push({ id: idCounter++, lhs, rhs: syms });
        }
    }

    if (productions.length === 0) return { ok: false, error: "Grammar contains no productions." };
    for (const p of productions) nonterminals.add(p.lhs);

    let startSymbol = customStart && nonterminals.has(customStart) ? customStart : productions[0].lhs;

    for (const p of productions) {
        for (const s of p.rhs) {
            if (!nonterminals.has(s)) terminals.add(s);
        }
    }

    const augStart = startSymbol + "'";
    const augProductions = [{ id: 0, lhs: augStart, rhs: [startSymbol] }, ...productions];

    // Compute FIRST sets
    const first = {};
    for (const t of terminals) first[t] = new Set([t]);
    first["$"] = new Set(["$"]);
    for (const nt of nonterminals) first[nt] = new Set();
    first[augStart] = new Set();

    const seqFirst = (seq) => {
        const res = new Set();
        if (!seq || seq.length === 0) { res.add("ε"); return res; }
        for (const s of seq) {
            const sf = first[s] || new Set([s]);
            for (const f of sf) if (f !== "ε") res.add(f);
            if (!sf.has("ε")) return res;
        }
        res.add("ε");
        return res;
    };

    let changed = true;
    while (changed) {
        changed = false;
        for (const p of augProductions) {
            const b = first[p.lhs].size;
            const rf = seqFirst(p.rhs);
            for (const f of rf) first[p.lhs].add(f);
            if (first[p.lhs].size > b) changed = true;
        }
    }

    // Compute FOLLOW sets
    const follow = {};
    for (const nt of nonterminals) follow[nt] = new Set();
    follow[augStart] = new Set(["$"]);
    follow[startSymbol].add("$");

    changed = true;
    while (changed) {
        changed = false;
        for (const p of augProductions) {
            for (let i = 0; i < p.rhs.length; i++) {
                const s = p.rhs[i];
                if (nonterminals.has(s)) {
                    const beta = p.rhs.slice(i + 1);
                    const b = follow[s].size;
                    const bf = seqFirst(beta);
                    for (const f of bf) if (f !== "ε") follow[s].add(f);
                    if (bf.has("ε")) {
                        for (const f of follow[p.lhs]) follow[s].add(f);
                    }
                    if (follow[s].size > b) changed = true;
                }
            }
        }
    }

    // Canonical LR(0) Collection
    const closure = (items) => {
        const itArr = [...items];
        let c = true;
        while (c) {
            c = false;
            for (let i = 0; i < itArr.length; i++) {
                const it = itArr[i];
                const p = augProductions[it.pIdx];
                if (it.dot < p.rhs.length) {
                    const nxt = p.rhs[it.dot];
                    if (nonterminals.has(nxt)) {
                        for (let pi = 0; pi < augProductions.length; pi++) {
                            if (augProductions[pi].lhs === nxt) {
                                if (!itArr.some(x => x.pIdx === pi && x.dot === 0)) {
                                    itArr.push({ pIdx: pi, dot: 0 });
                                    c = true;
                                }
                            }
                        }
                    }
                }
            }
        }
        itArr.sort((a, b) => a.pIdx !== b.pIdx ? a.pIdx - b.pIdx : a.dot - b.dot);
        return itArr;
    };

    const gotoState = (items, sym) => {
        const moved = [];
        for (const it of items) {
            const p = augProductions[it.pIdx];
            if (it.dot < p.rhs.length && p.rhs[it.dot] === sym) {
                moved.push({ pIdx: it.pIdx, dot: it.dot + 1 });
            }
        }
        if (moved.length === 0) return [];
        return closure(moved);
    };

    const eqItems = (a, b) => a.length === b.length && a.every((it, i) => it.pIdx === b[i].pIdx && it.dot === b[i].dot);

    const states = [closure([{ pIdx: 0, dot: 0 }])];
    const trans = {};
    const symbols = [...Array.from(terminals), ...Array.from(nonterminals)];

    changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < states.length; i++) {
            for (const sym of symbols) {
                const nextSet = gotoState(states[i], sym);
                if (nextSet.length > 0) {
                    let ex = states.findIndex(s => eqItems(s, nextSet));
                    if (ex === -1) {
                        states.push(nextSet);
                        ex = states.length - 1;
                        changed = true;
                    }
                    trans[`${i},${sym}`] = ex;
                }
            }
        }
    }

    // Build ACTION and GOTO tables
    const actionTable = {};
    const gotoTable = {};
    const conflicts = [];

    for (let i = 0; i < states.length; i++) {
        for (const it of states[i]) {
            const p = augProductions[it.pIdx];
            if (it.dot < p.rhs.length) {
                const a = p.rhs[it.dot];
                if (terminals.has(a)) {
                    const j = trans[`${i},${a}`];
                    if (j !== undefined) {
                        const key = `${i},${a}`;
                        if (!actionTable[key]) actionTable[key] = [];
                        if (!actionTable[key].some(x => x.type === 's' && x.val === j)) {
                            actionTable[key].push({ type: 's', val: j });
                        }
                    }
                }
            } else {
                if (it.pIdx === 0) {
                    const key = `${i},$`;
                    if (!actionTable[key]) actionTable[key] = [];
                    actionTable[key].push({ type: 'acc', val: 0 });
                } else {
                    for (const a of follow[p.lhs]) {
                        const key = `${i},${a}`;
                        if (!actionTable[key]) actionTable[key] = [];
                        if (!actionTable[key].some(x => x.type === 'r' && x.val === it.pIdx)) {
                            actionTable[key].push({ type: 'r', val: it.pIdx });
                        }
                    }
                }
            }
        }

        for (const nt of nonterminals) {
            const j = trans[`${i},${nt}`];
            if (j !== undefined) gotoTable[`${i},${nt}`] = j;
        }
    }

    // Check for conflicts
    for (const [k, acts] of Object.entries(actionTable)) {
        if (acts.length > 1) {
            const hasShift = acts.some(a => a.type === 's');
            const hasReduce = acts.some(a => a.type === 'r');
            const cType = (hasShift && hasReduce) ? "Shift/Reduce" : "Reduce/Reduce";
            conflicts.push(`${cType} in state ${k.split(",")[0]} on '${k.split(",")[1]}'`);
        }
    }

    return {
        ok: true,
        productions,
        augProductions,
        startSymbol,
        nonterminals,
        terminals,
        first,
        follow,
        states,
        actionTable,
        gotoTable,
        conflicts
    };
}

function tokenizeInput(str, terminals) {
    const s = str.trim();
    if (!s) return { ok: false, error: "Input string is empty. The grammar has no epsilon rules." };
    if (s.includes("$")) return { ok: false, error: "'$' is reserved as the end marker and cannot appear in input." };

    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
        for (const p of parts) {
            if (!terminals.has(p)) return { ok: false, error: `Unknown token "${p}". Recognized terminals are: { ${Array.from(terminals).join(", ")} }` };
        }
        return { ok: true, tokens: parts };
    }

    if (parts.length === 1) {
        const tok = parts[0];
        if (terminals.has(tok)) return { ok: true, tokens: [tok] };

        // Decompose single-character terminals
        const allSingle = Array.from(terminals).every(t => t.length === 1);
        if (allSingle) {
            const tokens = [];
            for (const ch of tok) {
                if (!terminals.has(ch)) return { ok: false, error: `Unknown terminal character "${ch}".` };
                tokens.push(ch);
            }
            return { ok: true, tokens };
        }
        return { ok: false, error: `Unrecognized token "${tok}". Please separate symbols with spaces.` };
    }
    return { ok: false, error: "No valid input tokens detected." };
}

function simulateSLR1(g, tokens, maxSteps = 1000) {
    const stateStack = [0];
    const symbolStack = ["$"];
    const inputBuf = [...tokens, "$"];
    let inputIdx = 0;
    let stepNum = 1;
    const steps = [];

    while (stepNum <= maxSteps) {
        const curState = stateStack[stateStack.length - 1];
        const lookahead = inputBuf[inputIdx];
        const rem = inputBuf.slice(inputIdx);

        const actions = g.actionTable[`${curState},${lookahead}`] || [];
        if (actions.length === 0) {
            steps.push({
                step: stepNum,
                stack: [...symbolStack],
                states: [...stateStack],
                remaining: [...rem],
                action: "ERROR",
                action_type: "ERROR",
                explanation: `Syntax error in State ${curState} on token '${lookahead}'.`
            });
            return { accepted: false, status: "REJECTED (SYNTAX ERROR)", steps, errorMessage: `Syntax error in State ${curState} on token '${lookahead}'` };
        }

        // Conflict resolution: prefer shift, lowest ID for reduce
        let chosen = actions[0];
        if (actions.length > 1) {
            const shiftAct = actions.find(a => a.type === 's');
            if (shiftAct) chosen = shiftAct;
            else chosen = [...actions].sort((a, b) => a.val - b.val)[0];
        }

        // 1. SHIFT
        if (chosen.type === 's') {
            const nextState = chosen.val;
            steps.push({
                step: stepNum,
                stack: [...symbolStack],
                states: [...stateStack],
                remaining: [...rem],
                action: `SHIFT (s${nextState})`,
                action_type: "SHIFT",
                explanation: `Shift token '${lookahead}' onto stack and enter State ${nextState}`
            });

            symbolStack.push(lookahead);
            stateStack.push(nextState);
            inputIdx++;
            stepNum++;
            continue;
        }

        // 2. REDUCE
        if (chosen.type === 'r') {
            const pIdx = chosen.val;
            const prod = g.augProductions[pIdx];
            const rhsLen = prod.rhs.length;

            const stateAfterPop = stateStack[stateStack.length - 1 - rhsLen];
            const nextGoto = g.gotoTable[`${stateAfterPop},${prod.lhs}`];

            steps.push({
                step: stepNum,
                stack: [...symbolStack],
                states: [...stateStack],
                remaining: [...rem],
                action: `REDUCE (${prod.lhs} -> ${prod.rhs.join(" ")})`,
                action_type: "REDUCE",
                explanation: `Reduce '${prod.rhs.join(" ")}' to ${prod.lhs} using rule (${pIdx}); goto State ${nextGoto}`
            });

            for (let i = 0; i < rhsLen; i++) {
                symbolStack.pop();
                stateStack.pop();
            }

            symbolStack.push(prod.lhs);
            stateStack.push(nextGoto);
            stepNum++;
            continue;
        }

        // 3. ACCEPT
        if (chosen.type === 'acc') {
            steps.push({
                step: stepNum,
                stack: [...symbolStack],
                states: [...stateStack],
                remaining: [...rem],
                action: "ACCEPT",
                action_type: "ACCEPT",
                explanation: `Accepted: '${g.startSymbol}' on stack with end marker '$'`
            });
            return { accepted: true, status: "ACCEPTED", steps, errorMessage: "" };
        }
    }

    return { accepted: false, status: "REJECTED (STEP LIMIT EXCEEDED)", steps, errorMessage: "Step limit exceeded" };
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
