import { z } from "zod";

export const studentSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required").max(120),
  roll_number: z.string().trim().min(1, "Roll number is required").max(40),
  class: z.string().trim().min(1, "Class is required").max(20),
  section: z.string().trim().min(1, "Section is required").max(10),
  date_of_birth: z.string().optional().or(z.literal("")),
  parent_name: z.string().trim().max(120).optional().or(z.literal("")),
  parent_contact: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  admission_date: z.string().optional().or(z.literal("")),
});

export type StudentInput = z.infer<typeof studentSchema>;

export interface Student {
  id: string;
  school_id: string;
  full_name: string;
  roll_number: string;
  class: string;
  section: string;
  date_of_birth: string | null;
  parent_name: string | null;
  parent_contact: string | null;
  address: string | null;
  admission_date: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}