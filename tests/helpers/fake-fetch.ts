/** Route-matching fake fetch for adapter tests. Records every call. */
export interface FakeRoute {
  match: string | RegExp;
  status?: number;
  body: unknown;
  /** Serve this only for the first N matching calls, then fall through. */
  times?: number;
}

export interface FakeFetch {
  fetchImpl: typeof fetch;
  calls: string[];
}

export function fakeFetch(routes: FakeRoute[]): FakeFetch {
  const calls: string[] = [];
  const remaining = routes.map((r) => r.times ?? Infinity);

  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      const matches =
        typeof r.match === "string" ? url.includes(r.match) : r.match.test(url);
      if (matches && remaining[i] > 0) {
        remaining[i]--;
        const text =
          typeof r.body === "string" ? r.body : JSON.stringify(r.body);
        return new Response(text, {
          status: r.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  return { fetchImpl, calls };
}
