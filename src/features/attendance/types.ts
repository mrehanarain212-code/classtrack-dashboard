export type AttendanceStatus = "Present" | "Absent";

export interface AttendanceRecord {
  id: string;
  student_id: string;
  school_id: string;
  date: string;
  status: AttendanceStatus;
  created_at: string;
  updated_at: string;
}