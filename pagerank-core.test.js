const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAdjacency,
  buildTransition,
  buildGoogle,
  matMul,
  identityMatrix,
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

test('matMul multiplies two matrices correctly', () => {
  const A = [[1, 2], [3, 4]];
  const B = [[5, 6], [7, 8]];
  assert.deepEqual(matMul(A, B), [[19, 22], [43, 50]]);
});

test('identityMatrix returns I of the given size', () => {
  assert.deepEqual(identityMatrix(3), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});

test('buildGoogle blends transition matrix with teleport term; columns sum to 1', () => {
  const nodes = [N('a'), N('b'), N('c')];
  const links = [L('a', 'b'), L('a', 'c'), L('b', 'c'), L('c', 'a')];
  const G = buildGoogle(nodes, links, 0.85);
  // G[i][j] = d*M[i][j] + (1-d)/n
  const M = buildTransition(nodes, links);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs(G[i][j] - (0.85 * M[i][j] + 0.15 / 3)) < 1e-12);
    }
  }
  for (let j = 0; j < 3; j++) {
    const colSum = G[0][j] + G[1][j] + G[2][j];
    assert.ok(Math.abs(colSum - 1) < 1e-12, `column ${j} sums to 1`);
  }
});

test('G^t applied to r(0) matches t repeated stepPageRank calls', () => {
  const nodes = [N('a'), N('b'), N('c')];
  const links = [L('a', 'b'), L('a', 'c'), L('b', 'c'), L('c', 'a')];
  const d = 0.85;
  const M = buildTransition(nodes, links);
  const G = buildGoogle(nodes, links, d);
  let power = identityMatrix(3);
  let r = initRankVector(3);
  for (let t = 0; t < 5; t++) {
    power = matMul(G, power);
    r = stepPageRank(M, r, d);
  }
  const viaPower = power.map((row) => row.reduce((sum, v, j) => sum + v / 3, 0));
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(viaPower[i] - r[i]) < 1e-12, `component ${i} matches`);
  }
});

test('maxDelta returns the largest absolute per-index difference', () => {
  assert.ok(Math.abs(maxDelta([0.1, 0.5, 0.4], [0.15, 0.5, 0.35]) - 0.05) < 1e-9);
});

test('isConverged is true once delta drops below epsilon', () => {
  assert.equal(isConverged(0.00005, 10, { epsilon: 0.0001, maxIterations: 100 }), true);
  assert.equal(isConverged(0.01, 10, { epsilon: 0.0001, maxIterations: 100 }), false);
});

test('isConverged is true once maxIterations is reached regardless of delta', () => {
  assert.equal(isConverged(0.5, 100, { epsilon: 0.0001, maxIterations: 100 }), true);
});

test('PRESETS has exactly hub/newsEcosystem/spamFarm/textbook, each with valid link endpoints', () => {
  const keys = Object.keys(PRESETS).sort();
  assert.deepEqual(keys, ['hub', 'newsEcosystem', 'spamFarm', 'textbook']);
  const maxNodes = { hub: 10, spamFarm: 10, textbook: 10, newsEcosystem: 60 };
  for (const key of keys) {
    const preset = PRESETS[key];
    assert.ok(preset.nodes.length >= 3 && preset.nodes.length <= maxNodes[key], `${key} node count in range`);
    const ids = new Set(preset.nodes.map((n) => n.id));
    for (const link of preset.links) {
      assert.ok(ids.has(link.source), `${key} link source exists`);
      assert.ok(ids.has(link.target), `${key} link target exists`);
    }
  }
});
