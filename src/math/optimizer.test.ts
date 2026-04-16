import { describe, it, expect } from 'vitest';
import {
  optimizeNelderMead,
  optimizeGridSearch,
  defaultOptimizerConfig,
  type OptimizerConfig,
} from './optimizer';

describe('Optimizer', () => {
  describe('Nelder-Mead simplex method', () => {
    it('finds maximum of simple parabola', () => {
      const objective = (params: number[]) => -Math.pow(params[0] - 5, 2);
      const solutions = optimizeNelderMead(objective, [0], [[-10, 10]], defaultOptimizerConfig, 1);
      expect(solutions.length).toBeGreaterThan(0);
      expect(solutions[0].parameters[0]).toBeCloseTo(5, 1);
    });

    it('finds minimum of 2D function', () => {
      const objective = (params: number[]) => -(Math.pow(params[0] - 2, 2) + Math.pow(params[1] - 3, 2));
      const solutions = optimizeNelderMead(objective, [0, 0], [[0, 4], [0, 6]], defaultOptimizerConfig, 1);
      expect(solutions.length).toBeGreaterThan(0);
      expect(solutions[0].parameters[0]).toBeCloseTo(2, 0.5);
    });

    it('respects parameter bounds', () => {
      const objective = (params: number[]) => -Math.pow(params[0], 2);
      const solutions = optimizeNelderMead(objective, [0], [[0, 5]], defaultOptimizerConfig, 1);
      expect(solutions.length).toBeGreaterThan(0);
      expect(solutions[0].parameters[0]).toBeLessThanOrEqual(5);
    });

    it('returns multiple solutions', () => {
      const objective = (params: number[]) => -Math.sin(params[0]);
      const solutions = optimizeNelderMead(objective, [0], [[-10, 10]], defaultOptimizerConfig, 3);
      expect(solutions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Grid search optimizer', () => {
    it('finds optimum of simple 1D function', () => {
      const objective = (params: number[]) => -Math.pow(params[0] - 3, 2);
      const solutions = optimizeGridSearch(objective, [[0, 6]], 11, 1);
      expect(solutions.length).toBeGreaterThan(0);
      expect(Math.abs(solutions[0].parameters[0] - 3)).toBeLessThan(0.7);
    });

    it('finds optimum of 2D function', () => {
      const objective = (params: number[]) => -(Math.pow(params[0] - 1, 2) + Math.pow(params[1] - 2, 2));
      const solutions = optimizeGridSearch(objective, [[0, 2], [1, 3]], 5, 1);
      expect(solutions.length).toBeGreaterThan(0);
      expect(solutions[0].parameters[0]).toBeCloseTo(1, 0.3);
    });

    it('returns specified number of solutions', () => {
      const objective = (params: number[]) => -Math.pow(params[0] - 2, 2);
      const solutions = optimizeGridSearch(objective, [[0, 4]], 5, 3);
      expect(solutions.length).toBeLessThanOrEqual(3);
    });

    it('computes correct iteration count', () => {
      const objective = (params: number[]) => -params[0];
      const pointsPerDim = 5;
      const solutions = optimizeGridSearch(objective, [[0, 1], [0, 1]], pointsPerDim, 1);
      expect(solutions[0].iterations).toBe(25); // 5x5 grid
    });
  });

  describe('optimizer comparison', () => {
    it('both methods can optimize a function', () => {
      const objective = (params: number[]) => Math.sin(params[0]) - 0.1 * Math.pow(params[0], 2);
      const nm = optimizeNelderMead(objective, [0], [[-10, 10]], defaultOptimizerConfig, 1);
      const gs = optimizeGridSearch(objective, [[-10, 10]], 20, 1);
      expect(nm.length).toBeGreaterThan(0);
      expect(gs.length).toBeGreaterThan(0);
    });
  });

  describe('configuration sensitivity', () => {
    it('respects maxIterations', () => {
      const objective = (params: number[]) => -Math.pow(params[0] - 5, 2);
      const config: OptimizerConfig = { ...defaultOptimizerConfig, maxIterations: 5 };
      const solutions = optimizeNelderMead(objective, [0], [[-10, 10]], config, 1);
      expect(solutions[0].iterations).toBeLessThanOrEqual(6);
    });

    it('respects tolerance', () => {
      const objective = (params: number[]) => -Math.pow(params[0] - 5, 2);
      const config: OptimizerConfig = { ...defaultOptimizerConfig, tolerance: 1e-3 };
      const solutions = optimizeNelderMead(objective, [0], [[-10, 10]], config, 1);
      expect(solutions.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles 1D optimization', () => {
      const objective = (params: number[]) => -Math.pow(params[0], 2);
      const solutions = optimizeNelderMead(objective, [1], [[-5, 5]], defaultOptimizerConfig, 1);
      expect(solutions[0].parameters.length).toBe(1);
    });

    it('handles 3D optimization', () => {
      const objective = (params: number[]) =>
        -(Math.pow(params[0] - 1, 2) + Math.pow(params[1] - 2, 2) + Math.pow(params[2] - 3, 2));
      const solutions = optimizeNelderMead(objective, [0, 0, 0], [[0, 2], [1, 3], [2, 4]], defaultOptimizerConfig, 1);
      expect(solutions[0].parameters.length).toBe(3);
    });

    it('handles constant objective', () => {
      const objective = () => 1;
      const solutions = optimizeGridSearch(objective, [[0, 1]], 5, 1);
      expect(solutions[0].objectiveValue).toBeCloseTo(1, 10);
    });
  });
});
