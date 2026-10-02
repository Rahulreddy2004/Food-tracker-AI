import { PageHeader } from "@/components/layout";
import { useTitle } from "@/lib/useTitle";

export default function Page() {
  useTitle("My pantry");
  return (
    <div className="container-app">
      <PageHeader title="My pantry" description="Coming together — this screen is being built." />
    </div>
  );
}
