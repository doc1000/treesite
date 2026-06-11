import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./studio.css";
import App from "./App.jsx";
import { StoreProvider } from "./state/studioStore.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
