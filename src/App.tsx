import { AppShell } from './app/layout/AppShell';
import { initializeStore } from './app/state/Store';
import { createInitialAppState } from './app/state/componentFactories';
import type { CavityFPComponent } from './app/state/schema';
import type { CavitySolver } from './app/state/types/Layer0Interfaces';
import { solveTwoMirrorEigenmode } from './math/cavity';
import { ConcreteBeamPropagationEngine } from './math/propagation';

// Initialize store once globally (synchronous, before first render)
let storeInitialized = false;
const propagationEngine = new ConcreteBeamPropagationEngine();

const cavitySolver: CavitySolver = {
  solveEigenmode(cavity: CavityFPComponent, wavelengthNm: number) {
    const lengthM = cavity.length * 1e-3;
    const wavelengthM = wavelengthNm * 1e-9;
    const eigenmode = solveTwoMirrorEigenmode(
      lengthM,
      cavity.r1 * 1e-3,
      cavity.r2 * 1e-3,
      wavelengthM,
    );

    if (!eigenmode) {
      return null;
    }

    return {
      waistRadius: eigenmode.waistRadiusM * 1e3,
      waistPositionFromM1: eigenmode.waistPositionInCavityM * 1e3,
      stabilityProduct: eigenmode.g1 * eigenmode.g2,
      isStable: eigenmode.isStable,
    };
  },
};

const ensureStoreInitialized = () => {
  if (!storeInitialized) {
    const initialState = createInitialAppState();
    initializeStore(initialState, propagationEngine, cavitySolver);
    storeInitialized = true;
  }
};

export default function App() {
  // Ensure store is initialized before first render
  ensureStoreInitialized();

  return <AppShell />;
}
