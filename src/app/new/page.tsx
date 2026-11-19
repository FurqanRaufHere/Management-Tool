import Link from "next/link";
import { requireUser } from "@/lib/access";
import { BootcampForm } from "@/components/bootcamp-form";
import { Mark } from "@/components/mark";

export const metadata = { title: "New bootcamp" };

export default async function NewBootcamp() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-xl px-5 py-8 sm:py-12">
      <Link href="/?all=1" className="mb-10 flex items-center gap-2.5">
        <Mark />
        <span className="text-[17px] font-semibold tracking-tight">TA Desk</span>
      </Link>
      <h1 className="h-page">Set up your bootcamp</h1>
      <p className="mb-10 mt-2 text-muted">
        Hi {user.name?.split(" ")[0] ?? "there"}. Add the class details once. Next you&apos;ll upload the student list.
      </p>
      <BootcampForm />
    </main>
  );
}
