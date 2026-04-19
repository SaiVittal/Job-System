export function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  controller: AbortController,
  errorMsg: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(); // Actually trigger the abort signal
      reject(new Error(errorMsg));
    }, timeoutMs);
  });

  return Promise.race([
    promiseFactory(controller.signal),
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}
