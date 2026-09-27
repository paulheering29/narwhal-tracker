import { CalendarClock, Gauge } from 'lucide-react'
import { DashboardCards, type DashboardCardData } from './dashboard-cards'

export type PersonalDashboardData = {
  certType: string | null
  cycleEndDate: string | null
  daysUntilExpiry: number | null
  unitLabel: string | null   // 'PDU' / 'CEU'; null when the person holds no credential
  unitsDone: number
  unitsScheduled: number
  unitsTarget: number
  pacingTarget: number
  assignedCourses: { id: string; name: string; href: string; completedSections: number; totalSections: number; status: 'not_started' | 'in_progress' | 'complete' }[]
  completed: { id: string; label: string; sublabel: string; href: string }[]
  completedCount: number
  upcoming: { id: string; label: string; sublabel: string; href: string }[]
  upcomingCount: number
}

function fmtUnits(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

function urgencyColor(days: number | null): { text: string; bg: string } {
  if (days == null)      return { text: 'text-gray-400',   bg: 'bg-gray-100' }
  if (days < 0)          return { text: 'text-red-600',    bg: 'bg-red-50' }
  if (days <= 30)        return { text: 'text-rose-600',   bg: 'bg-rose-50' }
  if (days <= 90)        return { text: 'text-amber-600',  bg: 'bg-amber-50' }
  return                        { text: 'text-emerald-600', bg: 'bg-emerald-50' }
}

export function PersonalDashboard({ data }: { data: PersonalDashboardData }) {
  const urgency = urgencyColor(data.daysUntilExpiry)
  const target  = Math.max(1, data.unitsTarget)
  const unitPct = Math.min(1, data.unitsDone / target)
  const unitScheduledPct = Math.min(1, (data.unitsDone + data.unitsScheduled) / target)
  const pacingPct = Math.min(1, data.pacingTarget / target)
  const variance = Math.round((data.unitsDone - data.pacingTarget) * 2) / 2
  const units = `${data.unitLabel ?? 'Unit'}s`

  const incompleteAssignedCourses = data.assignedCourses.filter(c => c.status !== 'complete')

  const cards: DashboardCardData[] = [
    {
      title:          'Completed',
      value:          data.completedCount,
      description:    'Trainings and courses on your record',
      icon:           'clipboard',
      color:          'teal',
      alwaysExpanded: true,
      items: data.completed.map(c => ({ id: c.id, label: c.label, sublabel: c.sublabel, href: c.href })),
    },
    {
      title:          'Assigned Courses',
      value:          incompleteAssignedCourses.length,
      description:    'Self-paced courses assigned to you',
      icon:           'book',
      color:          'violet',
      alwaysExpanded: true,
      items: incompleteAssignedCourses.map(c => ({
        id:       c.id,
        label:    c.name,
        sublabel: c.status === 'in_progress' ? `In progress · ${c.completedSections}/${c.totalSections} sections`
          : `Not started · ${c.totalSections} section${c.totalSections !== 1 ? 's' : ''}`,
        href: c.href,
        progress: c.completedSections > 0
          ? { pct: c.completedSections / Math.max(1, c.totalSections), status: 'scheduled' as const }
          : undefined,
      })),
    },
    {
      title:          'Upcoming Trainings',
      value:          data.upcomingCount,
      description:    'Live trainings you’re registered for',
      icon:           'calendar',
      color:          'emerald',
      alwaysExpanded: true,
      items: data.upcoming.map(c => ({ id: c.id, label: c.label, sublabel: c.sublabel, href: c.href })),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Hero row: cert countdown + PDU/CEU progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className={`rounded-xl border-2 border-gray-100 shadow-sm p-6 ${urgency.bg}`}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className={`h-5 w-5 ${urgency.text}`} />
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Certification</p>
          </div>
          {data.daysUntilExpiry == null ? (
            <p className="text-sm text-gray-500">No certification cycle on file.</p>
          ) : (
            <>
              <p className={`text-6xl font-extrabold tabular-nums ${urgency.text}`}>
                {data.daysUntilExpiry < 0 ? 'Expired' : data.daysUntilExpiry}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {data.daysUntilExpiry < 0
                  ? `Your ${data.certType} certification expired ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(data.cycleEndDate + 'T00:00:00'))}`
                  : `day${data.daysUntilExpiry === 1 ? '' : 's'} until your ${data.certType} certification expires`}
              </p>
              {data.cycleEndDate && data.daysUntilExpiry >= 0 && (
                <p className="mt-0.5 text-xs text-gray-400">
                  Cycle ends {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(data.cycleEndDate + 'T00:00:00'))}
                </p>
              )}
            </>
          )}
        </div>

        <div className="rounded-xl border-2 border-gray-100 shadow-sm p-6 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="h-5 w-5 text-blue-500" />
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{data.unitLabel ?? 'Training'} Progress</p>
          </div>
          {data.unitsTarget === 0 ? (
            <p className="text-sm text-gray-500">No RBT or BCBA credential on file, so there’s no requirement to track.</p>
          ) : (
          <>
          <p className="text-6xl font-extrabold tabular-nums text-blue-600">{Math.round(unitPct * 100)}%</p>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm text-gray-600">{fmtUnits(data.unitsDone)} / {data.unitsTarget} {units} completed</p>
              <div className="mt-1 h-2.5 w-full rounded-full bg-gray-100 overflow-hidden relative">
                <div className="h-full bg-blue-200 absolute inset-y-0 left-0" style={{ width: `${unitScheduledPct * 100}%` }} />
                <div className="h-full bg-blue-500 absolute inset-y-0 left-0" style={{ width: `${unitPct * 100}%` }} />
              </div>
            </div>
            {data.pacingTarget > 0 && (
              <div>
                <p className="text-sm text-gray-600">{fmtUnits(data.pacingTarget)} / {data.unitsTarget} {units} — where you should be by now</p>
                <div className="mt-1 h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-gray-400" style={{ width: `${pacingPct * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          {data.pacingTarget > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              You should have <span className="font-medium text-gray-700">{fmtUnits(data.pacingTarget)}</span> {units} by now —{' '}
              {variance === 0 ? (
                <span className="font-medium text-gray-600">right on track</span>
              ) : variance > 0 ? (
                <span className="font-medium text-emerald-600">{fmtUnits(variance)} ahead</span>
              ) : (
                <span className="font-medium text-red-500">{fmtUnits(Math.abs(variance))} behind</span>
              )}
            </p>
          )}
          {data.unitsScheduled > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              +{fmtUnits(data.unitsScheduled)} scheduled, not yet confirmed
            </p>
          )}
          </>
          )}
        </div>
      </div>

      <DashboardCards cards={cards} />
    </div>
  )
}
