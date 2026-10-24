// GET /api/framedit/courses?department=CSE&semester=3
// Lists courses from Framedit. Bad input is rejected here, before Framedit
// is ever called; Framedit failures come back as an empty "unavailable" list.

import { frameditGet, isDepartment, isSemester } from "@/lib/framedit";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const department = query.get("department");
  const semester = query.get("semester");
  if (department !== null && !isDepartment(department)) return Response.json({ error: "Unknown department." }, { status: 400 });
  if (semester !== null && !isSemester(semester)) return Response.json({ error: "Semester must be 1-8." }, { status: 400 });

  const params = new URLSearchParams();
  if (department) params.set("department", department);
  if (semester) params.set("semester", semester);

  const result = await frameditGet("courses", params);
  if (!result.ok) return Response.json({ semesters: [], unavailable: true, reason: result.reason });
  return Response.json(result.data);
}
