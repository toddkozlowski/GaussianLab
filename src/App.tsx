import { AppShell } from './app/layout/AppShell';
import { initializeStore } from './app/state/Store';
import { createInitialAppState } from './app/state/componentFactories';
import { ConcreteBeamPropagationEngine } from './math/propagation';

// Initialize store once globally (synchronous, before first render)
let storeInitialized = false;
const propagationEngine = new ConcreteBeamPropagationEngine();
const ensureStoreInitialized = () => {
  if (!storeInitialized) {
    const initialState = createInitialAppState();
    initializeStore(initialState, propagationEngine);
    storeInitialized = true;
  }
};

export default function App() {
  // Ensure store is initialized before first render
  ensureStoreInitialized();

  return <AppShell />;
}
