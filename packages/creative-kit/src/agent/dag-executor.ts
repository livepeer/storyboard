/**
 * DAG Executor — parallel task execution with dependency management.
 *
 * Inspired by Claude Code's subagent pattern: plan a dependency graph,
 * execute independent tasks concurrently, wait at join points.
 *
 * Example: 6-scene story with video
 *   img-1 ──┐
 *   img-2 ──┤
 *   img-3 ──┼── [join: all images] ── vid-1 (from img-1)
 *   img-4 ──┤                     ── vid-2 (from img-2)
 *   img-5 ──┤                     ── vid-3 (from img-3)
 *   img-6 ──┘                     ── ...
 *
 * Without DAG: 6 images × 3s = 18s sequential
 * With DAG:    6 images ÷ 3 parallel = 6s, then 6 videos ÷ 3 = 12s = 18s total
 *              But with concurrency=3: 6s + 12s overlapped = ~14s
 */

export interface DAGNode<T = unknown> {
  /** Unique node ID */
  id: string;
  /** Node IDs this depends on (must complete before this starts) */
  dependsOn: string[];
  /** The task to execute. Receives results of dependencies. */
  execute: (deps: Map<string, T>) => Promise<T>;
  /** Human-readable label for tracing */
  label?: string;
}

export interface DAGResult<T = unknown> {
  /** Results keyed by node ID */
  results: Map<string, T>;
  /** Nodes that failed */
  errors: Map<string, Error>;
  /** Execution order (for tracing) */
  executionOrder: string[];
  /** Total elapsed time in ms */
  totalMs: number;
}

export interface DAGOptions {
  /** Max concurrent tasks (default: 4) */
  concurrency?: number;
  /** Called when a node starts */
  onNodeStart?: (id: string, label?: string) => void;
  /** Called when a node completes */
  onNodeComplete?: (id: string, elapsed_ms: number) => void;
  /** Called when a node fails */
  onNodeError?: (id: string, error: Error) => void;
  /** Cancellation signal */
  cancelled?: { cancelled: boolean };
}

/**
 * Execute a DAG of tasks with parallel scheduling.
 *
 * 1. Find all nodes with no pending dependencies → ready set
 * 2. Execute up to `concurrency` ready nodes in parallel
 * 3. When a node completes, check if it unblocks new nodes
 * 4. Repeat until all nodes are done or an error stops execution
 */
export async function executeDAG<T>(
  nodes: DAGNode<T>[],
  opts: DAGOptions = {},
): Promise<DAGResult<T>> {
  const concurrency = opts.concurrency ?? 4;
  const results = new Map<string, T>();
  const errors = new Map<string, Error>();
  const executionOrder: string[] = [];
  const startTime = Date.now();

  // Build lookup + validate
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const completed = new Set<string>();
  const inFlight = new Set<string>();

  // Validate: no missing deps
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!nodeMap.has(dep)) {
        throw new Error(`Node "${node.id}" depends on unknown node "${dep}"`);
      }
    }
  }

  // Check for cycles (simple DFS)
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function checkCycle(id: string): boolean {
    if (visiting.has(id)) return true; // cycle!
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of nodeMap.get(id)!.dependsOn) {
      if (checkCycle(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const node of nodes) {
    if (checkCycle(node.id)) {
      throw new Error(`Cycle detected involving node "${node.id}"`);
    }
  }

  /** Get nodes whose dependencies are all completed. */
  function getReady(): DAGNode<T>[] {
    return nodes.filter((n) =>
      !completed.has(n.id) &&
      !inFlight.has(n.id) &&
      n.dependsOn.every((d) => completed.has(d))
    );
  }

  /** Execute a single node. */
  async function runNode(node: DAGNode<T>): Promise<void> {
    inFlight.add(node.id);
    opts.onNodeStart?.(node.id, node.label);
    const t0 = Date.now();

    try {
      // Gather dependency results
      const deps = new Map<string, T>();
      for (const depId of node.dependsOn) {
        if (results.has(depId)) {
          deps.set(depId, results.get(depId)!);
        }
      }

      const result = await node.execute(deps);
      results.set(node.id, result);
      executionOrder.push(node.id);
      opts.onNodeComplete?.(node.id, Date.now() - t0);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      errors.set(node.id, error);
      executionOrder.push(node.id);
      opts.onNodeError?.(node.id, error);
    } finally {
      inFlight.delete(node.id);
      completed.add(node.id);
    }
  }

  // Main loop: schedule ready nodes up to concurrency limit
  while (completed.size < nodes.length) {
    if (opts.cancelled?.cancelled) break;

    const ready = getReady();
    if (ready.length === 0 && inFlight.size === 0) {
      // No ready nodes and nothing in flight = deadlock (shouldn't happen after cycle check)
      break;
    }

    // Launch up to concurrency limit
    const toRun = ready.slice(0, Math.max(0, concurrency - inFlight.size));
    if (toRun.length > 0) {
      // Run batch, wait for at least one to complete
      await Promise.race(toRun.map((n) => runNode(n)));
    } else if (inFlight.size > 0) {
      // All slots full, wait for any to complete
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  return {
    results,
    errors,
    executionOrder,
    totalMs: Date.now() - startTime,
  };
}

/**
 * Build a DAG for a multi-scene project.
 *
 * Image-only project: all scenes run in parallel
 * Video project: images in parallel → join → videos in parallel
 */
export function buildProjectDAG<T>(
  scenes: Array<{ index: number; action: string; dependsOnImage?: boolean }>,
  createImageTask: (index: number) => (deps: Map<string, T>) => Promise<T>,
  createVideoTask?: (index: number) => (deps: Map<string, T>) => Promise<T>,
): DAGNode<T>[] {
  const nodes: DAGNode<T>[] = [];

  for (const scene of scenes) {
    // Image generation node (no deps — all parallel)
    const imgId = `img-${scene.index}`;
    nodes.push({
      id: imgId,
      dependsOn: [],
      execute: createImageTask(scene.index),
      label: `Generate image ${scene.index}`,
    });

    // Video node (depends on its image)
    if (scene.action === "video_keyframe" && createVideoTask) {
      const vidId = `vid-${scene.index}`;
      nodes.push({
        id: vidId,
        dependsOn: [imgId],
        execute: createVideoTask(scene.index),
        label: `Animate video ${scene.index}`,
      });
    }
  }

  return nodes;
}
