"use client";

// Optional helper above the concept box: pick department -> semester ->
// course from Framedit, then click a syllabus topic to use it as the concept.
// Collapsed by default. At most one API call per choice (rate limit is shared).

import { useState } from "react";
import { ArrowRight, BookOpen, ChevronDown } from "lucide-react";

const DEPARTMENTS = ["CSE", "EEE", "ELL", "CE"];

type Course = { id: number; label: string };

// Framedit groups courses by semester; flatten them into one dropdown list.
// Field names are read defensively since course objects may vary.
function flattenCourses(data: { semesters?: { courses?: Record<string, unknown>[] }[] }): Course[] {
  return (data.semesters ?? []).flatMap((s) => s.courses ?? []).flatMap((c) => {
    const id = Number(c.id);
    const label = [c.code, c.title ?? c.name].filter((v) => typeof v === "string" && v).join(" · ");
    return Number.isInteger(id) && label ? [{ id, label }] : [];
  });
}

// Native <select> with the browser arrow hidden and our own chevron placed
// evenly inside the pill, so it lines up the same in every browser.
function Select({ id, label, className = "", ...props }: { id: string; label: string; className?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${className}`}>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <select id={id} {...props}
        className="h-10 w-full cursor-pointer appearance-none truncate rounded-full border border-white/15 bg-surface pl-4 pr-10 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-white/60" />
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-300" aria-hidden />
    </div>
  );
}
// Shown for an empty list AND when Framedit is unavailable: either way the
// user just tries another choice or types a topic. (The server log tells the two apart.)
const EMPTY = "Nothing uploaded for this yet — try another, or type any topic below.";

export default function SyllabusPicker({ selected, onPick }: { selected: string; onPick: (topic: string) => void }) {
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState("");
  const [semester, setSemester] = useState("");
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [topics, setTopics] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  async function loadCourses(dept: string, sem: string) {
    setCourses(null);
    setTopics(null);
    setNote("");
    if (!dept || !sem) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/framedit/courses?${new URLSearchParams({ department: dept, semester: sem })}`);
      const data = await res.json();
      const list = flattenCourses(data);
      setCourses(list);
      if (list.length === 0) setNote(EMPTY);
    } catch {
      setCourses([]);
      setNote(EMPTY);
    } finally {
      setLoading(false);
    }
  }

  async function loadTopics(courseId: string) {
    setTopics(null);
    setNote("");
    if (!courseId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/framedit/syllabus?${new URLSearchParams({ course: courseId })}`);
      const data = await res.json();
      const list: string[] = Array.isArray(data.topics) ? data.topics : [];
      setTopics(list);
      if (list.length === 0) setNote(EMPTY);
    } catch {
      setTopics([]);
      setNote(EMPTY);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-full border border-white/10 bg-white/3 py-2 pl-2 pr-5 text-left transition hover:border-white/25 hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-white">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white" aria-hidden>
          <BookOpen className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-white">Use your course syllabus</span>
          <span className="block truncate text-xs text-zinc-300">CSE · EEE · ELL · CE — pick a topic from your course</span>
        </span>
        <ArrowRight className="size-5 text-zinc-300 transition group-hover:translate-x-0.5" aria-hidden />
      </button>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/3 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-white"><BookOpen className="size-4" aria-hidden />From your syllabus</span>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-2 text-xs text-zinc-300 hover:text-white">Hide</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Select id="dept" label="Department" value={department}
          onChange={(e) => { setDepartment(e.target.value); setSemester(""); loadCourses("", ""); }}>
          <option value="">Department</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        {department && (
          <Select id="sem" label="Semester" value={semester}
            onChange={(e) => { setSemester(e.target.value); loadCourses(department, e.target.value); }}>
            <option value="">Semester</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </Select>
        )}
        {courses && courses.length > 0 && (
          <Select id="course" label="Course" className="col-span-2 sm:col-span-1" defaultValue="" onChange={(e) => loadTopics(e.target.value)}>
            <option value="">Course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        )}
      </div>
      {loading && <p className="mt-2 text-xs text-zinc-300">Loading…</p>}
      {!loading && note && <p className="mt-2 text-xs text-zinc-300">{note}</p>}
      {topics && topics.length > 0 && (
        <>
        <p className="mt-3 text-xs text-zinc-300">Tap a topic to explain it:</p>
        <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {topics.map((t) => (
            <button key={t} type="button" onClick={() => onPick(t)} aria-pressed={selected === t}
              className={`rounded-full border px-3 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-white ${
                selected === t ? "border-white bg-white text-black" : "border-white/15 text-zinc-100 hover:bg-white/10"}`}>
              {t}
            </button>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
