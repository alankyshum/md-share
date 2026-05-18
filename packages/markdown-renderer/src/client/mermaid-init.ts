let initialized = false;

export async function initMermaid(dark: boolean): Promise<void> {
  if (initialized) return;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'loose',
  });
  initialized = true;
}

export async function runMermaid(nodes: HTMLElement[]): Promise<void> {
  const { default: mermaid } = await import('mermaid');
  await mermaid.run({ nodes });
}
