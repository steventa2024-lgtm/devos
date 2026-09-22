import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import Dashboard from '@/views/Dashboard'
import Projects from '@/views/Projects'
import TerminalView from '@/views/Terminal'
import Files from '@/views/Files'
import GitView from '@/views/Git'
import Services from '@/views/Services'
import Containers from '@/views/Containers'
import Database from '@/views/Database'
import ApiTester from '@/views/ApiTester'
import Environment from '@/views/Environment'
import Logs from '@/views/Logs'
import Monitoring from '@/views/Monitoring'
import Processes from '@/views/Processes'
import Snippets from '@/views/Snippets'
import Plugins from '@/views/Plugins'
import Settings from '@/views/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"   element={<Dashboard />} />
        <Route path="/projects"    element={<Projects />} />
        <Route path="/terminal"    element={<TerminalView />} />
        <Route path="/files"       element={<Files />} />
        <Route path="/git"         element={<GitView />} />
        <Route path="/services"    element={<Services />} />
        <Route path="/containers"  element={<Containers />} />
        <Route path="/database"    element={<Database />} />
        <Route path="/api"         element={<ApiTester />} />
        <Route path="/environment" element={<Environment />} />
        <Route path="/logs"        element={<Logs />} />
        <Route path="/monitoring"  element={<Monitoring />} />
        <Route path="/processes"   element={<Processes />} />
        <Route path="/snippets"    element={<Snippets />} />
        <Route path="/plugins"     element={<Plugins />} />
        <Route path="/settings"    element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
