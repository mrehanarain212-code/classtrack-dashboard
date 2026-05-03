import { Pencil, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Student } from "./types";

interface Props {
  students: Student[];
  onEdit: (s: Student) => void;
  onDelete: (s: Student) => void;
}

export default function StudentList({ students, onEdit, onDelete }: Props) {
  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <User className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No students yet. Add your first student to get started.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <ul className="grid gap-3 md:hidden">
        {students.map(s => (
          <li key={s.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Avatar url={s.photo_url} name={s.full_name} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{s.full_name}</p>
                <p className="text-xs text-muted-foreground">Roll {s.roll_number} · {s.class}-{s.section}</p>
              </div>
            </div>
            {(s.parent_name || s.parent_contact) && (
              <div className="mt-3 text-xs text-muted-foreground">
                {s.parent_name}{s.parent_name && s.parent_contact ? " · " : ""}{s.parent_contact}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 tap-44" onClick={() => onEdit(s)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="flex-1 tap-44 text-destructive hover:text-destructive" onClick={() => onDelete(s)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Roll</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map(s => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar url={s.photo_url} name={s.full_name} />
                    <span className="font-medium">{s.full_name}</span>
                  </div>
                </TableCell>
                <TableCell>{s.roll_number}</TableCell>
                <TableCell>{s.class}-{s.section}</TableCell>
                <TableCell className="text-muted-foreground">
                  {s.parent_name || "—"}
                  {s.parent_contact && <span className="block text-xs">{s.parent_contact}</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(s)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

const Avatar = ({ url, name }: { url: string | null; name: string }) => (
  <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
    {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
  </div>
);