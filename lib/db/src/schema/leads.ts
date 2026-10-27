import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  sessionId: text("session_id").notNull(),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  interest: text("interest"),
  appointmentDate: text("appointment_date"),
  doctor: text("doctor"),
  status: text("status").notNull().default("pending"),
  bookingType: text("booking_type").default("new_checkup"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

