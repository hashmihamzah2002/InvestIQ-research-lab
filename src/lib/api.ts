import { NextResponse } from "next/server";
import { z } from "zod";

/** Consistent JSON error envelope for all API routes. */
export function jsonError(
  status: number,
  message: string,
  issues?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { message, ...(issues !== undefined ? { issues } : {}) } },
    { status },
  );
}

/** Parse URL search params through a Zod schema (400 with issues on failure). */
export function parseSearchParams<T>(
  schema: z.ZodType<T>,
  url: string,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const params = Object.fromEntries(new URL(url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      ok: false,
      response: jsonError(
        400,
        "Invalid query parameters",
        result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      ),
    };
  }
  return { ok: true, data: result.data };
}
