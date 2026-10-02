import { PageHeader } from "@/components/layout";
import { useTitle } from "@/lib/useTitle";

export default function Page() {
  useTitle("Scan a barcode");
  return (
    <div className="container-app">
      <PageHeader
        title="Scan a barcode"
        description="Coming together — this screen is being built."
      />
    </div>
  );
}
