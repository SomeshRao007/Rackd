import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './routes/RequireAuth'
import { Landing } from './routes/Landing'
import { AppShell } from './routes/AppShell'
import { Today } from './routes/Today'
import { Log } from './routes/Log'
import { History } from './routes/History'
import { Plans } from './routes/Plans'
import { PlanBuilder } from './routes/PlanBuilder'
import { StartDay } from './routes/StartDay'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<Today />} />
              <Route path="log" element={<Log />} />
              <Route path="plans" element={<Plans />} />
              <Route path="plans/:id" element={<PlanBuilder />} />
              <Route path="plans/:id/start/:dayId" element={<StartDay />} />
              <Route path="history" element={<History />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
