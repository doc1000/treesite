import { createContext, useContext, useReducer, useEffect } from "react";

const LS_ARTIFACT = "ts-studio-artifact";
const LS_EXPANDED = "ts-studio-expanded";

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

const initialState = {
  selectedArtifact: readLS(LS_ARTIFACT, null),
  selectedNodeId: null,
  expandedNodeIds: new Set(readLS(LS_EXPANDED, [])),
  activePanel: "treemap",
  viewport: { focusNodeId: null },
};

function reducer(state, action) {
  switch (action.type) {
    case "SELECT_ARTIFACT":
      return {
        ...state,
        selectedArtifact: action.payload,
        selectedNodeId: null,
        viewport: { focusNodeId: null },
      };
    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.payload };
    case "TOGGLE_EXPANDED": {
      const next = new Set(state.expandedNodeIds);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, expandedNodeIds: next };
    }
    case "SET_EXPANDED_MANY":
      return { ...state, expandedNodeIds: new Set(action.payload) };
    case "SET_PANEL":
      return { ...state, activePanel: action.payload };
    case "SET_FOCUS":
      return { ...state, viewport: { ...state.viewport, focusNodeId: action.payload } };
    default:
      return state;
  }
}

const StoreContext = createContext(null);
const DispatchContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    try {
      if (state.selectedArtifact) {
        localStorage.setItem(LS_ARTIFACT, JSON.stringify(state.selectedArtifact));
      }
    } catch { /* ignore */ }
  }, [state.selectedArtifact]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_EXPANDED, JSON.stringify([...state.expandedNodeIds]));
    } catch { /* ignore */ }
  }, [state.expandedNodeIds]);

  return (
    <StoreContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function useDispatch() {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useDispatch must be used within StoreProvider");
  return ctx;
}
