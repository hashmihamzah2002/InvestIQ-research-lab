import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { prisma } from "@/lib/db/client";
import { log } from "@/lib/logging/logger";
import { importCsv } from "@/lib/pipeline/import-csv";

export const dynamic = "force-dynamic";

const KindSchema = z.enum(["prices", "fundamentals", "filings", "news", "macro"]);
const MAX_BYTES = 5 * 1024 * 1024;

/** POST multipart/form-data: kind=<category>, file=<csv>. */
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Expected multipart/form-data with 'kind' and 'file'");
  }

  const kind = KindSchema.safeParse(form.get("kind"));
  if (!kind.success) {
    return jsonError(400, "kind must be one of prices|fundamentals|filings|news|macro");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "file is required");
  }
  if (file.size > MAX_BYTES) {
    return jsonError(413, "CSV larger than 5MB — split it up");
  }

  try {
    const text = await file.text();
    const result = await importCsv(prisma, kind.data, file.name, text);
    return NextResponse.json(result);
  } catch (err) {
    log.error("api.import.failed", { err });
    return jsonError(500, "Import failed");
  }
}
