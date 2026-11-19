try {
  process.loadEnvFile();
} catch {}

/**
 * Fills the database with a realistic demo bootcamp: 30 students, two weeks of classes,
 * photos, sent emails and reports. For local demos only: test.ta@example.com is not on the allowed list.
 * Run: npm run db:seed   (never against your production database)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { DEFAULT_TEMPLATES } from "../src/lib/templates";
import { todayIn, zonedDateTime } from "../src/lib/dates";

const NAMES = ["Ayesha Khan", "Bilal Ahmed", "Sana Riaz", "Hamza Tariq", "Fatima Noor", "Usman Ali", "Zainab Hussain", "Ahmed Raza", "Maryam Iqbal", "Hassan Sheikh", "Iqra Javed", "Ali Haider", "Hira Aslam", "Saad Malik", "Mahnoor Butt", "Omer Farooq", "Areeba Siddiqui", "Talha Qureshi", "Noor Fatima", "Danish Mehmood", "Rimsha Akhtar", "Faizan Abbasi", "Laiba Zafar", "Shoaib Anwar", "Anum Saleem", "Kashif Nawaz", "Sadia Rehman", "Waqas Yousaf", "Mehwish Kiani", "Junaid Akram"];
const TZ = "Asia/Karachi";

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });

  const email = "test.ta@example.com";
  await db.delete(schema.users).where(eq(schema.users.email, email));
  const [user] = await db.insert(schema.users).values({ email, name: "Sara Batool" }).returning();
  const [b] = await db
    .insert(schema.bootcamps)
    .values({
      name: "Python for the AI Era, Batch 3",
      venue: "Iqra University, Islamabad campus",
      supervisorName: "Iqra",
      supervisorEmail: "iqra.supervisor@example.com",
      driveFolderId: "1DemoFolderAbCdEfGhIjKl",
      driveFolderName: "PSEB Bootcamp media",
    })
    .returning();
  await db.insert(schema.members).values({ bootcampId: b.id, userId: user.id, role: "OWNER" });
  await db.insert(schema.templates).values(DEFAULT_TEMPLATES.map((t) => ({ ...t, bootcampId: b.id })));
  const students = await db
    .insert(schema.students)
    .values(NAMES.map((n, i) => ({ bootcampId: b.id, name: n, email: n.toLowerCase().replace(/ /g, ".") + "@example.com", phone: `0300 ${String(5550000 + i * 731)}`, rollNo: `PSEB-${String(i + 1).padStart(3, "0")}` })))
    .returning();

  // Ten previous weekdays plus today.
  const today = todayIn(TZ);
  const days: string[] = [];
  const d = new Date(`${today}T12:00:00Z`);
  while (days.length < 10) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.unshift(d.toISOString().slice(0, 10));
  }
  const chronic = new Set([students[3].id, students[17].id]); // misses a lot
  for (const date of [...days, today]) {
    const isToday = date === today;
    const start = zonedDateTime(date, `17:${30 + Math.floor(rand() * 8)}`, TZ);
    const [s] = await db
      .insert(schema.classSessions)
      .values({
        bootcampId: b.id,
        date,
        startedAt: start,
        endedAt: isToday ? null : zonedDateTime(date, `21:0${Math.floor(rand() * 6)}`, TZ),
        topic: isToday ? "Dictionaries and the weekly lab" : null,
        attendanceUploadedAt: start,
        attendanceFileName: `attendance-${date}.xlsx`,
        driveFolderId: `mock_folder_${date}`,
      })
      .returning();
    const marks = students.map((st, i) => {
      const r = rand();
      let status: schema.AttendanceStatus = r < 0.06 ? "ABSENT" : r < 0.09 ? "LEAVE" : r < 0.13 ? "LATE" : "PRESENT";
      if (chronic.has(st.id) && rand() < 0.55) status = "ABSENT";
      if (isToday && i === 4) status = "LEAVE";
      return { sessionId: s.id, studentId: st.id, status, source: "upload" };
    });
    await db.insert(schema.attendance).values(marks);
    const photos = isToday ? 2 : 2 + Math.floor(rand() * 3);
    await db.insert(schema.media).values(
      Array.from({ length: photos + (isToday ? 0 : 2) }, (_, k) => ({
        sessionId: s.id,
        kind: (isToday ? "PHOTO" : k === photos + 1 ? "END_SNAPSHOT" : k === photos ? "VIDEO" : "PHOTO") as schema.MediaKind,
        fileName: `${k === photos ? "Video" : "Photo"} ${date} - IMG_${4100 + k}.jpg`,
        mimeType: k === photos ? "video/mp4" : "image/jpeg",
        size: k === photos ? 84_000_000 : 2_400_000,
        driveFileId: `mock_${date}_${k}`,
        uploadedById: user.id,
        createdAt: new Date(start.getTime() + (isToday ? 25 + k * 40 : 40 + k * 45) * 60_000),
      })),
    );
    const absent = marks.filter((m) => m.status === "ABSENT");
    for (const m of absent) {
      const st = students.find((x) => x.id === m.studentId)!;
      await db.insert(schema.emails).values({
        bootcampId: b.id,
        studentId: st.id,
        sessionId: s.id,
        kind: "ABSENCE",
        to: st.email!,
        subject: `We missed you in class`,
        body: `Hi ${st.name.split(" ")[0]},\n\nYou were marked absent from today's class.\n\nThanks,\nSara Batool`,
        status: isToday ? "DRAFT" : "SENT",
        sentAt: isToday ? null : new Date(start.getTime() + 4 * 3600_000),
        sentById: isToday ? null : user.id,
      });
    }
    if (!isToday) await db.insert(schema.reports).values({ sessionId: s.id, to: "iqra.supervisor@example.com", sentById: user.id, notes: "" });
  }
  console.log(`Seeded "${b.name}" with ${students.length} students and ${days.length + 1} class days. Sign in as ${email}.`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
