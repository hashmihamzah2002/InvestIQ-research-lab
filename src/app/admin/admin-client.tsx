"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImportResult } from "@/lib/pipeline/import-csv";

export function RefreshNowButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const start = async () => {
    const response = await fetch("/api/admin/refresh", { method: "POST" });
    if (response.status === 409) {
      toast.info("A refresh is already running");
      return;
    }
    if (!response.ok) {
      toast.error("Could not start refresh");
      return;
    }
    setRunning(true);
    toast.success("Refresh started — steps appear in the run history");
    pollRef.current = setInterval(async () => {
      const status = (await (await fetch("/api/admin/refresh")).json()) as {
        running: boolean;
        latest: { status: string } | null;
      };
      if (!status.running) {
        if (pollRef.current) clearInterval(pollRef.current);
        setRunning(false);
        toast.success(`Refresh finished: ${status.latest?.status ?? "?"}`);
        router.refresh();
      }
    }, 3000);
  };

  return (
    <Button size="sm" onClick={start} disabled={running}>
      {running ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <RefreshCcw className="size-3.5" />
      )}
      {running ? "Refreshing…" : "Run refresh now"}
    </Button>
  );
}

export function CsvImportCard() {
  const router = useRouter();
  const [kind, setKind] = useState("prices");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/admin/import", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as
        | ImportResult
        | { error: { message: string } };
      if (!response.ok) {
        throw new Error((body as { error: { message: string } }).error.message);
      }
      const r = body as ImportResult;
      setResult(r);
      toast.success(`Imported ${r.rowsOk} rows (${r.rowsFailed} failed)`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">CSV import</CardTitle>
        <CardDescription>
          Header formats live in <code className="font-mono">data/templates/</code>.
          Rows are validated one by one — valid rows import, invalid rows are
          reported with line numbers. Unknown tickers are rejected (fixed
          universe).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["prices", "fundamentals", "filings", "news", "macro"].map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">File</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              className="h-8 w-72"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button size="sm" onClick={upload} disabled={!file || busy}>
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            Import
          </Button>
        </div>

        {result ? (
          <div className="rounded-md border p-3 text-sm">
            <p>
              <strong>{result.filename}</strong> → {result.rowsOk} rows imported,{" "}
              {result.rowsFailed} failed.
            </p>
            {result.errors.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
                {result.errors.map((e) => (
                  <li key={`${e.line}-${e.message}`}>
                    line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
