// All routes (URL -> page) in one place.
//
// Public pages are open to everyone. The other groups are wrapped in
// <ProtectedRoute roles={[...]}> so only that role can open them.
import { Route, Routes } from 'react-router'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

import Home from './pages/Home'
import StartupList from './pages/StartupList'
import StartupDetail from './pages/StartupDetail'
import Investors from './pages/Investors'
import InvestorDetail from './pages/InvestorDetail'
import HowItWorks from './pages/HowItWorks'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MyStartups from './pages/founder/MyStartups'
import AddStartup from './pages/founder/AddStartup'
import TeamRounds from './pages/founder/TeamRounds'
import SendPitch from './pages/founder/SendPitch'
import InvestorProfile from './pages/investor/InvestorProfile'
import Inbox from './pages/investor/Inbox'
import Watchlist from './pages/Watchlist'
import Admin from './pages/admin/Admin'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      {/* Login has its own split-screen design, so it sits outside Layout */}
      <Route path="/login" element={<Login />} />

      <Route element={<Layout />}>
        {/* Public: visitors, founders, investors and admins */}
        <Route index element={<Home />} />
        <Route path="startups" element={<StartupList />} />
        <Route path="startups/:startupNo" element={<StartupDetail />} />
        <Route path="investors" element={<Investors />} />
        <Route path="investors/:investorNo" element={<InvestorDetail />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="how-it-works" element={<HowItWorks />} />

        {/* Founder only */}
        <Route element={<ProtectedRoute roles={['Founder']} />}>
          <Route path="founder/startups" element={<MyStartups />} />
          <Route path="founder/startups/new" element={<AddStartup />} />
          <Route path="founder/startups/:startupNo/edit" element={<AddStartup />} />
          <Route path="founder/startups/:startupNo/team" element={<TeamRounds />} />
          <Route path="founder/pitch" element={<SendPitch />} />
        </Route>

        {/* Investor only */}
        <Route element={<ProtectedRoute roles={['Investor']} />}>
          <Route path="investor/profile" element={<InvestorProfile />} />
          <Route path="investor/inbox" element={<Inbox />} />
        </Route>

        {/* Founders and investors can both save startups */}
        <Route element={<ProtectedRoute roles={['Founder', 'Investor']} />}>
          <Route path="watchlist" element={<Watchlist />} />
        </Route>

        {/* Admin only */}
        <Route element={<ProtectedRoute roles={['Admin']} />}>
          <Route path="admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
