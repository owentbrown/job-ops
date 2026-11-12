import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppErrorBoundary } from "@/client/components/AppErrorBoundary";
import { AppModeProvider } from "@/client/components/layout";
import { AppearanceProvider } from "@/client/lib/appearance/AppearanceProvider";
import { queryClient } from "@/client/lib/queryClient";
import { App } from "./App";
import "../index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppearanceProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppModeProvider>
            <AppErrorBoundary>
              <App />
            </AppErrorBoundary>
          </AppModeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppearanceProvider>
  </React.StrictMode>,
);
