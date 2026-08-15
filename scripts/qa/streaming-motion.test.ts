import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamDeltaBatcher } from "@/lib/streaming";

describe("streamed assistant text batching", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid deltas and flushes a complete batch immediately", () => {
    vi.useFakeTimers();
    const batches: string[] = [];
    const batcher = createStreamDeltaBatcher((delta) => batches.push(delta), 40);

    batcher.push("Hel");
    batcher.push("lo");
    vi.advanceTimersByTime(39);
    expect(batches).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(batches).toEqual(["Hello"]);

    batcher.push(" world");
    batcher.flush();
    expect(batches).toEqual(["Hello", " world"]);
  });

  it("drops pending text when the stream is cancelled", () => {
    vi.useFakeTimers();
    const batches: string[] = [];
    const batcher = createStreamDeltaBatcher((delta) => batches.push(delta), 40);

    batcher.push("discarded");
    batcher.cancel();
    vi.advanceTimersByTime(40);

    expect(batches).toEqual([]);
  });
});
