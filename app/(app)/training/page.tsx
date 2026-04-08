'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDisplayName } from '@/lib/display-name'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Loader2, Search, CheckCircle2, Circle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffRow = {
  id: string
  first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
}

type CourseRow = { id: string; name: string }

type TrainingRecord = {
  id: string
  staff_id: string
  course_id: string
  completed_date: string
  expiry_date: string | null
  confirmed: boolean
  notes: string | null
  staff: { first_name: string; last_name: string; display_first_name: string | null; display_last_name: string | null } | null
  courses: { name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrainingRecordsPage() {
  const supabase = createClient()

  const [records, setRecords]           = useState<TrainingRecord[]>([])
  const [staff, setStaff]               = useState<StaffRow[]>([])
  const [courses, setCourses]           = useState<CourseRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStaff, setFilterStaff]   = useState('all')
  const [filterCourse, setFilterCourse] = useState('all')
  const [filterAttendance, setFilterAttendance] = useState('all')

  // ── Load ─────────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    const [recordsRes, staffRes, coursesRes] = await Promise.all([
      supabase
        .from('training_records')
        .select('id, staff_id, course_id, completed_date, expiry_date, confirmed, notes, staff(first_name, last_name, display_first_name, display_last_name), courses(name)')
        .order('completed_date', { ascending: false }),
      supabase
        .from('staff')
        .select('id, first_name, last_name, display_first_name, display_last_name')
        .eq('active', true)
        .order('last_name'),
      supabase
        .from('courses')
        .select('id, name')
        .order('name'),
    ])
    setRecords((recordsRes.data ?? []) as unknown as TrainingRecord[])
    setStaff(staffRes.data ?? [])
    setCourses(coursesRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Filter ────────────────────────────────────────────────────────────────────

  const filtered = records.filter(r => {
    const name = r.staff
      ? getDisplayName({
          first_name: r.staff.first_name, last_name: r.staff.last_name,
          display_first_name: r.staff.display_first_name ?? null,
          display_last_name: r.staff.display_last_name ?? null,
        })
      : ''
    const matchesSearch     = `${name} ${r.courses?.name ?? ''}`.toLowerCase().includes(search.toLowerCase())
    const matchesStaff      = filterStaff === 'all' || r.staff_id === filterStaff
    const matchesCourse     = filterCourse === 'all' || r.course_id === filterCourse
    const matchesAttendance = filterAttendance === 'all'
      || (filterAttendance === 'confirmed' && r.confirmed)
      || (filterAttendance === 'pending' && !r.confirmed)
    return matchesSearch && matchesStaff && matchesCourse && matchesAttendance
  })

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Training Records</h1>
        <p className="mt-1 text-sm text-gray-500">
          {records.length} total · {records.filter(r => r.confirmed).length} confirmed
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by name or training…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStaff} onValueChange={v => setFilterStaff(v ?? 'all')}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Staff" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staff.map(s => (
              <SelectItem key={s.id} value={s.id}>{getDisplayName(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCourse} onValueChange={v => setFilterCourse(v ?? 'all')}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Trainings" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trainings</SelectItem>
            {courses.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAttendance} onValueChange={v => setFilterAttendance(v ?? 'all')}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Attendance" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Attendance</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff Member</TableHead>
              <TableHead>Training</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Attendance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-gray-400">
                  {search || filterStaff !== 'all' || filterCourse !== 'all' || filterAttendance !== 'all'
                    ? 'No records match your filters.'
                    : 'No training records yet. Open a training to add attendees.'}
                </TableCell>
              </TableRow>
            ) : filtered.map(r => {
              const staffName = r.staff
                ? getDisplayName({
                    first_name: r.staff.first_name, last_name: r.staff.last_name,
                    display_first_name: r.staff.display_first_name ?? null,
                    display_last_name: r.staff.display_last_name ?? null,
                  })
                : '—'
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{staffName}</TableCell>
                  <TableCell className="text-gray-700">{r.courses?.name ?? '—'}</TableCell>
                  <TableCell className="text-gray-600 whitespace-nowrap">
                    {fmtDate(r.completed_date)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.confirmed
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {r.confirmed
                        ? <><CheckCircle2 className="h-3 w-3" /> Confirmed</>
                        : <><Circle className="h-3 w-3" /> Pending</>
                      }
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
