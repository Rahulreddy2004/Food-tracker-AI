import { PageHeader } from "@/components/layout";
import { useTitle } from "@/lib/useTitle";

export default function Page() {
  useTitle("Insights");
  return (
    <div className="container-app">
      <PageHeader title="Insights" description="Coming together — this screen is being built." />
    </div>
  );
}
