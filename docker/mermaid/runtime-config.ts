declare global {
  interface Window {
    __MERMAID_RUNTIME_CONFIG__?: {
      krokiRendererUrl: string;
    };
  }
}

// This script is loaded synchronously before Svelte's application modules.
export const runtimeKrokiUrl =
  typeof window === 'undefined'
    ? ''
    : (window.__MERMAID_RUNTIME_CONFIG__?.krokiRendererUrl ?? '');
