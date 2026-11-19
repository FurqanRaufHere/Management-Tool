import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createId } from "./id";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- People ----------

export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").notNull().unique(),
  image: text("image"),
  createdAt: createdAt(),
});

export const allowedRole = pgEnum("allowed_role", ["ADMIN", "TA"]);
export type AllowedRole = (typeof allowedRole.enumValues)[number];

/** Everyone who may sign in, besides the admins listed in ADMIN_EMAILS. Emails are stored lowercase. */
export const allowedUsers = pgTable(
  "allowed_users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    name: text("name"),
    role: allowedRole("role").notNull().default("TA"),
    active: boolean("active").notNull().default(true),
    addedById: text("added_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  },
  (t) => [check("allowed_users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

/** Google OAuth tokens per user, refreshed on demand for Gmail and Drive calls. */
export const googleAccounts = pgTable("google_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  googleId: text("google_id").notNull().unique(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"),
  scope: text("scope"),
  updatedAt: updatedAt(),
});

// ---------- Bootcamps ----------

export const memberRole = pgEnum("member_role", ["OWNER", "TA"]);

export const bootcamps = pgTable("bootcamps", {
  id: id(),
  name: text("name").notNull(),
  venue: text("venue"),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  classStart: text("class_start").notNull().default("17:30"),
  classEnd: text("class_end").notNull().default("21:00"),
  classDays: integer("class_days")
    .array()
    .notNull()
    .default(sql`'{1,2,3,4,5}'::integer[]`),
  supervisorName: text("supervisor_name"),
  supervisorEmail: text("supervisor_email"),
  reportCc: text("report_cc")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  driveFolderId: text("drive_folder_id"),
  driveFolderName: text("drive_folder_name"),
  warningThreshold: integer("warning_threshold").notNull().default(3),
  archived: boolean("archived").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const members = pgTable(
  "bootcamp_members",
  {
    id: id(),
    bootcampId: text("bootcamp_id")
      .notNull()
      .references(() => bootcamps.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("TA"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("members_bootcamp_user").on(t.bootcampId, t.userId), index("members_user").on(t.userId)],
);

/** A co-TA added by email who has not signed in yet. Becomes a member on first sign-in. */
export const invites = pgTable(
  "bootcamp_invites",
  {
    id: id(),
    bootcampId: text("bootcamp_id")
      .notNull()
      .references(() => bootcamps.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invites_bootcamp_email").on(t.bootcampId, t.email), index("invites_email").on(t.email)],
);

export const students = pgTable(
  "students",
  {
    id: id(),
    bootcampId: text("bootcamp_id")
      .notNull()
      .references(() => bootcamps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    rollNo: text("roll_no"),
    extra: jsonb("extra").$type<Record<string, string>>(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("students_bootcamp_email").on(t.bootcampId, t.email),
    index("students_bootcamp_roll").on(t.bootcampId, t.rollNo),
  ],
);

export const classSessions = pgTable(
  "class_sessions",
  {
    id: id(),
    bootcampId: text("bootcamp_id")
      .notNull()
      .references(() => bootcamps.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD in the bootcamp's timezone
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    topic: text("topic"),
    notes: text("notes"),
    attendanceUploadedAt: timestamp("attendance_uploaded_at", { withTimezone: true }),
    attendanceFileName: text("attendance_file_name"),
    driveFolderId: text("drive_folder_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sessions_bootcamp_date").on(t.bootcampId, t.date)],
);

export const attendanceStatus = pgEnum("attendance_status", ["PRESENT", "LATE", "ABSENT", "LEAVE"]);
export type AttendanceStatus = (typeof attendanceStatus.enumValues)[number];

export const attendance = pgTable(
  "attendance",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: attendanceStatus("status").notNull(),
    source: text("source").notNull().default("upload"), // upload | manual
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("attendance_session_student").on(t.sessionId, t.studentId), index("attendance_student").on(t.studentId)],
);

export const mediaKind = pgEnum("media_kind", ["PHOTO", "VIDEO", "END_SNAPSHOT"]);
export type MediaKind = (typeof mediaKind.enumValues)[number];

export const media = pgTable(
  "media",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    driveFileId: text("drive_file_id").notNull(),
    driveLink: text("drive_link"),
    uploadedById: text("uploaded_by_id"),
    createdAt: createdAt(),
  },
  (t) => [index("media_session").on(t.sessionId), uniqueIndex("media_drive_file").on(t.driveFileId)],
);

export const templateKind = pgEnum("template_kind", ["ABSENCE", "WARNING", "CUSTOM"]);
export type TemplateKind = (typeof templateKind.enumValues)[number];

export const templates = pgTable(
  "email_templates",
  {
    id: id(),
    bootcampId: text("bootcamp_id")
      .notNull()
      .references(() => bootcamps.id, { onDelete: "cascade" }),
    kind: templateKind("kind").notNull(),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [index("templates_bootcamp").on(t.bootcampId)],
);

export const emailStatus = pgEnum("email_status", ["DRAFT", "SENDING", "SENT", "FAILED", "DISCARDED"]);
export type EmailStatus = (typeof emailStatus.enumValues)[number];

export const emails = pgTable(
  "emails",
  {
    id: id(),
    bootcampId: text("bootcamp_id")
      .notNull()
      .references(() => bootcamps.id, { onDelete: "cascade" }),
    studentId: text("student_id").references(() => students.id, { onDelete: "set null" }),
    sessionId: text("session_id").references(() => classSessions.id, { onDelete: "set null" }),
    kind: templateKind("kind").notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: emailStatus("status").notNull().default("DRAFT"),
    error: text("error"),
    sentById: text("sent_by_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    gmailId: text("gmail_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One absence email per student per class, so re-uploading a sheet never duplicates drafts.
    uniqueIndex("emails_absence_once")
      .on(t.sessionId, t.studentId)
      .where(sql`${t.kind} = 'ABSENCE'`),
    index("emails_bootcamp_status").on(t.bootcampId, t.status),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    to: text("to").notNull(),
    cc: text("cc")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes"),
    sentById: text("sent_by_id"),
    gmailId: text("gmail_id"),
    createdAt: createdAt(),
  },
  (t) => [index("reports_session").on(t.sessionId)],
);

// ---------- Relations ----------

export const usersRelations = relations(users, ({ many, one }) => ({
  memberships: many(members),
  google: one(googleAccounts),
}));
export const googleAccountsRelations = relations(googleAccounts, ({ one }) => ({
  user: one(users, { fields: [googleAccounts.userId], references: [users.id] }),
}));
export const bootcampsRelations = relations(bootcamps, ({ many }) => ({
  members: many(members),
  invites: many(invites),
  students: many(students),
  sessions: many(classSessions),
  templates: many(templates),
}));
export const membersRelations = relations(members, ({ one }) => ({
  bootcamp: one(bootcamps, { fields: [members.bootcampId], references: [bootcamps.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
}));
export const invitesRelations = relations(invites, ({ one }) => ({
  bootcamp: one(bootcamps, { fields: [invites.bootcampId], references: [bootcamps.id] }),
}));
export const studentsRelations = relations(students, ({ one, many }) => ({
  bootcamp: one(bootcamps, { fields: [students.bootcampId], references: [bootcamps.id] }),
  attendance: many(attendance),
}));
export const sessionsRelations = relations(classSessions, ({ one, many }) => ({
  bootcamp: one(bootcamps, { fields: [classSessions.bootcampId], references: [bootcamps.id] }),
  attendance: many(attendance),
  media: many(media),
  reports: many(reports),
}));
export const attendanceRelations = relations(attendance, ({ one }) => ({
  session: one(classSessions, { fields: [attendance.sessionId], references: [classSessions.id] }),
  student: one(students, { fields: [attendance.studentId], references: [students.id] }),
}));
export const mediaRelations = relations(media, ({ one }) => ({
  session: one(classSessions, { fields: [media.sessionId], references: [classSessions.id] }),
}));
export const reportsRelations = relations(reports, ({ one }) => ({
  session: one(classSessions, { fields: [reports.sessionId], references: [classSessions.id] }),
}));

export type Bootcamp = typeof bootcamps.$inferSelect;
export type Student = typeof students.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Media = typeof media.$inferSelect;
export type AllowedUser = typeof allowedUsers.$inferSelect;
