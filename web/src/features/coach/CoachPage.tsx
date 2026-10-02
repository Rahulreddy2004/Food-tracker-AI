import { PageHeader } from "@/components/layout";
import { useTitle } from "@/lib/useTitle";

export default function Page() {
  useTitle("Coach");
  return (
    <div className="container-app">
      <PageHeader title="Coach" description="Coming together — this screen is being built." />
    </div>
  );
}
