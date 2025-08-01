"use strict";

let initOrder = require("./init-order");
let crossCount = require("./cross-count");
let sortSubgraph = require("./sort-subgraph");
let buildLayerGraph = require("./build-layer-graph");
let addSubgraphConstraints = require("./add-subgraph-constraints");
let Graph = require("@dagrejs/graphlib").Graph;
let util = require("../util");

module.exports = order;

/*
 * Applies heuristics to minimize edge crossings in the graph and sets the best
 * order solution as an order attribute on each node.
 *
 * Pre-conditions:
 *
 *    1. Graph must be DAG
 *    2. Graph nodes must be objects with a "rank" attribute
 *    3. Graph edges must have the "weight" attribute
 *
 * Post-conditions:
 *
 *    1. Graph nodes will have an "order" attribute based on the results of the
 *       algorithm.
 */
function order(g, opts) {
  if (opts && typeof opts.customOrder === 'function') {
    opts.customOrder(g, order);
    return;
  }

  let maxRank = util.maxRank(g),
    downLayerGraphs = buildLayerGraphs(g, util.range(1, maxRank + 1), "inEdges"),
    upLayerGraphs = buildLayerGraphs(g, util.range(maxRank - 1, -1, -1), "outEdges");

  let layering = initOrder(g);
  assignOrder(g, layering);

  if (opts && opts.disableOptimalOrderHeuristic) {
    return;
  }

  let bestCC = Number.POSITIVE_INFINITY,
    best;

  for (let i = 0, lastBest = 0; lastBest < 4; ++i, ++lastBest) {
    sweepLayerGraphs(i % 2 ? downLayerGraphs : upLayerGraphs, i % 4 >= 2);

    layering = util.buildLayerMatrix(g);
    let cc = crossCount(g, layering);
    if (cc < bestCC) {
      lastBest = 0;
      best = Object.assign({}, layering);
      bestCC = cc;
    }
  }

  assignOrder(g, best);
}

function buildLayerGraphs(g, ranks, relationship) {
  // Build an index mapping from rank to the nodes with that rank.
  // This helps to avoid a quadratic search for all nodes with the same rank as
  // the current node.
  const nodesByRank = new Map();
  const addNodeToRank = (rank, node) => {
    if (!nodesByRank.has(rank)) {
      nodesByRank.set(rank, []);
    }
    nodesByRank.get(rank).push(node);
  };

  // Visit the nodes in their original order in the graph, and add each
  // node to the ranks(s) that it belongs to.
  for (const v of g.nodes()) {
    const node = g.node(v);
    if (typeof node.rank === "number") {
      addNodeToRank(node.rank, v);
    }
    // If there is a range of ranks, add it to each, but skip the `node.rank` which
    // has already had the node added.
    if (typeof node.minRank === "number" && typeof node.maxRank === "number") {
      for (let r = node.minRank; r <= node.maxRank; r++) {
        if (r !== node.rank) {
          // Don't add this node to its `node.rank` twice.
          addNodeToRank(r, v);
        }
      }
    }
  }

  return ranks.map(function (rank) {
    return buildLayerGraph(g, rank, relationship, nodesByRank.get(rank) || []);
  });
}

function sweepLayerGraphs(layerGraphs, biasRight) {
  let cg = new Graph();
  layerGraphs.forEach(function(lg) {
    let root = lg.graph().root;
    let sorted = sortSubgraph(lg, root, cg, biasRight);
    sorted.vs.forEach((v, i) => lg.node(v).order = i);
    addSubgraphConstraints(lg, cg, sorted.vs);
  });
}

function assignOrder(g, layering) {
  Object.values(layering).forEach(layer => layer.forEach((v, i) => g.node(v).order = i));
}
