import { PageHeader } from "@/components/layout";
import { useTitle } from "@/lib/useTitle";

export default function Page() {
  useTitle("Settings");
  return (
    <div className="container-app">
      <PageHeader title="Settings" description="Coming together — this screen is being built." />
    </div>
  );
}
