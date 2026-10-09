import { readFile } from 'node:fs/promises';

// cgroup peak covers the complete container, including Ollama, on Linux/Render.
// Local Node RSS is not misrepresented as total model memory.
export async function memorySnapshot() {
  const numberFromFile = async (path: string) => {
    try {
      const value = Number((await readFile(path, 'utf8')).trim());
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };
  return {
    nodeRssBytes: process.memoryUsage().rss,
    containerCurrentBytes:
      (await numberFromFile('/sys/fs/cgroup/memory.current')) ??
      (await numberFromFile('/sys/fs/cgroup/memory/memory.usage_in_bytes')),
    containerPeakBytes:
      (await numberFromFile('/sys/fs/cgroup/memory.peak')) ??
      (await numberFromFile('/sys/fs/cgroup/memory/memory.max_usage_in_bytes')),
  };
}
