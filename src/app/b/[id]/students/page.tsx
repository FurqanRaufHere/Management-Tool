import { requireBootcamp } from "@/lib/access";
import { studentStats } from "@/lib/queries";
import { StudentsView } from "./view";

export const metadata = { title: "Students" };

export default async function StudentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ warn?: string; welcome?: string }> }) {
  const { id } = await params;
  const { warn, welcome } = await searchParams;
  const { bootcamp } = await requireBootcamp(id);
  const stats = await studentStats(id);
  return <StudentsView bootcampId={id} students={stats} threshold={bootcamp.warningThreshold} warnId={warn ?? null} welcome={!!welcome} />;
}
