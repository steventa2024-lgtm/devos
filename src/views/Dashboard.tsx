import {
  ActiveProjectsCard, SystemCard, ServicesCard, GitCard,
  HistoryCard, EnvCard, LogsCard, QuickActionsCard,
} from '@/components/dashboard/cards'

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-400">
          Everything you need to run your day, in one place.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ActiveProjectsCard />
        </div>
        <div className="lg:col-span-7">
          <SystemCard />
        </div>

        <div className="lg:col-span-4">
          <ServicesCard />
        </div>
        <div className="lg:col-span-4">
          <GitCard />
        </div>
        <div className="lg:col-span-4">
          <EnvCard />
        </div>

        <div className="lg:col-span-7">
          <LogsCard />
        </div>
        <div className="lg:col-span-5">
          <QuickActionsCard />
        </div>

        <div className="lg:col-span-12">
          <HistoryCard />
        </div>
      </div>
    </div>
  )
}
