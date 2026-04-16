/**
 * Optimizer for Mode Matching
 *
 * Solves the inverse problem: given a source beam, lens(es), and target mode,
 * find the optimal lens position(s) and focal length(s) to maximize mode overlap.
 *
 * Strategy: Nelder-Mead simplex method (no derivatives needed, robust).
 */

/**
 * Configuration for optimizer
 */
export interface OptimizerConfig {
  maxIterations: number;
  tolerance: number; // Convergence threshold for simplex volume
  // Nelder-Mead coefficients
  alpha: number; // Reflection
  beta: number; // Expansion
  gamma: number; // Contraction
  delta: number; // Shrinkage
}

/**
 * Default optimizer configuration
 */
export const defaultOptimizerConfig: OptimizerConfig = {
  maxIterations: 500,
  tolerance: 1e-6,
  alpha: 1, // Reflection coefficient
  beta: 2, // Expansion coefficient
  gamma: 0.5, // Contraction coefficient
  delta: 0.5, // Shrinkage coefficient
};

/**
 * Result of optimization
 */
export interface OptimiserSolution {
  parameters: number[]; // Optimized parameter values
  objectiveValue: number; // Overlap achieved
  iterations: number;
  converged: boolean;
}

/**
 * Objective function signature
 */
type ObjectiveFunction = (parameters: number[]) => number;

/**
 * Nelder-Mead simplex optimizer
 *
 * Minimizes -overlapFunction (to maximize overlap) by searching over parameter space.
 * Returns up to numSolutions best solutions found during optimization.
 *
 * @param objectiveFunction Function to minimize (negative overlap for maximization)
 * @param initialParameters Initial guess for parameters
 * @param parameterBounds Bounds for each parameter [[min, max], ...]
 * @param config Optimizer configuration
 * @param numSolutions Number of best solutions to return
 * @returns Array of OptimiserSolution objects
 */
export function optimizeNelderMead(
  objectiveFunction: ObjectiveFunction,
  initialParameters: number[],
  parameterBounds: Array<[number, number]>,
  config: OptimizerConfig = defaultOptimizerConfig,
  numSolutions: number = 3
): OptimiserSolution[] {
  const n = initialParameters.length;

  // Initialize simplex: n+1 points
  // Start with initial parameters, then perturb each dimension
  const simplex: number[][] = [];
  simplex.push([...initialParameters]);

  for (let i = 0; i < n; i++) {
    const perturbed = [...initialParameters];
    const [minB, maxB] = parameterBounds[i];
    const range = maxB - minB;
    perturbed[i] += range * 0.1; // 10% perturbation
    simplex.push(perturbed);
  }

  // Evaluate all vertices
  const values = simplex.map(v => evaluateWithBounds(objectiveFunction, v, parameterBounds));
  const solutions: Array<{ params: number[]; value: number }> = [];

  let converged = false;
  let iteration = 0;

  while (!converged && iteration < config.maxIterations) {
    // Sort simplex by objective value (ascending, since we're minimizing)
    const indexed = values.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => a.value - b.value);

    // Reorder simplex
    const sortedSimplex = indexed.map(i => simplex[i.index]);
    const sortedValues = indexed.map(i => i.value);

    // Check convergence: simplex volume or standard deviation
    const simplexStd = Math.sqrt(
      sortedValues.reduce((sum, v, i) => sum + (v - sortedValues[0]) ** 2, 0) / (n + 1)
    );
    if (simplexStd < config.tolerance) {
      converged = true;
    }

    // Extract best points for solution tracking
    if (iteration % 10 === 0 || converged) {
      solutions.push({ params: [...sortedSimplex[0]], value: sortedValues[0] });
    }

    // Nelder-Mead operations
    if (!converged) {
      // Centroid of best n points
      const centroid = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          centroid[j] += sortedSimplex[i][j];
        }
      }
      for (let j = 0; j < n; j++) {
        centroid[j] /= n;
      }

      // Reflect worst point
      const worst = sortedSimplex[n];
      const reflected = new Array(n);
      for (let j = 0; j < n; j++) {
        reflected[j] = centroid[j] + config.alpha * (centroid[j] - worst[j]);
      }
      const reflectedValue = evaluateWithBounds(objectiveFunction, reflected, parameterBounds);

      if (reflectedValue < sortedValues[0]) {
        // Expansion: reflected point is better than best
        const expanded = new Array(n);
        for (let j = 0; j < n; j++) {
          expanded[j] = centroid[j] + config.beta * (reflected[j] - centroid[j]);
        }
        const expandedValue = evaluateWithBounds(objectiveFunction, expanded, parameterBounds);

        if (expandedValue < reflectedValue) {
          simplex[indexed[n].index] = expanded;
          values[indexed[n].index] = expandedValue;
        } else {
          simplex[indexed[n].index] = reflected;
          values[indexed[n].index] = reflectedValue;
        }
      } else if (reflectedValue < sortedValues[n - 1]) {
        // Reflection is acceptable
        simplex[indexed[n].index] = reflected;
        values[indexed[n].index] = reflectedValue;
      } else {
        // Contraction
        const contracted = new Array(n);
        for (let j = 0; j < n; j++) {
          contracted[j] = centroid[j] + config.gamma * (worst[j] - centroid[j]);
        }
        const contractedValue = evaluateWithBounds(objectiveFunction, contracted, parameterBounds);

        if (contractedValue < sortedValues[n]) {
          simplex[indexed[n].index] = contracted;
          values[indexed[n].index] = contractedValue;
        } else {
          // Shrinkage: move all but best point toward best
          for (let i = 1; i <= n; i++) {
            for (let j = 0; j < n; j++) {
              simplex[indexed[i].index][j] =
                sortedSimplex[0][j] + config.delta * (simplex[indexed[i].index][j] - sortedSimplex[0][j]);
            }
            values[indexed[i].index] = evaluateWithBounds(
              objectiveFunction,
              simplex[indexed[i].index],
              parameterBounds
            );
          }
        }
      }
    }

    iteration++;
  }

  // Sort solutions by objective value and return top N
  solutions.sort((a, b) => a.value - b.value);
  const topSolutions = solutions.slice(0, Math.min(numSolutions, solutions.length));

  return topSolutions.map(sol => ({
    parameters: sol.params,
    objectiveValue: -sol.value, // Convert back to overlap (maximize)
    iterations: iteration,
    converged,
  }));
}

/**
 * Bounded grid search optimizer (simpler alternative for low-dimensional problems)
 *
 * @param objectiveFunction Function to maximize (overlap)
 * @param parameterBounds Bounds for each parameter [[min, max], ...]
 * @param pointsPerDimension Number of points to sample along each dimension
 * @param numSolutions Number of best solutions to return
 * @returns Array of OptimiserSolution objects
 */
export function optimizeGridSearch(
  objectiveFunction: ObjectiveFunction,
  parameterBounds: Array<[number, number]>,
  pointsPerDimension: number = 5,
  numSolutions: number = 3
): OptimiserSolution[] {
  const n = parameterBounds.length;
  const solutions: Array<{ params: number[]; value: number }> = [];

  // Generate grid points
  const gridAxes = parameterBounds.map(([min, max]) => {
    const points: number[] = [];
    for (let i = 0; i < pointsPerDimension; i++) {
      points.push(min + (i / (pointsPerDimension - 1)) * (max - min));
    }
    return points;
  });

  // Recursive function to generate all combinations
  function generateCombinations(axisIndex: number, current: number[]): void {
    if (axisIndex === n) {
      const value = -objectiveFunction(current); // Negate for minimization
      solutions.push({ params: [...current], value });
      return;
    }

    for (const point of gridAxes[axisIndex]) {
      current[axisIndex] = point;
      generateCombinations(axisIndex + 1, current);
    }
  }

  generateCombinations(0, new Array(n));

  // Sort and return top N
  solutions.sort((a, b) => a.value - b.value);
  const topSolutions = solutions.slice(0, Math.min(numSolutions, solutions.length));

  return topSolutions.map(sol => ({
    parameters: sol.params,
    objectiveValue: -sol.value, // Convert back to overlap (maximize)
    iterations: solutions.length,
    converged: true,
  }));
}

/**
 * Helper: evaluate objective function with bounds checking
 */
function evaluateWithBounds(
  objectiveFunction: ObjectiveFunction,
  parameters: number[],
  bounds: Array<[number, number]>
): number {
  // Clamp parameters to bounds
  const clamped = parameters.map((p, i) => {
    const [min, max] = bounds[i];
    return Math.max(min, Math.min(max, p));
  });

  // Return negative overlap (we minimize)
  return -objectiveFunction(clamped);
}
