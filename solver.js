// solver.js

async function calculateProbabilities(grid, width, height, totalMines) {
    // 1. Parse Grid and identify constraints
    const constraints = [];
    const unknownCells = [];
    const unknownMap = new Map(); // "x,y" -> index in unknownCells
    let flaggedCount = 0;

    // Identify all unknown cells
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x].type === 'flag') {
                flaggedCount++;
            } else if (grid[y][x].type === 'unknown') {
                const id = `${x},${y}`;
                unknownMap.set(id, unknownCells.length);
                unknownCells.push({ x, y });
            }
        }
    }

    // Build constraints from numbered cells
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y][x].type === 'number') {
                const value = grid[y][x].value;
                const neighbors = [];
                let knownMines = 0;

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (grid[ny][nx].type === 'flag') {
                                knownMines++;
                            } else if (grid[ny][nx].type === 'unknown') {
                                neighbors.push(unknownMap.get(`${nx},${ny}`));
                            }
                        }
                    }
                }

                if (neighbors.length > 0) {
                    constraints.push({
                        cells: neighbors,
                        mines: value - knownMines
                    });
                } else if (knownMines !== value) {
                    // Invalid state: too many flags or not enough space
                    // We can handle or ignore. For now, ignore but it implies 0 prob for this branch if we were checking consistency.
                }
            }
        }
    }

    // 2. Separate into independent components
    // Build adjacency graph of unknown cells based on constraints
    // Two cells are connected if they appear in the same constraint
    const cellAdj = Array(unknownCells.length).fill().map(() => new Set());
    for (const c of constraints) {
        for (let i = 0; i < c.cells.length; i++) {
            for (let j = i + 1; j < c.cells.length; j++) {
                const u = c.cells[i];
                const v = c.cells[j];
                cellAdj[u].add(v);
                cellAdj[v].add(u);
            }
        }
    }

    const components = [];
    const visited = new Set();
    const constrainedCells = new Set();
    
    // Only care about cells that are involved in constraints
    for (const c of constraints) {
        c.cells.forEach(idx => constrainedCells.add(idx));
    }

    for (const idx of constrainedCells) {
        if (!visited.has(idx)) {
            const comp = [];
            const stack = [idx];
            visited.add(idx);
            while (stack.length > 0) {
                const u = stack.pop();
                comp.push(u);
                for (const v of cellAdj[u]) {
                    if (!visited.has(v) && constrainedCells.has(v)) {
                        visited.add(v);
                        stack.push(v);
                    }
                }
            }
            components.push(comp);
        }
    }

    // 3. Solve each component
    // A component is a set of variable indices.
    // We need the constraints relevant to this component.
    
    // Map global constraints to local components
    // Actually, simpler to just pass all constraints and filter inside the solver
    // or better: map constraints to components.
    
    const componentSolutions = [];

    for (const comp of components) {
        // Filter constraints that only involve cells in this component
        // Note: A constraint should be fully contained in a component by definition of connectivity
        const compSet = new Set(comp);
        const relevantConstraints = constraints.filter(c => c.cells.some(cell => compSet.has(cell)));
        
        // Solve
        const solutions = solveComponent(comp, relevantConstraints);
        if (solutions.length === 0) {
            throw new Error("Inconsistent board state");
        }
        componentSolutions.push(solutions);
    }

    // 4. Combine solutions and handle global mine count
    const result = Array(height).fill().map(() => Array(width).fill(null));

    if (totalMines < 0) {
        // Unknown total mines mode: Treat components independently
        // Assume uniform distribution over valid local configurations
        
        for (let i = 0; i < components.length; i++) {
            const comp = components[i];
            const sols = componentSolutions[i];
            const totalSols = sols.length;
            
            if (totalSols === 0) continue;

            const cellCounts = new Map();
            for (const sol of sols) {
                for (const idx of sol.mines) {
                    cellCounts.set(idx, (cellCounts.get(idx) || 0) + 1);
                }
            }
            
            for (const idx of comp) {
                const count = cellCounts.get(idx) || 0;
                const p = count / totalSols;
                const { x, y } = unknownCells[idx];
                result[y][x] = p;
            }
        }
        
        return result;
    }

    const totalRemainingMines = totalMines - flaggedCount;
    const unconstrainedCount = unknownCells.length - visited.size; // 'visited' contains all constrained unknowns

    // We need to combine one solution from each component such that total mines + mines in unconstrained = totalRemainingMines
    // Let's gather (mines_count, weight, accumulated_mine_counts_per_cell) for each component
    
    const compSummaries = componentSolutions.map(sols => {
        // Group by number of mines used
        const byMines = new Map(); // k -> { count: number, cellCounts: Map<cellIdx, number> }
        
        for (const sol of sols) {
            const k = sol.mineCount;
            if (!byMines.has(k)) {
                byMines.set(k, { count: 0, cellCounts: new Map() });
            }
            const entry = byMines.get(k);
            entry.count++;
            for (const idx of sol.mines) {
                entry.cellCounts.set(idx, (entry.cellCounts.get(idx) || 0) + 1);
            }
        }
        return byMines;
    });

    // We need to convolve these distributions.
    // DP state: Map<mines_used, { ways: BigInt, cellWeightedCounts: Map<cellIdx, BigInt> }>
    // Use BigInt for counts to avoid overflow
    
    let dp = new Map();
    dp.set(0, { ways: 1n, cellWeightedCounts: new Map() });

    for (const comp of compSummaries) {
        const nextDp = new Map();
        
        for (const [currentMines, currentData] of dp) {
            for (const [compMines, compData] of comp) {
                const newMines = currentMines + compMines;
                if (newMines > totalRemainingMines) continue;

                const ways = BigInt(compData.count);
                const newWays = currentData.ways * ways;

                if (!nextDp.has(newMines)) {
                    nextDp.set(newMines, { ways: 0n, cellWeightedCounts: new Map() });
                }
                const nextEntry = nextDp.get(newMines);
                nextEntry.ways += newWays;

                // Merge cell counts
                // Existing cells in accumulated result: scale by 'ways'
                for (const [cIdx, cCount] of currentData.cellWeightedCounts) {
                    nextEntry.cellWeightedCounts.set(cIdx, (nextEntry.cellWeightedCounts.get(cIdx) || 0n) + cCount * ways);
                }
                // New cells from this component: scale by 'currentData.ways'
                for (const [cIdx, cCount] of compData.cellCounts) {
                    // cCount is number of solutions in component where cIdx is mine.
                    // We multiply by currentData.ways (number of ways to form the rest)
                    nextEntry.cellWeightedCounts.set(cIdx, (nextEntry.cellWeightedCounts.get(cIdx) || 0n) + BigInt(cCount) * currentData.ways);
                }
            }
        }
        dp = nextDp;
    }

    // 5. Account for unconstrained cells
    // For each total mine count K in constrained cells, we need to place (totalRemainingMines - K) mines in unconstrained cells.
    
    let totalValidWorlds = 0n;
    const finalCellCounts = new Map(); // cellIdx -> BigInt count of worlds where it's a mine
    let totalUnconstrainedMinesWeighted = 0n; // Total mines in unconstrained area across all worlds

    for (const [k, data] of dp) {
        const minesNeeded = totalRemainingMines - k;
        if (minesNeeded < 0 || minesNeeded > unconstrainedCount) continue;

        const combinations = combinationsBigInt(unconstrainedCount, minesNeeded);
        const worlds = data.ways * combinations;
        
        totalValidWorlds += worlds;

        // Add counts for constrained cells
        for (const [cIdx, count] of data.cellWeightedCounts) {
            // count is weighted by ways of other components. Now multiply by ways of unconstrained.
            finalCellCounts.set(cIdx, (finalCellCounts.get(cIdx) || 0n) + count * combinations);
        }

        // Add counts for unconstrained cells
        // Each unconstrained cell has prob = minesNeeded / unconstrainedCount
        // Total contribution = worlds * minesNeeded / unconstrainedCount?
        // Or simpler: Total mines in unconstrained area = worlds * minesNeeded
        // This is distributed evenly among unconstrained cells.
        if (unconstrainedCount > 0) {
             // Total mass of mines in unconstrained region for this k
             totalUnconstrainedMinesWeighted += worlds * BigInt(minesNeeded);
        }
    }

    if (totalValidWorlds === 0n) {
        throw new Error("No valid configuration found");
    }

    // 6. Build result grid (Already initialized at start of step 4)
    // const result = Array(height).fill().map(() => Array(width).fill(null));
    
    // Calculate unconstrained probability
    let pUnconstrained = 0;
    if (unconstrainedCount > 0) {
        pUnconstrained = Number(totalUnconstrainedMinesWeighted * 10000n / BigInt(unconstrainedCount) / totalValidWorlds) / 10000;
    }

    for (let i = 0; i < unknownCells.length; i++) {
        const { x, y } = unknownCells[i];
        
        if (visited.has(i)) {
            // Constrained cell
            if (finalCellCounts.has(i)) {
                const count = finalCellCounts.get(i);
                const p = Number(count * 10000n / totalValidWorlds) / 10000;
                result[y][x] = p;
            } else {
                // Constrained but never a mine -> 0%
                result[y][x] = 0;
            }
        } else {
            // Unconstrained cell
            result[y][x] = pUnconstrained;
        }
    }

    return result;
}

function solveComponent(cells, constraints) {
    // Backtracking solver
    const solutions = [];
    const cellMap = new Map(); // global index -> local index 0..N-1
    cells.forEach((idx, i) => cellMap.set(idx, i));
    
    const N = cells.length;
    const assignment = new Array(N).fill(-1); // 0 or 1
    
    // Optimize constraints for fast checking
    // Convert global indices to local indices
    const localConstraints = constraints.map(c => ({
        cells: c.cells.map(idx => cellMap.get(idx)),
        mines: c.mines
    }));

    // Sort cells by connectivity (heuristic) could help, but simple recursion is okay for small components
    
    function check(idx) {
        // Check if any constraint is violated or satisfied
        // A constraint is violated if:
        // 1. Mines placed > constraint.mines
        // 2. Mines placed + Remaining unknown < constraint.mines
        
        for (const c of localConstraints) {
            let placed = 0;
            let unknown = 0;
            let relevant = false;
            
            for (const cellIdx of c.cells) {
                if (cellIdx === idx) relevant = true; // Optimization: only check constraints involving the current cell
                const val = assignment[cellIdx];
                if (val === 1) placed++;
                else if (val === -1) unknown++;
            }
            
            // Only check constraints that involve the current variable (and previous ones)
            // But we iterate all. Optimization: pre-calculate which constraints involve which cell.
            // For correctness, we just need to ensure we don't return true if violated.
            
            if (placed > c.mines) return false;
            if (placed + unknown < c.mines) return false;
        }
        return true;
    }

    function recurse(idx) {
        if (idx === N) {
            // Found a solution
            const mines = [];
            let count = 0;
            for (let i = 0; i < N; i++) {
                if (assignment[i] === 1) {
                    mines.push(cells[i]);
                    count++;
                }
            }
            solutions.push({ mines, mineCount: count });
            return;
        }

        // Try placing mine (1)
        assignment[idx] = 1;
        if (check(idx)) {
            recurse(idx + 1);
        }

        // Try placing safe (0)
        assignment[idx] = 0;
        if (check(idx)) {
            recurse(idx + 1);
        }

        assignment[idx] = -1;
    }

    recurse(0);
    return solutions;
}

// Helper for BigInt combinations
function combinationsBigInt(n, k) {
    if (k < 0 || k > n) return 0n;
    if (k === 0 || k === n) return 1n;
    if (k > n / 2) k = n - k;
    
    let res = 1n;
    for (let i = 1; i <= k; i++) {
        res = res * BigInt(n - i + 1) / BigInt(i);
    }
    return res;
}
