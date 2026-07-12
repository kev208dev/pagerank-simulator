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
  newsEcosystem: {
    label: '실제 사례: 포털-언론 생태계',
    nodes: [
      { id: 'portal', name: '포털' },
      { id: 'daily', name: '종합일간지' },
      { id: 'econ', name: '경제신문' },
      { id: 'itmedia', name: 'IT매체' },
      { id: 'ytnews', name: '유튜브뉴스' },
      { id: 'community', name: '커뮤니티' },
      { id: 'blogger', name: '블로거' },
      { id: 'sns', name: 'SNS' },
    ],
    links: [
      { source: 'daily', target: 'portal' },
      { source: 'econ', target: 'portal' },
      { source: 'itmedia', target: 'portal' },
      { source: 'ytnews', target: 'portal' },
      { source: 'sns', target: 'portal' },
      { source: 'sns', target: 'ytnews' },
      { source: 'community', target: 'daily' },
      { source: 'community', target: 'itmedia' },
      { source: 'blogger', target: 'itmedia' },
      { source: 'blogger', target: 'econ' },
      { source: 'portal', target: 'daily' },
      { source: 'portal', target: 'econ' },
      { source: 'itmedia', target: 'blogger' },
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
