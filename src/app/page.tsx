import { ComplianceNotice } from "@/components/compliance-notice";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Placeholder shell — replaced by the full dashboard in P6 once the data
// pipeline and scoring engine exist.
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Transparent, explainable stock research over a 30-company universe.
        </p>
      </div>
      <ComplianceNotice kind="educational" />
      <Card>
        <CardHeader>
          <CardTitle>Setting up</CardTitle>
          <CardDescription>
            Run <code className="font-mono">npm run setup</code> to migrate the
            database, seed the company universe, and load the first data
            snapshot. The dashboard populates after the first refresh.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
