import { ProfessionalEditor } from "../professional-editor";
export default async function NewProfessional({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <ProfessionalEditor q={(await searchParams).q} />;
}
