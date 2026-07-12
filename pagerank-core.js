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

function isConverged(delta, iteration, { epsilon = 0.00001, maxIterations = 150 } = {}) {
  return delta < epsilon || iteration >= maxIterations;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Barabasi-Albert-style preferential attachment: each new site links to a
// couple of already-popular sites, so early sites snowball into hubs -
// the same "rich get richer" shape real web link graphs have.
function generateScaleFreeGraph(n, seed) {
  const rand = mulberry32(seed);
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `site${i + 1}`,
    name: `사이트${String(i + 1).padStart(2, '0')}`,
  }));
  const links = [];
  const linkKeys = new Set();
  const inDegree = new Array(n).fill(1);

  function addLink(from, to) {
    const key = `${from}->${to}`;
    if (from === to || linkKeys.has(key)) return false;
    linkKeys.add(key);
    links.push({ source: nodes[from].id, target: nodes[to].id });
    inDegree[to] += 1;
    return true;
  }

  addLink(1, 0);
  addLink(2, 0);
  addLink(2, 1);

  for (let i = 3; i < n; i++) {
    const linksToMake = rand() < 0.3 ? 3 : 2;
    let made = 0;
    let attempts = 0;
    while (made < linksToMake && attempts < 20) {
      attempts++;
      const totalWeight = inDegree.slice(0, i).reduce((a, b) => a + b, 0);
      let r = rand() * totalWeight;
      let target = 0;
      for (let j = 0; j < i; j++) {
        r -= inDegree[j];
        if (r <= 0) { target = j; break; }
      }
      if (addLink(i, target)) made++;
    }
  }

  return { label: '실제 사례: 웹 생태계 (노드 60개)', nodes, links };
}

const PRESETS = {
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
  textbook: {
    label: 'PPT 예시 (A~F)',
    nodes: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D' },
      { id: 'e', name: 'E' },
      { id: 'f', name: 'F' },
    ],
    links: [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'f' },
      { source: 'd', target: 'b' },
      { source: 'd', target: 'c' },
      { source: 'd', target: 'e' },
      { source: 'c', target: 'f' },
      { source: 'e', target: 'c' },
    ],
  },
  newsEcosystem: generateScaleFreeGraph(60, 42),
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
