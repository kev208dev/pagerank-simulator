# MiniRank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MiniRank, a two-file offline PageRank teaching demo (`index.html` + `pagerank-core.js`) per the approved design spec.

**Architecture:** Pure PageRank math (matrix building, power iteration, presets) lives in `pagerank-core.js`, dual-loaded by Node (for unit tests) and the browser (via `<script src>`). Everything else — Canvas graph renderer, matrix DOM panel, controls, rank table, convergence chart, presentation mode — lives inline in `index.html`'s single `<script>` block, appended section by section across tasks. No build step, no external requests; double-clicking `index.html` must fully work.

**Tech Stack:** Vanilla JS, Canvas 2D, plain CSS (custom properties for theming). Node's built-in `node:test` for the math module only — Canvas/DOM tasks are verified manually in a browser since they aren't meaningfully unit-testable without heavy mocking.

**Note on TDD scope:** Only `pagerank-core.js` (pure functions) gets automated tests. Visual/interaction tasks (Canvas drawing, drag, DOM panels) are verified by manually opening `index.html` and exercising the feature — call this out explicitly per task instead of pretending to unit-test a canvas.

---

## File Structure

- Create: `pagerank-core.js` — pure PageRank math, dual CommonJS/browser export
- Create: `pagerank-core.test.js` — `node:test` unit tests for the above
- Create: `index.html` — everything else (markup, CSS, app JS), loads `pagerank-core.js` via relative `<script src>`
- Create: `README.md` — how to open/run, one paragraph
- Create: `.gitignore` — `node_modules/` (in case anyone runs a test runner via npm later)

---

### Task 1: Core PageRank math module (TDD)

**Files:**
- Create: `pagerank-core.js`
- Test: `pagerank-core.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// pagerank-core.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAdjacency,
  buildTransition,
  initRankVector,
  stepPageRank,
  maxDelta,
  isConverged,
  PRESETS,
} = require('./pagerank-core.js');

const N = (id) => ({ id, name: id });
const L = (source, target) => ({ source, target });

test('buildAdjacency marks A[target][source] = 1 for each link', () => {
  const nodes = [N('a'), N('b'), N('c')];
  const links = [L('a', 'b'), L('b', 'c'), L('c', 'a')];
  const m = buildAdjacency(nodes, links);
  assert.deepEqual(m, [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ]);
});

test('buildTransition splits outbound links evenly across a page\'s outdegree', () => {
  // A -> B, A -> C, B -> C, C -> A
  const nodes = [N('a'), N('b'), N('c')];
  const links = [L('a', 'b'), L('a', 'c'), L('b', 'c'), L('c', 'a')];
  const m = buildTransition(nodes, links);
  assert.deepEqual(m, [
    [0, 0, 1],
    [0.5, 0, 0],
    [0.5, 1, 0],
  ]);
});

test('buildTransition fills a dangling node\'s column with 1/n', () => {
  // A -> B, B has no outlinks, C -> A
  const nodes = [N('a'), N('b'), N('c')];
  const links = [L('a', 'b'), L('c', 'a')];
  const m = buildTransition(nodes, links);
  const third = 1 / 3;
  assert.deepEqual(m[0], [0, third, 1]);
  assert.deepEqual(m[1], [1, third, 0]);
  assert.deepEqual(m[2], [0, third, 0]);
});

test('initRankVector returns a uniform 1/n vector', () => {
  assert.deepEqual(initRankVector(4), [0.25, 0.25, 0.25, 0.25]);
});

test('stepPageRank matches hand-computed values for a 3-node asymmetric graph', () => {
  const nodes = [N('a'), N('b'), N('c')];
  const links = [L('a', 'b'), L('a', 'c'), L('b', 'c'), L('c', 'a')];
  const m = buildTransition(nodes, links);
  const r0 = initRankVector(3);
  const r1 = stepPageRank(m, r0, 0.85);
  assert.ok(Math.abs(r1[0] - 0.333333333) < 1e-8);
  assert.ok(Math.abs(r1[1] - 0.191666667) < 1e-8);
  assert.ok(Math.abs(r1[2] - 0.475) < 1e-8);
  const sum = r1.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-8);
});

test('maxDelta returns the largest absolute per-index difference', () => {
  assert.equal(maxDelta([0.1, 0.5, 0.4], [0.15, 0.5, 0.35]), 0.05);
});

test('isConverged is true once delta drops below epsilon', () => {
  assert.equal(isConverged(0.00005, 10, { epsilon: 0.0001, maxIterations: 100 }), true);
  assert.equal(isConverged(0.01, 10, { epsilon: 0.0001, maxIterations: 100 }), false);
});

test('isConverged is true once maxIterations is reached regardless of delta', () => {
  assert.equal(isConverged(0.5, 100, { epsilon: 0.0001, maxIterations: 100 }), true);
});

test('PRESETS has exactly balanced/hub/spamFarm, each with 3-10 nodes and valid link endpoints', () => {
  const keys = Object.keys(PRESETS).sort();
  assert.deepEqual(keys, ['balanced', 'hub', 'spamFarm']);
  for (const key of keys) {
    const preset = PRESETS[key];
    assert.ok(preset.nodes.length >= 3 && preset.nodes.length <= 10, `${key} node count in range`);
    const ids = new Set(preset.nodes.map((n) => n.id));
    for (const link of preset.links) {
      assert.ok(ids.has(link.source), `${key} link source exists`);
      assert.ok(ids.has(link.target), `${key} link target exists`);
    }
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test pagerank-core.test.js`
Expected: FAIL — `Cannot find module './pagerank-core.js'`

- [ ] **Step 3: Implement `pagerank-core.js`**

```js
'use strict';

function buildAdjacency(nodes, links) {
  const n = nodes.length;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const link of links) {
    const from = index.get(link.source);
    const to = index.get(link.target);
    if (from === undefined || to === undefined) continue;
    matrix[to][from] = 1;
  }
  return matrix;
}

function buildTransition(nodes, links) {
  const n = nodes.length;
  const adjacency = buildAdjacency(nodes, links);
  const outDegree = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) outDegree[j] += adjacency[i][j];
  }
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    if (outDegree[j] === 0) {
      for (let i = 0; i < n; i++) matrix[i][j] = 1 / n;
    } else {
      for (let i = 0; i < n; i++) matrix[i][j] = adjacency[i][j] / outDegree[j];
    }
  }
  return matrix;
}

function initRankVector(n) {
  return new Array(n).fill(1 / n);
}

function stepPageRank(matrix, r, damping) {
  const n = r.length;
  const next = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += matrix[i][j] * r[j];
    next[i] = damping * sum + (1 - damping) / n;
  }
  return next;
}

function maxDelta(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

function isConverged(delta, iteration, { epsilon = 0.0001, maxIterations = 100 } = {}) {
  return delta < epsilon || iteration >= maxIterations;
}

const PRESETS = {
  balanced: {
    label: '균형 잡힌 기본 네트워크',
    nodes: [
      { id: 'naver', name: '네이버' },
      { id: 'school', name: '학교 홈페이지' },
      { id: 'blog', name: '내 블로그' },
      { id: 'youtube', name: '유튜브' },
      { id: 'wiki', name: '위키백과' },
      { id: 'insta', name: '인스타그램' },
    ],
    links: [
      { source: 'naver', target: 'wiki' },
      { source: 'school', target: 'wiki' },
      { source: 'blog', target: 'youtube' },
      { source: 'youtube', target: 'wiki' },
      { source: 'insta', target: 'naver' },
      { source: 'wiki', target: 'school' },
      { source: 'school', target: 'blog' },
      { source: 'blog', target: 'insta' },
    ],
  },
  hub: {
    label: '허브 구조 (백링크 집중)',
    nodes: [
      { id: 'naver', name: '네이버' },
      { id: 'school', name: '학교 홈페이지' },
      { id: 'blog', name: '내 블로그' },
      { id: 'youtube', name: '유튜브' },
      { id: 'wiki', name: '위키백과' },
      { id: 'insta', name: '인스타그램' },
    ],
    links: [
      { source: 'naver', target: 'wiki' },
      { source: 'school', target: 'wiki' },
      { source: 'blog', target: 'wiki' },
      { source: 'youtube', target: 'wiki' },
      { source: 'insta', target: 'wiki' },
      { source: 'wiki', target: 'naver' },
    ],
  },
  spamFarm: {
    label: '스팸 팜',
    nodes: [
      { id: 'naver', name: '네이버' },
      { id: 'school', name: '학교 홈페이지' },
      { id: 'blog', name: '내 블로그' },
      { id: 'spam1', name: '스팸사이트1' },
      { id: 'spam2', name: '스팸사이트2' },
      { id: 'spam3', name: '스팸사이트3' },
    ],
    links: [
      { source: 'naver', target: 'school' },
      { source: 'school', target: 'blog' },
      { source: 'blog', target: 'naver' },
      { source: 'spam1', target: 'spam2' },
      { source: 'spam2', target: 'spam3' },
      { source: 'spam3', target: 'spam1' },
    ],
  },
};

const PageRankCore = {
  buildAdjacency,
  buildTransition,
  initRankVector,
  stepPageRank,
  maxDelta,
  isConverged,
  PRESETS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PageRankCore;
} else {
  window.PageRankCore = PageRankCore;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test pagerank-core.test.js`
Expected: PASS, 9/9 tests green

- [ ] **Step 5: Commit**

```bash
git add pagerank-core.js pagerank-core.test.js
git commit -m "feat: add PageRank math core with tests"
```

---

### Task 2: HTML shell, CSS theme, base layout

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write `index.html` skeleton with full CSS**

Grid layout per spec section "UI 레이아웃": header, main (graph canvas + right column with matrix/rank panels), controls bar, chart strip. CSS custom properties drive light/dark and presentation-mode scaling.

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MiniRank — 행렬로 재현하는 구글 검색</title>
<style>
  :root {
    --bg: #f4f5f8;
    --panel-bg: #ffffff;
    --text: #1a1d29;
    --muted: #6b7280;
    --border: #e2e4ea;
    --accent: #4f46e5;
    --accent-2: #06b6d4;
    --rank-1: #f5b700;
    --shadow: 0 1px 3px rgba(20, 20, 40, 0.08), 0 1px 2px rgba(20,20,40,0.04);
    --radius: 14px;
    --scale: 1;
  }
  :root[data-theme="dark"] {
    --bg: #14151f;
    --panel-bg: #1c1e2b;
    --text: #eef0f6;
    --muted: #8b8fa3;
    --border: #2c2f42;
    --shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, "Pretendard", "Apple SD Gothic Neo", "Segoe UI", sans-serif;
    font-size: calc(15px * var(--scale));
    display: flex;
    flex-direction: column;
    min-width: 1100px;
  }
  header {
    padding: 14px 24px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    border-bottom: 1px solid var(--border);
    background: var(--panel-bg);
  }
  header h1 { font-size: calc(1.15rem * var(--scale)); margin: 0; }
  header p { margin: 0; color: var(--muted); font-size: calc(0.85rem * var(--scale)); }
  main {
    flex: 1;
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
    padding: 16px 24px;
    min-height: 0;
  }
  .panel {
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .panel-title {
    padding: 10px 16px;
    font-weight: 600;
    font-size: calc(0.85rem * var(--scale));
    color: var(--muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  #graphPanel canvas { display: block; width: 100%; height: 100%; cursor: grab; }
  .rightCol { display: flex; flex-direction: column; gap: 16px; min-height: 0; }
  #matrixPanel { flex: 0 0 auto; max-height: 46%; }
  #rankPanel { flex: 1; min-height: 0; }
  .matrix-body { overflow: auto; padding: 12px 16px; }
  table.matrix { border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: calc(0.82rem * var(--scale)); }
  table.matrix th, table.matrix td {
    width: calc(46px * var(--scale)); height: calc(30px * var(--scale));
    text-align: center; border: 1px solid var(--border); transition: background 0.15s;
  }
  table.matrix th { color: var(--muted); font-weight: 500; }
  table.matrix td.highlight { background: var(--accent); color: #fff; }
  table.matrix td.dim { opacity: 0.35; }
  #rankList { list-style: none; margin: 0; padding: 10px; overflow: auto; flex: 1; }
  #rankList li {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 10px;
    transition: transform 0.35s ease;
  }
  #rankList .pos { width: 1.6em; font-weight: 700; color: var(--muted); }
  #rankList .swatch { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  #rankList .name { flex: 1; }
  #rankList .value { font-variant-numeric: tabular-nums; color: var(--muted); }
  .controls {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 12px 24px; border-top: 1px solid var(--border); background: var(--panel-bg);
    font-size: calc(0.88rem * var(--scale));
  }
  .controls button, .controls select {
    font: inherit; padding: 7px 14px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer;
  }
  .controls button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .controls button:disabled { opacity: 0.4; cursor: not-allowed; }
  .controls .damping { display: flex; align-items: center; gap: 8px; }
  .controls .spacer { flex: 1; }
  #chartPanel { height: 220px; margin: 0 24px 16px; }
  #chartPanel canvas { width: 100%; height: 100%; display: block; }
  .badge {
    font-size: calc(0.78rem * var(--scale)); padding: 2px 8px; border-radius: 999px;
    background: var(--bg); color: var(--muted); border: 1px solid var(--border);
  }
</style>
</head>
<body>
  <header>
    <h1>MiniRank</h1>
    <p>행렬로 재현하는 구글 검색의 핵심</p>
  </header>
  <main>
    <section id="graphPanel" class="panel">
      <div class="panel-title">
        <span>미니 인터넷</span>
        <span id="linkModeBadge" class="badge">이동 모드</span>
      </div>
      <canvas id="graphCanvas"></canvas>
    </section>
    <div class="rightCol">
      <section id="matrixPanel" class="panel">
        <div class="panel-title">
          <span id="matrixTitle">전이행렬 M</span>
          <button id="matrixToggle">인접행렬 보기</button>
        </div>
        <div class="matrix-body"><table class="matrix" id="matrixTable"></table></div>
      </section>
      <section id="rankPanel" class="panel">
        <div class="panel-title">
          <span>순위표</span>
          <span id="convergeBadge" class="badge">반복 0회</span>
        </div>
        <ol id="rankList"></ol>
      </section>
    </div>
  </main>
  <div class="controls">
    <select id="presetSelect">
      <option value="balanced">프리셋: 균형 네트워크</option>
      <option value="hub">프리셋: 허브 구조</option>
      <option value="spamFarm">프리셋: 스팸 팜</option>
    </select>
    <button id="addNodeBtn">노드 추가</button>
    <button id="removeNodeBtn">노드 삭제</button>
    <button id="linkModeBtn">링크 추가 모드</button>
    <button id="resetBtn">초기화</button>
    <span class="spacer"></span>
    <label class="damping">감쇠계수 d: <input type="range" id="dampingSlider" min="0.5" max="1.0" step="0.01" value="0.85"><span id="dampingValue">0.85</span></label>
    <button id="stepBtn">다음 단계</button>
    <button id="autoBtn" class="primary">계산 시작</button>
    <button id="presentBtn">발표 모드</button>
    <button id="darkBtn">다크 모드</button>
  </div>
  <section id="chartPanel" class="panel">
    <canvas id="chartCanvas"></canvas>
  </section>
  <script src="pagerank-core.js"></script>
  <script>
  'use strict';
  // === Section anchors filled in by later tasks: State, Layout, GraphRenderer,
  // Interaction, MatrixPanel, Highlight, Engine+Controls, RankTable, Chart,
  // Presets, PresentationMode ===
  </script>
</body>
</html>
```

- [ ] **Step 2: Manual verification**

Open `index.html` directly in a browser (double-click or `open index.html`). Expected: header, empty graph panel, matrix/rank panels, controls bar, chart strip all visible with clean card styling; no console errors; `window.PageRankCore` is defined (check devtools console).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add HTML shell, theme, and grid layout"
```

---

### Task 3: App state, circular layout, canvas sizing

**Files:**
- Modify: `index.html` (inline `<script>`, replace the anchor comment)

- [ ] **Step 1: Add state object and layout helper**

```js
const els = {
  graphCanvas: document.getElementById('graphCanvas'),
  matrixTable: document.getElementById('matrixTable'),
  matrixTitle: document.getElementById('matrixTitle'),
  matrixToggle: document.getElementById('matrixToggle'),
  rankList: document.getElementById('rankList'),
  convergeBadge: document.getElementById('convergeBadge'),
  presetSelect: document.getElementById('presetSelect'),
  addNodeBtn: document.getElementById('addNodeBtn'),
  removeNodeBtn: document.getElementById('removeNodeBtn'),
  linkModeBtn: document.getElementById('linkModeBtn'),
  linkModeBadge: document.getElementById('linkModeBadge'),
  resetBtn: document.getElementById('resetBtn'),
  dampingSlider: document.getElementById('dampingSlider'),
  dampingValue: document.getElementById('dampingValue'),
  stepBtn: document.getElementById('stepBtn'),
  autoBtn: document.getElementById('autoBtn'),
  presentBtn: document.getElementById('presentBtn'),
  darkBtn: document.getElementById('darkBtn'),
  chartCanvas: document.getElementById('chartCanvas'),
};

const NODE_POOL = ['네이버', '학교 홈페이지', '내 블로그', '유튜브', '위키백과', '인스타그램', '디시인사이드', '넷플릭스', '트위터', '카카오톡'];

const state = {
  nodes: [],       // {id, name, x, y, r, displayR, color}
  links: [],       // {source, target}
  damping: 0.85,
  iteration: 0,
  rank: [],
  rankHistory: [], // [{iteration, values: {id: rank}}]
  converged: false,
  running: false,
  linkMode: false,
  pendingSource: null,
  selectedNode: null,
  highlighted: { type: null, a: null, b: null },
  matrixView: 'transition',
  presentation: false,
  dark: false,
};

function applyCircularLayout() {
  const cx = els.graphCanvas.clientWidth / 2;
  const cy = els.graphCanvas.clientHeight / 2;
  const radius = Math.min(cx, cy) * 0.72;
  const n = state.nodes.length;
  state.nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    node.x = cx + radius * Math.cos(angle);
    node.y = cy + radius * Math.sin(angle);
  });
}

function loadPreset(key) {
  const preset = PageRankCore.PRESETS[key];
  state.nodes = preset.nodes.map((n) => ({ ...n, r: 34, displayR: 34, color: '#999' }));
  state.links = preset.links.map((l) => ({ ...l }));
  state.selectedNode = null;
  state.pendingSource = null;
  resizeCanvas();
  applyCircularLayout();
  resetComputation();
}

function nextPoolName() {
  const used = new Set(state.nodes.map((n) => n.name));
  return NODE_POOL.find((name) => !used.has(name)) || `페이지${state.nodes.length + 1}`;
}

function resizeCanvas() {
  for (const [canvas] of [[els.graphCanvas], [els.chartCanvas]]) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
window.addEventListener('resize', () => { resizeCanvas(); applyCircularLayout(); });
```

- [ ] **Step 2: Manual verification**

Add a temporary `console.log(state)` after a `loadPreset('balanced')` call (remove before commit — the real wiring lands in Task 13, this is just to confirm the helpers work). Open in browser, confirm `state.nodes` has 6 entries with `x`/`y` populated in a circle and no console errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add app state, circular layout, canvas sizing"
```

---

### Task 4: Canvas graph renderer

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add render loop drawing nodes + arrows**

```js
const RANK_COLORS = ['#f5b700', '#f2994a', '#eb5757', '#bb6bd9', '#6fcf97', '#4f46e5', '#2f80ed', '#56ccf2', '#9b9b9b', '#c4c4c4'];

function sortedByRank() {
  return [...state.nodes].sort((a, b) => (rankOf(b.id) - rankOf(a.id)));
}
function rankOf(id) {
  const i = state.nodes.findIndex((n) => n.id === id);
  return state.rank[i] ?? 0;
}

function updateNodeVisuals() {
  const order = sortedByRank();
  const values = state.rank.length ? state.rank : state.nodes.map(() => 1 / state.nodes.length);
  const min = Math.min(...values), max = Math.max(...values);
  state.nodes.forEach((node) => {
    const v = rankOf(node.id);
    const t = max > min ? (v - min) / (max - min) : 0.5;
    node.r = 24 + t * 40;
    node.displayR = node.displayR ?? node.r;
    node.color = RANK_COLORS[order.findIndex((n) => n.id === node.id) % RANK_COLORS.length];
  });
}

function drawArrow(ctx, x1, y1, x2, y2, r2, color, dimmed) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const startX = x1 + Math.cos(angle) * (24);
  const startY = y1 + Math.sin(angle) * (24);
  const endX = x2 - Math.cos(angle) * (r2 + 4);
  const endY = y2 - Math.sin(angle) * (r2 + 4);
  ctx.strokeStyle = color;
  ctx.globalAlpha = dimmed ? 0.2 : 0.75;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  const headLen = 9;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function renderGraph() {
  const ctx = els.graphCanvas.getContext('2d');
  const w = els.graphCanvas.clientWidth, h = els.graphCanvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();

  for (const link of state.links) {
    const a = state.nodes.find((n) => n.id === link.source);
    const b = state.nodes.find((n) => n.id === link.target);
    if (!a || !b) continue;
    const isHi = state.highlighted.type === 'link' && state.highlighted.a === link.source && state.highlighted.b === link.target;
    const anyHi = state.highlighted.type !== null;
    drawArrow(ctx, a.x, a.y, b.x, b.y, b.displayR, isHi ? '#4f46e5' : borderColor, anyHi && !isHi);
  }

  for (const node of state.nodes) {
    node.displayR += (node.r - node.displayR) * 0.15;
    const isHi = state.highlighted.type === 'node' && state.highlighted.a === node.id;
    const isSelected = state.selectedNode === node.id;
    const isPending = state.pendingSource === node.id;
    const anyHi = state.highlighted.type !== null;

    ctx.globalAlpha = anyHi && !isHi ? 0.35 : 1;
    const grad = ctx.createRadialGradient(node.x - node.displayR * 0.3, node.y - node.displayR * 0.3, 2, node.x, node.y, node.displayR);
    grad.addColorStop(0, node.color);
    grad.addColorStop(1, shade(node.color, -18));
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.displayR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = node.color;
    ctx.shadowBlur = isHi || isSelected ? 22 : 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (isSelected || isPending) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = isPending ? '#06b6d4' : '#fff';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    ctx.font = `600 13px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.name, node.x, node.y);
  }
  requestAnimationFrame(renderGraph);
}

function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + percent));
  const b = Math.min(255, Math.max(0, (num & 255) + percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
```

- [ ] **Step 2: Manual verification**

Temporarily call `loadPreset('balanced'); updateNodeVisuals(); requestAnimationFrame(renderGraph);` at the bottom of the script (this temporary bootstrap gets replaced by the real one in Task 13). Open in browser: 6 gradient circles with Korean labels arranged in a circle, arrows between them pointing correctly with arrowheads at the target. No flicker, no console errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add canvas graph renderer with rank-based sizing and color"
```

---

### Task 5: Node drag + node select interaction

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add pointer handling**

```js
function nodeAt(x, y) {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const n = state.nodes[i];
    if (Math.hypot(n.x - x, n.y - y) <= n.displayR) return n;
  }
  return null;
}

function linkAt(x, y) {
  const THRESH = 6;
  for (const link of state.links) {
    const a = state.nodes.find((n) => n.id === link.source);
    const b = state.nodes.find((n) => n.id === link.target);
    if (!a || !b) continue;
    const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
    if (d <= THRESH) return link;
  }
  return null;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

let dragNode = null;
let dragMoved = false;

function canvasPoint(evt) {
  const rect = els.graphCanvas.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

els.graphCanvas.addEventListener('mousedown', (evt) => {
  const { x, y } = canvasPoint(evt);
  const node = nodeAt(x, y);
  if (node) {
    dragNode = node;
    dragMoved = false;
  }
});

els.graphCanvas.addEventListener('mousemove', (evt) => {
  const { x, y } = canvasPoint(evt);
  if (dragNode) {
    dragNode.x = x;
    dragNode.y = y;
    dragMoved = true;
    return;
  }
  const node = nodeAt(x, y);
  const link = node ? null : linkAt(x, y);
  if (node) state.highlighted = { type: 'node', a: node.id, b: null };
  else if (link) state.highlighted = { type: 'link', a: link.source, b: link.target };
  else state.highlighted = { type: null, a: null, b: null };
  els.graphCanvas.style.cursor = node ? 'pointer' : link ? 'pointer' : 'grab';
});

window.addEventListener('mouseup', (evt) => {
  if (dragNode && !dragMoved) {
    handleNodeClick(dragNode);
  }
  dragNode = null;
});

els.graphCanvas.addEventListener('click', (evt) => {
  if (dragMoved) return;
  const { x, y } = canvasPoint(evt);
  const node = nodeAt(x, y);
  if (node) return; // handled by mouseup->handleNodeClick to dedupe with drag
  const link = linkAt(x, y);
  if (link) {
    state.links = state.links.filter((l) => l !== link);
    recomputeAfterGraphChange();
    return;
  }
  state.selectedNode = null;
});

function handleNodeClick(node) {
  if (state.linkMode) {
    if (!state.pendingSource) {
      state.pendingSource = node.id;
    } else if (state.pendingSource === node.id) {
      state.pendingSource = null;
    } else {
      const exists = state.links.some((l) => l.source === state.pendingSource && l.target === node.id);
      if (!exists) state.links.push({ source: state.pendingSource, target: node.id });
      state.pendingSource = null;
      recomputeAfterGraphChange();
    }
  } else {
    state.selectedNode = state.selectedNode === node.id ? null : node.id;
  }
}
```

- [ ] **Step 2: Manual verification**

In browser: drag a node, confirm it follows the cursor and arrows update live. Hover a node/arrow, confirm `state.highlighted` changes (inspect via devtools) and the dimming effect from Task 4 kicks in. Click empty canvas, confirm no errors even though `recomputeAfterGraphChange` doesn't exist yet (define a temporary no-op stub `function recomputeAfterGraphChange(){}` for this step; Task 9 replaces it with the real implementation).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add node drag, selection, and link click-to-delete"
```

---

### Task 6: Link-add mode + node add/remove buttons

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Wire link-mode toggle and node count buttons**

```js
els.linkModeBtn.addEventListener('click', () => {
  state.linkMode = !state.linkMode;
  state.pendingSource = null;
  els.linkModeBtn.textContent = state.linkMode ? '링크 추가 모드 (끄기)' : '링크 추가 모드';
  els.linkModeBadge.textContent = state.linkMode ? '링크 추가 모드' : '이동 모드';
});

els.addNodeBtn.addEventListener('click', () => {
  if (state.nodes.length >= 10) return;
  const id = `n${Date.now()}`;
  state.nodes.push({ id, name: nextPoolName(), r: 34, displayR: 34, color: '#999' });
  applyCircularLayout();
  recomputeAfterGraphChange();
  syncNodeButtons();
});

els.removeNodeBtn.addEventListener('click', () => {
  if (state.nodes.length <= 3) return;
  const targetId = state.selectedNode || state.nodes[state.nodes.length - 1].id;
  state.nodes = state.nodes.filter((n) => n.id !== targetId);
  state.links = state.links.filter((l) => l.source !== targetId && l.target !== targetId);
  state.selectedNode = null;
  applyCircularLayout();
  recomputeAfterGraphChange();
  syncNodeButtons();
});

function syncNodeButtons() {
  els.addNodeBtn.disabled = state.nodes.length >= 10;
  els.removeNodeBtn.disabled = state.nodes.length <= 3;
}
```

- [ ] **Step 2: Manual verification**

Click "링크 추가 모드", click node A then node B, confirm a new arrow A→B appears and mode stays on for a second pair. Click "노드 추가" repeatedly until it disables at 10 nodes; click "노드 삭제" repeatedly until it disables at 3 nodes; confirm layout re-circles cleanly each time and no links point to a removed id.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add link-mode toggle and node add/remove controls"
```

---

### Task 7: Matrix panel (adjacency/transition DOM table)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Render matrix as a table, wire the view toggle**

```js
function fmt(v) {
  if (v === 0) return '0';
  const denom = Math.round(1 / v);
  return Math.abs(v - 1 / denom) < 1e-9 && denom > 1 ? `1/${denom}` : v.toFixed(2);
}

function renderMatrix() {
  const matrix = state.matrixView === 'adjacency'
    ? PageRankCore.buildAdjacency(state.nodes, state.links)
    : PageRankCore.buildTransition(state.nodes, state.links);
  els.matrixTitle.textContent = state.matrixView === 'adjacency' ? '인접행렬 A' : '전이행렬 M';
  els.matrixToggle.textContent = state.matrixView === 'adjacency' ? '전이행렬 보기' : '인접행렬 보기';

  const n = state.nodes.length;
  let html = '<tr><th></th>' + state.nodes.map((node) => `<th>${node.name.slice(0, 2)}</th>`).join('') + '</tr>';
  for (let i = 0; i < n; i++) {
    html += `<tr><th>${state.nodes[i].name.slice(0, 2)}</th>`;
    for (let j = 0; j < n; j++) {
      const value = state.matrixView === 'adjacency' ? matrix[i][j] : matrix[i][j];
      const isHi = isCellHighlighted(i, j);
      const dim = state.highlighted.type !== null && !isHi;
      html += `<td data-row="${i}" data-col="${j}" class="${isHi ? 'highlight' : ''} ${dim ? 'dim' : ''}">${fmt(value)}</td>`;
    }
    html += '</tr>';
  }
  els.matrixTable.innerHTML = html;
}

function isCellHighlighted(rowIdx, colIdx) {
  const h = state.highlighted;
  if (h.type === 'node') return state.nodes[rowIdx]?.id === h.a || state.nodes[colIdx]?.id === h.a;
  if (h.type === 'link') return state.nodes[colIdx]?.id === h.a && state.nodes[rowIdx]?.id === h.b;
  return false;
}

els.matrixToggle.addEventListener('click', () => {
  state.matrixView = state.matrixView === 'adjacency' ? 'transition' : 'adjacency';
  renderMatrix();
});
```

- [ ] **Step 2: Manual verification**

Load a preset, confirm the table shows fractions like `1/2` for transition view and `0`/`1` for adjacency view after toggling. Row/column count matches node count exactly.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add adjacency/transition matrix panel"
```

---

### Task 8: Bidirectional hover highlight (graph <-> matrix)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Drive matrix cell hover into `state.highlighted`, and re-render matrix on every graph hover change**

```js
els.matrixTable.addEventListener('mouseover', (evt) => {
  const cell = evt.target.closest('td[data-row]');
  if (!cell) return;
  const row = Number(cell.dataset.row), col = Number(cell.dataset.col);
  const targetNode = state.nodes[row], sourceNode = state.nodes[col];
  if (!targetNode || !sourceNode) return;
  state.highlighted = { type: 'link', a: sourceNode.id, b: targetNode.id };
  renderMatrix();
});
els.matrixTable.addEventListener('mouseleave', () => {
  state.highlighted = { type: null, a: null, b: null };
  renderMatrix();
});
```

Modify the `mousemove` handler added in Task 5 so it also calls `renderMatrix()` whenever `state.highlighted` changes (append `renderMatrix();` right after each of the three branches that assign `state.highlighted` in that handler).

- [ ] **Step 2: Manual verification**

Hover a graph node: confirm its row+column highlight in the matrix table. Hover a matrix cell: confirm the matching graph arrow glows and dims the rest. Move mouse off both: confirm highlight clears everywhere.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: sync hover highlight between graph and matrix panel"
```

---

### Task 9: PageRank engine wiring + step/auto/damping controls

**Files:**
- Modify: `index.html` (this task also defines the real `recomputeAfterGraphChange`, replacing the Task-5/6 stub)

- [ ] **Step 1: Implement engine functions and control wiring**

```js
function resetComputation() {
  state.iteration = 0;
  state.converged = false;
  state.rank = PageRankCore.initRankVector(state.nodes.length);
  state.rankHistory = [{ iteration: 0, values: snapshotRanks() }];
  state.running = false;
  els.autoBtn.textContent = '계산 시작';
  updateNodeVisuals();
  updateConvergeBadge();
  renderMatrix();
  renderRankList();
  renderChart();
}

function snapshotRanks() {
  const out = {};
  state.nodes.forEach((node, i) => { out[node.id] = state.rank[i]; });
  return out;
}

function stepOnce() {
  if (state.converged) return;
  const matrix = PageRankCore.buildTransition(state.nodes, state.links);
  const next = PageRankCore.stepPageRank(matrix, state.rank, state.damping);
  const delta = PageRankCore.maxDelta(state.rank, next);
  state.rank = next;
  state.iteration += 1;
  state.rankHistory.push({ iteration: state.iteration, values: snapshotRanks() });
  state.converged = PageRankCore.isConverged(delta, state.iteration);
  updateNodeVisuals();
  updateConvergeBadge();
  renderMatrix();
  renderRankList();
  renderChart();
  if (state.converged) stopAuto();
}

function recomputeAfterGraphChange() {
  resetComputation();
}

function updateConvergeBadge() {
  els.convergeBadge.textContent = state.converged
    ? `반복 ${state.iteration}회 (수렴)`
    : `반복 ${state.iteration}회`;
}

let autoTimer = null;
function startAuto() {
  if (state.converged) return;
  state.running = true;
  els.autoBtn.textContent = '일시정지';
  autoTimer = setInterval(() => {
    stepOnce();
    if (state.converged) stopAuto();
  }, 400);
}
function stopAuto() {
  state.running = false;
  els.autoBtn.textContent = '계산 시작';
  clearInterval(autoTimer);
  autoTimer = null;
}

els.stepBtn.addEventListener('click', () => { stopAuto(); stepOnce(); });
els.autoBtn.addEventListener('click', () => { state.running ? stopAuto() : startAuto(); });
els.dampingSlider.addEventListener('input', () => {
  state.damping = Number(els.dampingSlider.value);
  els.dampingValue.textContent = state.damping.toFixed(2);
  stopAuto();
  resetComputation();
});
```

- [ ] **Step 2: Manual verification**

Click "다음 단계" repeatedly: iteration counter increments, node sizes/colors shift each click, matrix stays correct. Click "계산 시작": auto-advances every 400ms and stops itself at convergence, badge shows "(수렴)". Drag the damping slider: computation resets to iteration 0 and restarts from the uniform vector. Edit the graph mid-run: confirms `recomputeAfterGraphChange` resets cleanly (no stale rank array length mismatch).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: wire PageRank engine to step/auto/damping controls"
```

---

### Task 10: Rank table panel

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Render sorted rank list with position-change transitions**

```js
function renderRankList() {
  const order = sortedByRank();
  els.rankList.innerHTML = order.map((node, i) => `
    <li>
      <span class="pos">${i + 1}</span>
      <span class="swatch" style="background:${node.color}"></span>
      <span class="name">${node.name}</span>
      <span class="value">${rankOf(node.id).toFixed(4)}</span>
    </li>
  `).join('');
}
```

CSS already has `#rankList li { transition: transform 0.35s ease; }` from Task 2; since the list is fully re-rendered each step (not reordered via DOM move), the browser's natural reflow won't animate position changes. Add a FLIP-lite pass: before re-rendering, record each row's current `top` via `getBoundingClientRect()`, then after rendering, apply an inverse `transform: translateY()` that animates to `0`.

```js
function renderRankListAnimated() {
  const prevRects = new Map();
  els.rankList.querySelectorAll('li[data-id]').forEach((li) => {
    prevRects.set(li.dataset.id, li.getBoundingClientRect().top);
  });
  const order = sortedByRank();
  els.rankList.innerHTML = order.map((node, i) => `
    <li data-id="${node.id}">
      <span class="pos">${i + 1}</span>
      <span class="swatch" style="background:${node.color}"></span>
      <span class="name">${node.name}</span>
      <span class="value">${rankOf(node.id).toFixed(4)}</span>
    </li>
  `).join('');
  els.rankList.querySelectorAll('li[data-id]').forEach((li) => {
    const prevTop = prevRects.get(li.dataset.id);
    if (prevTop === undefined) return;
    const newTop = li.getBoundingClientRect().top;
    const delta = prevTop - newTop;
    if (delta === 0) return;
    li.style.transform = `translateY(${delta}px)`;
    li.style.transition = 'none';
    requestAnimationFrame(() => {
      li.style.transition = 'transform 0.35s ease';
      li.style.transform = 'translateY(0)';
    });
  });
}
```

Replace the `renderRankList()` calls added in Task 9 with `renderRankListAnimated()`, and delete the plain `renderRankList` function to avoid two competing implementations.

- [ ] **Step 2: Manual verification**

Run a preset where ranks visibly swap order across a few steps (the `hub` preset works well). Confirm rows visibly slide to their new position instead of popping, and values update every step.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add animated rank table"
```

---

### Task 11: Convergence line chart

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Draw rankHistory as a Canvas line chart**

```js
function renderChart() {
  const ctx = els.chartCanvas.getContext('2d');
  const w = els.chartCanvas.clientWidth, h = els.chartCanvas.clientHeight;
  const pad = { l: 40, r: 16, t: 16, b: 26 };
  ctx.clearRect(0, 0, w, h);
  const history = state.rankHistory;
  if (history.length < 2) return;

  const maxIter = history[history.length - 1].iteration;
  const allValues = history.flatMap((point) => Object.values(point.values));
  const maxVal = Math.max(0.01, ...allValues);

  const xOf = (iter) => pad.l + (iter / Math.max(1, maxIter)) * (w - pad.l - pad.r);
  const yOf = (val) => h - pad.b - (val / maxVal) * (h - pad.t - pad.b);

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, h - pad.b);
  ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();

  const order = sortedByRank();
  state.nodes.forEach((node) => {
    const colorIdx = order.findIndex((n) => n.id === node.id);
    ctx.strokeStyle = RANK_COLORS[colorIdx % RANK_COLORS.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((point, i) => {
      const x = xOf(point.iteration), y = yOf(point.values[node.id] ?? 0);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`반복 횟수 (0-${maxIter})`, (pad.l + w - pad.r) / 2, h - 6);
}
```

- [ ] **Step 2: Manual verification**

Run "계산 시작" to convergence, confirm as many lines as there are nodes, each colored to match its node/rank-list swatch, all flattening out near convergence. Resize the browser window, confirm the chart redraws without distortion (relies on `resizeCanvas` from Task 3 firing on `resize`).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add convergence line chart"
```

---

### Task 12: Presets wiring + reset button

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Wire preset select and reset button; add real bootstrap (deletes temporary bootstraps from Tasks 3/4)**

```js
els.presetSelect.addEventListener('change', () => {
  stopAuto();
  loadPreset(els.presetSelect.value);
  syncNodeButtons();
});

els.resetBtn.addEventListener('click', () => {
  stopAuto();
  els.presetSelect.value = 'balanced';
  loadPreset('balanced');
  syncNodeButtons();
});

// Real bootstrap — replaces the temporary `loadPreset('balanced'); updateNodeVisuals();
// requestAnimationFrame(renderGraph);` lines added temporarily in Tasks 3-4.
resizeCanvas();
loadPreset('balanced');
syncNodeButtons();
requestAnimationFrame(renderGraph);
```

- [ ] **Step 2: Manual verification**

Switch the preset dropdown across all three options: confirm graph, matrix, rank list, and chart all reset to iteration 0 with the new topology each time. Click "초기화" after running a computation: confirms it snaps back to the balanced preset at iteration 0.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: wire preset selector and reset button, finalize bootstrap"
```

---

### Task 13: Presentation mode (scale, dark mode, keyboard shortcuts)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Wire toggles and shortcuts**

```js
els.presentBtn.addEventListener('click', () => {
  state.presentation = !state.presentation;
  document.documentElement.style.setProperty('--scale', state.presentation ? '1.35' : '1');
  els.presentBtn.textContent = state.presentation ? '발표 모드 (끄기)' : '발표 모드';
});

els.darkBtn.addEventListener('click', () => {
  state.dark = !state.dark;
  document.documentElement.setAttribute('data-theme', state.dark ? 'dark' : 'light');
  els.darkBtn.textContent = state.dark ? '라이트 모드' : '다크 모드';
});

window.addEventListener('keydown', (evt) => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (evt.code === 'Space') { evt.preventDefault(); stopAuto(); stepOnce(); }
  else if (evt.key === 'r' || evt.key === 'R') { els.resetBtn.click(); }
  else if (evt.key === 'a' || evt.key === 'A') { state.running ? stopAuto() : startAuto(); }
});
```

- [ ] **Step 2: Manual verification**

Click "발표 모드": fonts/nodes/matrix all scale up noticeably, layout stays intact (no overflow clipping at 1100px min-width). Click "다크 모드": background/panels/text swap to the dark palette instantly, chart/matrix stay legible. With focus on the canvas (not an input), press Space (steps once), R (resets), A (toggles auto-run). Click into the damping slider (an `<input>`) and press Space: confirm the shortcut is suppressed and the slider just moves normally.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add presentation mode, dark mode, and keyboard shortcuts"
```

---

### Task 14: README, final success-criteria pass, push

**Files:**
- Create: `README.md`
- Create: `.gitignore`

- [ ] **Step 1: Write README**

```markdown
# MiniRank

행렬로 재현하는 구글 검색의 핵심 — PageRank 인터랙티브 시각화 데모.

## 실행 방법

`index.html`을 브라우저로 열면 끝. 서버, 빌드, 인터넷 연결 전부 불필요.
(`pagerank-core.js`가 같은 폴더에 있어야 합니다.)

## 개발 시 테스트

```bash
node --test pagerank-core.test.js
```

## 조작법

- 노드 드래그: 위치 이동
- 링크 추가 모드 → 노드 A 클릭 → 노드 B 클릭: A→B 링크 생성
- 화살표 클릭: 링크 삭제
- 노드 추가/삭제, 프리셋 선택, 감쇠계수 슬라이더, 다음 단계/계산 시작 버튼
- 단축키: Space=다음 단계, R=초기화, A=자동 실행 토글
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 3: Run the full test suite one more time**

Run: `node --test pagerank-core.test.js`
Expected: PASS, 9/9

- [ ] **Step 4: Manual pass against PRD success criteria**

Open `index.html` fresh (close and reopen the file, not just reload, to catch any relative-path issues) and confirm each PRD §8 item:
- Add a link, delete a link, watch matrix + rank order update within ~10 seconds of clicking.
- Hover a matrix cell and a graph arrow, confirm instant bidirectional highlight.
- Click "다음 단계" once, confirm exactly one rank update happens (matches one matrix-vector multiply).
- Toggle 발표 모드, confirm node labels/numbers are readable at a glance from a simulated "back of room" browser zoom-out.
- Disconnect Wi-Fi (or open via `file://` with network off), reload, confirm everything still works.

- [ ] **Step 5: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: add README and gitignore"
```

- [ ] **Step 6: Add GitHub remote and push**

```bash
git remote add origin https://github.com/kev208dev/pagerank-simulator.git
git branch -M main
git push -u origin main
```

Expected: push succeeds, `main` branch visible at `https://github.com/kev208dev/pagerank-simulator`.

---

## Self-Review Notes

- **Spec coverage:** 3.1 graph editor → Tasks 3/5/6. 3.2 matrix panel → Task 7/8. 3.3 engine → Task 1/9. 3.4 visualization → Task 4/10/11. 3.5 presets → Task 1/12. 3.6 presentation mode → Task 13. 5.x math → Task 1 (tested). 6 layout → Task 2. 8 success criteria → Task 14 manual pass. All PRD P0/P1 checkboxes have a home.
- **No placeholders:** every step ships real code; the only "temporary" code (Task 3/4 bootstrap calls) is explicitly named and explicitly removed in Task 12, not left dangling.
- **Type/name consistency checked:** `state.highlighted = {type, a, b}` shape used identically in renderGraph (Task 4), matrix hover (Task 8), and isCellHighlighted (Task 7). `recomputeAfterGraphChange` stubbed in Task 5, real impl in Task 9 — same name both places. `renderRankList` (Task 9 draft) explicitly replaced by `renderRankListAnimated` in Task 10 with an explicit deletion instruction to avoid duplicate function bugs.
