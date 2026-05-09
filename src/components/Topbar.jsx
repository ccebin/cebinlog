import React, { useEffect, useRef, useState } from 'react'
import { Search, Command, FileText, X, Clock, Plus } from 'lucide-react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { API_BASE, FILE_BASE } from '../lib/apiBase'

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

export default function Topbar({ user, view, setView, setSelectedId, setHighlightLogId, setHighlightMediaId, peopleSearch, setPeopleSearch, onAddClick }) {
  const searchInputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ people: [], logs: [], media: [] })
  const [showResults, setShowResults] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        performSearch(query)
      } else {
        setResults({ people: [], logs: [], media: [] })
        setShowResults(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const performSearch = async (q) => {
    setIsLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/search?q=${encodeURIComponent(q)}`, { headers: getHeaders() })
      setResults({
        people: res.data.people || [],
        logs: res.data.logs || [],
        media: res.data.media || []
      })
      setShowResults(true)
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelect = (personId, logId = null) => {
    setSelectedId(personId)
    setHighlightLogId(logId)
    setHighlightMediaId(null)
    setView('people')
    setShowResults(false)
    setQuery('')
  }

  const handleSelectMedia = (personId, mediaId) => {
    setSelectedId(personId)
    setHighlightLogId(null)
    setHighlightMediaId(mediaId)
    setView('people')
    setShowResults(false)
    setQuery('')
  }

  const highlightText = (text, q) => {
    if (!q || !text) return text;
    const parts = text.split(new RegExp(`(${q})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase()
        ? <span key={i} className="bg-primary/30 text-primary-foreground rounded-sm px-0.5">{part}</span>
        : part
    );
  }

  return (
    <header className="h-16 border-b border-border bg-background/50 backdrop-blur-sm flex items-center justify-between px-8 z-[100]">
      {/* Left side spacer */}
      <div className="w-48 hidden md:block" />

      {/* Center: Search */}
      <div className="flex-1 flex justify-center items-center gap-4 px-4">
        {(view === 'dashboard' || view === 'people') && (
          <>
            <div className="relative w-full max-w-md group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                <Search className="w-4 h-4" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={view === 'people' ? peopleSearch : query}
                onChange={(e) => view === 'people' ? setPeopleSearch(e.target.value) : setQuery(e.target.value)}
                onFocus={() => view !== 'people' && query.trim() && setShowResults(true)}
                placeholder={view === 'people' ? "Kişi filtrele..." : "Kişi, kayıt veya medya ara..."}
                className="w-full bg-secondary/50 border border-transparent focus:border-border focus:bg-secondary/80 rounded-lg py-1.5 pl-10 pr-12 text-sm outline-none transition-all"
              />
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                {(view === 'people' ? peopleSearch : query) ? (
                  <button 
                    onClick={() => view === 'people' ? setPeopleSearch('') : setQuery('')} 
                    className="pointer-events-auto hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <kbd className="hidden sm:flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">Ctrl</span>F
                  </kbd>
                )}
              </div>

              {/* Search Results Dropdown (Global Only) */}
              <AnimatePresence>
                {showResults && view !== 'people' && (
                  <>
                    <div className="fixed inset-0 z-[-1]" onClick={() => setShowResults(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto custom-scrollbar"
                    >
                      {results.people.length === 0 && results.logs.length === 0 && results.media.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p className="text-xs font-medium uppercase tracking-widest">Sonuç bulunamadı</p>
                        </div>
                      ) : (
                        <div className="p-2 space-y-4">
                          {results.people.length > 0 && (
                            <div>
                              <h4 className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Kişiler</h4>
                              <div className="space-y-1">
                                {results.people.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => handleSelect(p.id)}
                                    className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-lg transition-colors text-left group"
                                  >
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      {p.avatar ? (
                                        <img src={`https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.${p.avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full rounded-full" />
                                      ) : <Command className="w-5 h-5 text-primary" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-bold text-sm truncate">{highlightText(p.display_name, query)}</div>
                                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                                        <div className="truncate">@{highlightText(p.username, query)}</div>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {results.logs.length > 0 && (
                            <div>
                              <h4 className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">İstihbarat Notları</h4>
                              <div className="space-y-1">
                                {results.logs.map(log => (
                                  <button
                                    key={log.id}
                                    onClick={() => handleSelect(log.target_id, log.id)}
                                    className="w-full flex items-start gap-3 p-3 hover:bg-secondary rounded-lg transition-colors text-left group border border-transparent hover:border-border"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <FileText className="w-3 h-3 text-primary" />
                                        <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">{log.target_name} Hakkında</span>
                                      </div>
                                      <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed italic">
                                        "{highlightText(log.content, query)}"
                                      </p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {results.media.length > 0 && (
                            <div className="pt-2 border-t border-border mt-2">
                              <h4 className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Medya Kanıtları</h4>
                              <div className="space-y-1">
                                {results.media.map(m => (
                                  <button
                                    key={m.id}
                                    onClick={() => handleSelectMedia(m.target_id, m.id)}
                                    className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-lg transition-colors text-left group border border-transparent hover:border-border"
                                  >
                                    <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden shrink-0 border border-border group-hover:border-primary/50 transition-colors">
                                      <img
                                        src={m.url.startsWith('/uploads') ? `${FILE_BASE}${m.url}` : m.url}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[10px] font-bold text-primary uppercase tracking-tighter mb-1">{m.target_name}</div>
                                      <p className="text-xs text-muted-foreground truncate italic">"{highlightText(m.note || 'Medya kanıtı', query)}"</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={onAddClick}
              className="w-8 h-8 flex items-center justify-center bg-primary text-white rounded-lg shadow-lg shadow-primary/20 hover:scale-110 transition-all active:scale-95 shrink-0"
              title="Yeni Kişi Ekle"
            >
              <Plus className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Right: Clock */}
      <div className="w-48 flex justify-end items-center gap-6">
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2 text-foreground font-bold tracking-tight">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm tabular-nums">
              {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <div className="text-[9px] text-muted-foreground font-black uppercase tracking-widest opacity-50">
            {time.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>
    </header>
  )
}
