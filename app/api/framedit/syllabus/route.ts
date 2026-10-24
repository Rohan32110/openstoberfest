// GET /api/framedit/syllabus?course=12   (or ?department=CSE&semester=3)
// Returns syllabus topics as a flat list of chips: every
// topics.sections[].items[].text from every syllabus row (midterm + final),
// trimmed, de-duplicated, max 40. `topics` may be null or malformed.

import { frameditGet, isCourseId, isDepartment, isSemester } from "@/lib/framedit";

type Syllabus = { topics?: { sections?: { items?: { text?: unknown }[] }[] } | null };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const course = query.get("course");
  const department = query.get("department");
  const semester = query.get("semester");

  // Framedit needs a course or a department; semester alone is a 400 upstream.
  const params = new URLSearchParams();
  if (course !== null) {
    if (!isCourseId(course)) return Response.json({ error: "Invalid course." }, { status: 400 });
    params.set("course", course);
  } else if (department !== null) {
    if (!isDepartment(department)) return Response.json({ error: "Unknown department." }, { status: 400 });
    params.set("department", department);
    if (semester !== null) {
      if (!isSemester(semester)) return Response.json({ error: "Semester must be 1-8." }, { status: 400 });
      params.set("semester", semester);
    }
  } else {
    return Response.json({ error: "Choose a course or department." }, { status: 400 });
  }

  const data = (await frameditGet("syllabus", params)) as { syllabi?: Syllabus[] } | null;
  if (data === null) return Response.json({ topics: [], unavailable: true });

  const topics = new Set<string>();
  const rows = Array.isArray(data.syllabi) ? data.syllabi : [];
  for (const row of rows) {
    const sections = Array.isArray(row?.topics?.sections) ? row.topics.sections : [];
    for (const section of sections) {
      for (const item of Array.isArray(section?.items) ? section.items : []) {
        const text = typeof item?.text === "string" ? item.text.trim() : "";
        if (text) topics.add(text);
      }
    }
  }
  return Response.json({ topics: [...topics].slice(0, 40) });
}
