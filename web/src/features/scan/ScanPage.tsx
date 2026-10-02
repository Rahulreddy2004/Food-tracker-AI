import { PageHeader } from "@/components/layout";
import { useTitle } from "@/lib/useTitle";

export default function Page() {
  useTitle("Scan a meal");
  return (
    <div className="container-app">
      <PageHeader title="Scan a meal" description="Coming together — this screen is being built." />
    </div>
  );
}
