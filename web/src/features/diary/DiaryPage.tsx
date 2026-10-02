import { PageHeader } from "@/components/layout";
import { useTitle } from "@/lib/useTitle";

export default function Page() {
  useTitle("Diary");
  return (
    <div className="container-app">
      <PageHeader title="Diary" description="Coming together — this screen is being built." />
    </div>
  );
}
