export type StreamDeltaBatcher = {
  readonly push: (delta: string) => void;
  readonly flush: () => void;
  readonly cancel: () => void;
};

export function createStreamDeltaBatcher(onFlush: (delta: string) => void, delayMs: number): StreamDeltaBatcher {
  let pending = "";
  let timer: number | undefined;

  function flushPending() {
    timer = undefined;
    if (!pending) return;
    const delta = pending;
    pending = "";
    onFlush(delta);
  }

  return {
    push(delta) {
      if (!delta) return;
      pending += delta;
      if (timer === undefined) timer = window.setTimeout(flushPending, delayMs);
    },
    flush() {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      flushPending();
    },
    cancel() {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      pending = "";
    },
  };
}
