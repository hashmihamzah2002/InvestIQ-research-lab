import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function StockNotFound() {
  return (
    <Card className="mx-auto mt-12 max-w-md">
      <CardHeader>
        <CardTitle>Ticker not in the universe</CardTitle>
        <CardDescription>
          This research lab tracks a fixed 30-company universe. The ticker you
          requested is not part of it (or has not been seeded yet).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" size="sm">
          <Link href="/screener">Browse the universe</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
