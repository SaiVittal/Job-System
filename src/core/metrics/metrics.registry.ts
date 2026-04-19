export class MetricsRegistry {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(name: string, labels: Record<string, string> = {}): void {
    const key = this.serializeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.serializeKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
  }

  getMetrics(): any {
    const result: any = { counters: {}, histograms: {} };
    
    this.counters.forEach((value, key) => {
      result.counters[key] = value;
    });

    this.histograms.forEach((values, key) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      result.histograms[key] = { count: values.length, avg, max };
    });

    return result;
  }

  private serializeKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
}
