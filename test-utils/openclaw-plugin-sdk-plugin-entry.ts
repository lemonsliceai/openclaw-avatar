export function definePluginEntry<T extends {
  id: string;
  name: string;
  description: string;
  register: (...args: any[]) => any;
}>(entry: T): T & { configSchema: Record<string, never> } {
  return {
    ...entry,
    configSchema: {},
  };
}
