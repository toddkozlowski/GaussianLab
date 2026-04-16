/**
 * State module barrel export
 *
 * Exports all public state management APIs for use in UI layers.
 */

export * from './schema';
export * from './reducer';
export * from './stateResolver';
export { AppStore } from './Store';
export { resolveBeamPath } from './beamPathResolver';
export * from './defaultState';
export * from './componentFactories';
export * from './solverService';
export { snapScalarToGrid, snapPointToGrid } from './snapToGrid';
export { isWithinAxisCapture, transverseOffsetToAxis, snapPointToAxis } from './axisCapture';
export * from './types/Layer0Interfaces';
