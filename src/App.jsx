import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  Image as ImageIcon,
  Share2,
  History,
  Settings,
  LogOut,
  Search,
  Plus,
  Shield,
  Command,
  Bell,
  User as UserIcon
} from 'lucide-react'
import { cn } from './lib/utils'
import { API_BASE } from './lib/apiBase'

// --- COMPONENTS ---
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Dashboard from './components/Dashboard'
import People from './components/People'
import Gallery from './components/Gallery'
import Graph from './components/Graph'
import Logs from './components/Logs'
import Archive from './components/Archive'
import Admin from './components/Admin'
import WorldMap from './components/WorldMap'
import Login from './components/Login'
import AddPersonModal from './components/AddPersonModal'
import Notification from './components/Notification'

export default function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('nexus_user') || sessionStorage.getItem('nexus_user')))
  const [token, setToken] = useState(localStorage.getItem('nexus_token') || sessionStorage.getItem('nexus_token'))
  const [view, setView] = useState(localStorage.getItem('nexus_view') || sessionStorage.getItem('nexus_view') || 'dashboard')
  const [selectedId, setSelectedId] = useState(localStorage.getItem('nexus_selected_id') || sessionStorage.getItem('nexus_selected_id') || null)
  const [highlightLogId, setHighlightLogId] = useState(null)
  const [highlightMediaId, setHighlightMediaId] = useState(null)
  const [peopleSearch, setPeopleSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [notification, setNotification] = useState(null)

  const notify = (message, type = 'success') => setNotification({ message, type })

  // Persist view and selectedId
  useEffect(() => {
    localStorage.setItem('nexus_view', view)
    sessionStorage.setItem('nexus_view', view)
  }, [view])

  useEffect(() => {
    if (selectedId) {
      localStorage.setItem('nexus_selected_id', selectedId)
      sessionStorage.setItem('nexus_selected_id', selectedId)
    } else {
      localStorage.removeItem('nexus_selected_id')
      sessionStorage.removeItem('nexus_selected_id')
    }
  }, [selectedId])

  useEffect(() => {
    if (token) {
      axios.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        setUser(res.data);
        localStorage.setItem('nexus_user', JSON.stringify(res.data));
      }).catch(err => {
        if (err.response?.status === 401) handleLogout();
      });
    }
  }, [token])

  const handleLogin = (data) => {
    const store = data.rememberMe ? localStorage : sessionStorage
    // Clear other store to avoid conflicts
    const otherStore = data.rememberMe ? sessionStorage : localStorage
    otherStore.removeItem('nexus_user')
    otherStore.removeItem('nexus_token')

    setUser(data.user)
    setToken(data.token)
    store.setItem('nexus_user', JSON.stringify(data.user))
    store.setItem('nexus_token', data.token)
  }

  const handleLogout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('nexus_user')
    localStorage.removeItem('nexus_token')
    localStorage.removeItem('nexus_view')
    localStorage.removeItem('nexus_selected_id')
    sessionStorage.removeItem('nexus_user')
    sessionStorage.removeItem('nexus_token')
    sessionStorage.removeItem('nexus_view')
    sessionStorage.removeItem('nexus_selected_id')
  }

  const handleUserUpdate = (updatedUser) => {
    const newUser = { ...user, ...updatedUser };
    setUser(newUser);
    const store = localStorage.getItem('nexus_token') ? localStorage : sessionStorage;
    store.setItem('nexus_user', JSON.stringify(newUser));
  }

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      <Sidebar view={view} setView={setView} user={user} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          user={user}
          view={view}
          setView={setView}
          setSelectedId={setSelectedId}
          setHighlightLogId={setHighlightLogId}
          setHighlightMediaId={setHighlightMediaId}
          peopleSearch={peopleSearch}
          setPeopleSearch={setPeopleSearch}
          onAddClick={() => setShowAddModal(true)}
        />

        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto"
            >
              {view === 'dashboard' && <Dashboard user={user} setView={setView} setSelectedId={setSelectedId} setHighlightLogId={setHighlightLogId} />}
              {view === 'people' && (
                <People
                  user={user}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  highlightLogId={highlightLogId}
                  setHighlightLogId={setHighlightLogId}
                  highlightMediaId={highlightMediaId}
                  setHighlightMediaId={setHighlightMediaId}
                  search={peopleSearch}
                  setSearch={setPeopleSearch}
                  notify={notify}
                  setView={setView}
                />
              )}
              {view === 'gallery' && (
                <Gallery
                  setView={setView}
                  setSelectedId={setSelectedId}
                  setHighlightMediaId={setHighlightMediaId}
                />
              )}
              {view === 'graph' && <Graph />}
              {view === 'map' && <WorldMap setSelectedId={setSelectedId} setView={setView} />}
              {view === 'logs' && (
                <Logs
                  user={user}
                  setView={setView}
                  setSelectedId={setSelectedId}
                  setHighlightLogId={setHighlightLogId}
                  setHighlightMediaId={setHighlightMediaId}
                />
              )}
              {view === 'archive' && user.role === 'admin' && <Archive />}
              {view === 'admin' && user.role === 'admin' && <Admin onUserUpdate={handleUserUpdate} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AddPersonModal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        notify={notify} 
      />

      <AnimatePresence>
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
