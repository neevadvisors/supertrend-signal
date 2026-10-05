import type Plotly from "plotly.js";

declare global {
  interface Window {
    Plotly?: typeof Plotly;
  }
}

let loadPromise: Promise<typeof Plotly> | null = null;

export function loadPlotly(): Promise<typeof Plotly> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Plotly can only load in the browser"));
  }

  if (window.Plotly) {
    return Promise.resolve(window.Plotly);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-plotly="true"]'
    );
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Plotly) resolve(window.Plotly);
        else reject(new Error("Plotly script loaded but window.Plotly is missing"));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Plotly script"))
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "/plotly.min.js";
    script.async = true;
    script.dataset.plotly = "true";
    script.onload = () => {
      if (window.Plotly) resolve(window.Plotly);
      else reject(new Error("Plotly script loaded but window.Plotly is missing"));
    };
    script.onerror = () => reject(new Error("Failed to load Plotly script"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
