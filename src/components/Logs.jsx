import React, { isValidElement } from 'react'
import { logContentLooksLikeDeletion, stripLeadingAuthorFromLogContent } from '../lib/logDetect'
import { motion, AnimatePresence } from 'framer-motion'
import { History, User, Activity, Clock, Shield, Search, Image as ImageIcon, Trash2, Video, Mic, FileText, Download, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { cn } from '../lib/utils'
import Linkify from './Linkify'
import LogRichContent from './LogRichContent'
import { API_BASE, FILE_BASE } from '../lib/apiBase'
const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

/** Global sistem logları sayfası — her sekmede gösterilecek kayıt */
const GLOBAL_LOGS_PAGE_SIZE = 10
/** Hızlı tıklanabilir en fazla ilk kaç sayfa (geri kalanı numara girerek) */
const LOGS_QUICK_PAGES_MAX = 15

function logMatchesPersonTag(log, tag) {
  if (!tag?.id) return false
  return String(log.target_id ?? '') === String(tag.id)
}

function personDiscordAvatarUrl(person, size = 32) {
  if (!person?.id || !person?.avatar) return null
  const ext = person.avatar.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${person.id}/${person.avatar}.${ext}?size=${size}`
}

export default function Logs({ setView, setSelectedId, setHighlightLogId, setHighlightMediaId, user: propUser }) {
  const queryClient = useQueryClient()
  const user = propUser || JSON.parse(localStorage.getItem('nexus_user') || '{}')
  const [confirmClear, setConfirmClear] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(null)
  const [enlargedLogMedia, setEnlargedLogMedia] = React.useState(null)
  const [logPageIndex, setLogPageIndex] = React.useState(0)
  const [pageJumpInput, setPageJumpInput] = React.useState('')
  const [personFilterTags, setPersonFilterTags] = React.useState([])
  const [personFilterDraft, setPersonFilterDraft] = React.useState('')

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['global-logs'],
    queryFn: () => axios.get(`${API_BASE}/logs`, { headers: getHeaders() }).then(res => res.data)
  })

  const { data: peopleList = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => axios.get(`${API_BASE}/people`, { headers: getHeaders() }).then(res => res.data)
  })

  const filteredLogs = React.useMemo(() => {
    if (!personFilterTags.length) return logs
    return logs.filter((log) => personFilterTags.some((tag) => logMatchesPersonTag(log, tag)))
  }, [logs, personFilterTags])

  const logPageCount = Math.max(1, Math.ceil(filteredLogs.length / GLOBAL_LOGS_PAGE_SIZE))
  const paginatedLogs = React.useMemo(
    () =>
      filteredLogs.slice(
        logPageIndex * GLOBAL_LOGS_PAGE_SIZE,
        logPageIndex * GLOBAL_LOGS_PAGE_SIZE + GLOBAL_LOGS_PAGE_SIZE,
      ),
    [filteredLogs, logPageIndex],
  )

  const personFilterKey = personFilterTags.map((t) => t.id).join('\0')
  const prevPersonFilterKeyRef = React.useRef(personFilterKey)

  React.useEffect(() => {
    const maxIdx = Math.max(0, logPageCount - 1)
    const filterChanged = prevPersonFilterKeyRef.current !== personFilterKey
    if (filterChanged) {
      prevPersonFilterKeyRef.current = personFilterKey
      setLogPageIndex(0)
      return
    }
    setLogPageIndex((p) => Math.min(p, maxIdx))
  }, [personFilterKey, logPageCount, filteredLogs.length])

  React.useEffect(() => {
    if (logPageIndex < LOGS_QUICK_PAGES_MAX) {
      setPageJumpInput('')
    } else {
      setPageJumpInput(String(logPageIndex + 1))
    }
  }, [logPageIndex])

  const quickPageButtonCount = Math.min(LOGS_QUICK_PAGES_MAX, logPageCount)
  const pageJumpNum = parseInt(String(pageJumpInput).trim(), 10)
  const pageJumpMatchesCurrent =
    Number.isFinite(pageJumpNum) && pageJumpNum === logPageIndex + 1
  const pageBeyondQuickRange = logPageIndex >= LOGS_QUICK_PAGES_MAX
  const pageJumpInputGlow = pageJumpMatchesCurrent && pageBeyondQuickRange

  const applyJumpToPage = React.useCallback(() => {
    const raw = String(pageJumpInput).trim()
    if (raw === '') return
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return
    const idx = Math.min(Math.max(0, n - 1), logPageCount - 1)
    setLogPageIndex(idx)
  }, [pageJumpInput, logPageCount])

  const selectedPersonIds = React.useMemo(
    () => new Set(personFilterTags.map((t) => t.id)),
    [personFilterTags],
  )

  const filteredPeopleForPicker = React.useMemo(() => {
    const q = personFilterDraft.trim().toLowerCase()
    if (!q) return []
    let rows = peopleList.filter((p) => !selectedPersonIds.has(p.id))
    rows = rows.filter(
      (p) =>
        String(p.display_name ?? '').toLowerCase().includes(q) ||
        String(p.username ?? '').toLowerCase().includes(q) ||
        String(p.id ?? '').toLowerCase().includes(q),
    )
    return rows.slice(0, 120)
  }, [peopleList, personFilterDraft, selectedPersonIds])

  const addPersonFilterTag = React.useCallback((person) => {
    if (!person?.id) return
    setPersonFilterTags((prev) => {
      if (prev.some((t) => t.id === person.id)) return prev
      return [
        ...prev,
        {
          id: person.id,
          display_name: person.display_name || person.username || person.id,
          username: person.username || '',
          avatar: person.avatar || null,
        },
      ]
    })
    setPersonFilterDraft('')
  }, [])

  const deleteLogMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/logs/${id}`, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-logs'] })
      setConfirmingDelete(null)
    }
  })

  const handleDownload = async (url) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `nexus-evidence-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      const link = document.createElement('a');
      link.href = url;
      link.download = `nexus-evidence-${Date.now()}.png`;
      link.click();
    }
  }

  const clearAllLogs = async () => {
    try {
      await axios.delete(`${API_BASE}/logs/all`, { headers: getHeaders() })
      setConfirmClear(false)
      queryClient.invalidateQueries({ queryKey: ['global-logs'] })
      queryClient.invalidateQueries({ queryKey: ['person-logs'] })
      refetch()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Sistem Logları</h1>
          <p className="text-muted-foreground mt-2">Tüm operatör hareketleri ve sistem olayları anlık olarak kaydedilir.</p>
        </div>
        <div className="flex items-center gap-4">
          <AnimatePresence>
            {user.role === 'admin' && (
              <div className="flex items-center gap-2">
                {confirmClear ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl p-1 pr-2"
                  >
                    <span className="text-[10px] font-black uppercase text-destructive px-3 tracking-tighter">Hepsini Sil?</span>
                    <button
                      onClick={clearAllLogs}
                      className="px-3 py-1.5 bg-destructive text-white rounded-lg text-[10px] font-bold"
                    >
                      EVET
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="px-3 py-1.5 bg-white/5 text-foreground rounded-lg text-[10px] font-bold"
                    >
                      İPTAL
                    </button>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 rounded-xl text-destructive transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">LOGLARI TEMİZLE</span>
                  </button>
                )}
              </div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 px-4 py-2 bg-secondary/30 border border-border rounded-xl">
            <Activity className="w-4 h-4 text-green-500 animate-pulse" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Canlı İzleme Aktif</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-secondary/15 px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Kişiye göre ara
          </div>
          {personFilterTags.length > 0 ? (
            <button
              type="button"
              onClick={() => setPersonFilterTags([])}
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Filtreyi temizle
            </button>
          ) : null}
        </div>
        <div
          className={cn(
            'flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background/60 px-2 py-1.5',
            'ring-offset-background focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/25 focus-within:ring-offset-2',
          )}
        >
          {personFilterTags.map((tag) => {
            const av = personDiscordAvatarUrl(tag, 40)
            return (
              <span
                key={tag.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-primary/12 py-0.5 pl-1 pr-1 text-[11px] font-semibold text-foreground"
              >
                {av ? (
                  <img
                    src={av}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                    <User className="h-3 w-3 text-muted-foreground" />
                  </span>
                )}
                <span className="max-w-[140px] truncate">{tag.display_name}</span>
                <button
                  type="button"
                  onClick={() => setPersonFilterTags((prev) => prev.filter((t) => t.id !== tag.id))}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/20 hover:text-foreground"
                  aria-label={`Etiketi kaldır: ${tag.display_name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          <input
            type="text"
            value={personFilterDraft}
            onChange={(e) => setPersonFilterDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const first = filteredPeopleForPicker[0]
                if (first) addPersonFilterTag(first)
                return
              }
              if (e.key === 'Backspace' && personFilterDraft === '' && personFilterTags.length > 0) {
                setPersonFilterTags((prev) => prev.slice(0, -1))
              }
            }}
            className="min-w-[10rem] flex-1 border-0 bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground/60"
            placeholder="Aramak için yazın — sonuçlar burada listelenir"
            aria-label="Kişi ara"
            title="Yazdıkça eşleşen kişiler görünür; seçmek için satıra tıklayın veya Enter ile ilkini ekleyin."
          />
        </div>
        {personFilterDraft.trim() ? (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40">
            <div className="max-h-52 overflow-y-auto overscroll-contain">
              {filteredPeopleForPicker.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {peopleList.length === 0 ? 'Kayıtlı kişi yok.' : 'Eşleşen kişi yok veya tümü zaten seçili.'}
                </div>
              ) : (
                filteredPeopleForPicker.map((p) => {
                  const av = personDiscordAvatarUrl(p, 64)
                  const label = p.display_name || p.username || p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addPersonFilterTag(p)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/80"
                    >
                      {av ? (
                        <img src={av} alt="" className="h-9 w-9 shrink-0 rounded-full border border-border object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-foreground">{label}</span>
                        {p.username ? (
                          <span className="block truncate text-[10px] text-muted-foreground">@{p.username}</span>
                        ) : (
                          <span className="block truncate font-mono text-[10px] text-muted-foreground/80">{p.id}</span>
                        )}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative w-full min-w-0">
        {logPageCount > 1 ? (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border/50 bg-secondary/20 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-1.5">
              {Array.from({ length: quickPageButtonCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setLogPageIndex(i)
                  }}
                  className={cn(
                    'min-h-8 min-w-8 rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums transition-colors',
                    logPageIndex === i
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-background/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={logPageIndex <= 0}
                onClick={() => {
                  setLogPageIndex((p) => Math.max(0, p - 1))
                }}
                className={cn(
                  'inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-background/60 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-35',
                )}
                aria-label="Önceki sayfa"
                title="Önceki sayfa"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  applyJumpToPage()
                }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  aria-label="Sayfa numarası"
                  title="Sayfa numarası"
                  value={pageJumpInput}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '')
                    setPageJumpInput(v === '' ? '' : v)
                  }}
                  className={cn(
                    'min-h-8 w-16 rounded-lg px-2 py-1.5 text-center text-[11px] font-bold tabular-nums transition-colors',
                    pageJumpInputGlow
                      ? 'border border-primary/30 bg-primary text-primary-foreground shadow-sm'
                      : 'border border-border bg-background text-foreground',
                  )}
                />
                <button
                  type="button"
                  disabled={logPageIndex >= logPageCount - 1}
                  onClick={() => {
                    setLogPageIndex((p) => Math.min(logPageCount - 1, p + 1))
                  }}
                  className={cn(
                    'inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-35',
                  )}
                  aria-label="Sonraki sayfa"
                  title="Sonraki sayfa"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  / {logPageCount}
                </span>
              </form>
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground sm:ml-auto">
              {filteredLogs.length} kayıt
              {personFilterTags.length > 0 && filteredLogs.length !== logs.length ? (
                <span className="text-muted-foreground/70"> · {logs.length} toplam</span>
              ) : null}
            </span>
          </div>
        ) : null}

        <div className="absolute left-[21px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/50 via-border to-transparent" />

        <div className="flex w-full min-w-0 flex-col space-y-8">
          {isLoading ? (
            [1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-2xl bg-secondary animate-pulse ml-12" />)
          ) : logs.length === 0 ? (
            <div className="ml-12 p-12 text-center border border-dashed border-border rounded-3xl text-muted-foreground italic">
              Henüz bir sistem kaydı bulunmuyor.
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="ml-12 p-12 text-center border border-dashed border-border rounded-3xl text-muted-foreground">
              <p className="font-semibold text-foreground">Bu filtreye uyan kayıt yok.</p>
              <p className="mt-2 text-sm italic">Etiketleri silin veya farklı isim / kullanıcı adı / ID deneyin.</p>
            </div>
          ) : (
            paginatedLogs.map((log, i) => {
              const isMediaDelete = logContentLooksLikeDeletion(log.content);
              const isAuto = log.type === 'system' && (log.content.includes('"type"') || log.content.includes('{'));
              const urlMatches = log.content.match(/\(URL: ([^, \)]+)/g) || [];
              const urls = urlMatches.map(m => {
                const url = m.match(/\(URL: ([^, \)]+)/)[1];
                return url.startsWith('/uploads') ? `${FILE_BASE}${url}` : url;
              });
              let cleanContent = stripLeadingAuthorFromLogContent(
                log.content.split('(URL:')[0].trim(),
                log.author,
              );

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    'relative flex w-full min-w-0 flex-row gap-6 group',
                    log.is_admin_only && 'opacity-90',
                  )}
                >
                  <div className="relative z-10 w-11 h-11 rounded-full bg-background border-4 border-border flex items-center justify-center group-hover:border-primary transition-colors overflow-hidden">
                    {log.author_avatar ? (
                      <img src={`https://cdn.discordapp.com/avatars/${log.author_discord_id}/${log.author_avatar}.${log.author_avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`} className="w-full h-full object-cover" />
                    ) : log.target_avatar ? (
                      <img src={`https://cdn.discordapp.com/avatars/${log.target_id}/${log.target_avatar}.${log.target_avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`} className="w-full h-full object-cover" />
                    ) : log.is_admin_only ? (
                      <Shield className="w-4 h-4 text-primary" />
                    ) : log.type === 'system' ? (
                      <Activity className="w-4 h-4 text-blue-400" />
                    ) : (
                      <div className="w-5 h-5 rounded-full overflow-hidden border border-white/10 flex items-center justify-center">
                        <User className="w-full h-full p-1 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <div className={cn('min-w-0 flex-1 border border-border rounded-[24px] p-6 transition-all shadow-xl shadow-black/10', log.is_admin_only ? "bg-primary/5 border-primary/20" : "bg-card/40 hover:bg-card/60")}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full overflow-hidden border border-primary/20 shrink-0">
                          {log.author_avatar ? (
                            <img src={`https://cdn.discordapp.com/avatars/${log.author_discord_id}/${log.author_avatar}.${log.author_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                              <User className="w-3 h-3 text-primary" />
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-bold text-primary">
                          {log.author || (isAuto ? 'Otomatik senkronizasyon' : 'Sistem')}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 bg-secondary/50 px-2 py-0.5 rounded-md border border-border/50">
                          {log.type === 'note' ? 'İstihbarat Notu' : log.is_admin_only ? 'Admin İşlemi' : 'Sistem İşlemi'}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-bold bg-secondary/50 px-2 py-1 rounded-md">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div className="space-y-4 overflow-hidden min-w-0 w-full">
                      {(() => {
                        const formatLogContent = (content) => {
                          const getDiscordUrl = (userId, hash, type, size) => {
                            if (!hash || !userId) return null;
                            const ext = hash.startsWith('a_') ? 'gif' : 'png';
                            const baseUrl = type === 'banner' ? 'banners' : 'avatars';
                            const s = size || (type === 'banner' ? 600 : 128);
                            return `https://cdn.discordapp.com/${baseUrl}/${userId}/${hash}.${ext}?size=${s}`;
                          };

                          try {
                            const data = JSON.parse(content);
                            if (data.type === 'banner' || data.type === 'avatar') {
                              const { type, userId, old: oldHash, new: newHash } = data;
                              const oldUrl = getDiscordUrl(userId, oldHash, type);
                              const newUrl = getDiscordUrl(userId, newHash, type);

                              return (
                                <div className="space-y-4 py-2">
                                  <p className="font-bold text-primary italic uppercase tracking-tighter text-xs">
                                    {type === 'banner' ? 'Kapak fotoğrafı yenilendi' : 'Profil fotoğrafı yenilendi'}
                                  </p>
                                  <div className="flex flex-wrap gap-4">
                                    {oldUrl && (
                                      <div className="space-y-2">
                                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Eskisi</span>
                                        <div 
                                          className={cn("rounded-lg border border-border overflow-hidden bg-secondary/30 shadow-md cursor-zoom-in", type === 'banner' ? "w-44 aspect-[16/9]" : "w-12 h-12 rounded-full")}
                                          onClick={() => setEnlargedLogMedia({ url: getDiscordUrl(userId, oldHash, type, 2048) })}
                                        >
                                          <img src={oldUrl} className="w-full h-full object-cover" />
                                        </div>
                                      </div>
                                    )}
                                    {newUrl ? (
                                      <div className="space-y-2">
                                        <span className="text-[9px] font-black text-primary uppercase tracking-widest">Yenisi</span>
                                        <div 
                                          className={cn("rounded-lg border border-primary/30 overflow-hidden bg-secondary/30 shadow-lg shadow-primary/5 cursor-zoom-in", type === 'banner' ? "w-44 aspect-[16/9]" : "w-12 h-12 rounded-full")}
                                          onClick={() => setEnlargedLogMedia({ url: getDiscordUrl(userId, newHash, type, 2048) })}
                                        >
                                          <img src={newUrl} className="w-full h-full object-cover" />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        <span className="text-[9px] font-black text-destructive uppercase tracking-widest">Durum</span>
                                        <div className="px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded-lg text-[9px] font-bold text-destructive uppercase">Kaldırıldı</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            if (data.type === 'guild') {
                              const GuildTagRow = ({ label, g, emphasize }) => (
                                <div className="space-y-2">
                                  <span className={cn('text-[9px] font-black uppercase tracking-widest', emphasize ? 'text-primary' : 'text-muted-foreground')}>{label}</span>
                                  {g && (g.name || g.icon) ? (
                                    <div className={cn('flex items-center gap-2 px-2 py-1.5 rounded-xl border w-fit max-w-full', emphasize ? 'border-primary/30 bg-primary/5' : 'border-border bg-secondary/30')}>
                                      {g.icon ? (
                                        <img src={g.icon} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                                      ) : (
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                          {(g.name || '?')[0]?.toUpperCase()}
                                        </div>
                                      )}
                                      <span className="text-xs font-bold tracking-tight truncate">{g.name || '—'}</span>
                                    </div>
                                  ) : (
                                    <div className="text-[10px] font-bold text-destructive uppercase px-2 py-1 bg-destructive/10 rounded-lg border border-destructive/20 w-fit">Yok / Kaldırıldı</div>
                                  )}
                                </div>
                              );
                              return (
                                <div className="space-y-4 py-2 w-full">
                                  <p className="font-bold text-primary italic uppercase tracking-tighter text-xs">Sunucu etiketi (guild tag) güncellendi</p>
                                  <div className="flex flex-wrap gap-6">
                                    <GuildTagRow label="Eski" g={data.old} />
                                    <GuildTagRow label="Yeni" g={data.new} emphasize />
                                  </div>
                                </div>
                              );
                            }

                            if (data.type === 'username') return `Discord kullanıcı adı «${data.new}» olarak güncellendi.`;
                            if (data.type === 'display_name') return `Görünen ad «${data.new}» olarak güncellendi.`;
                            if (data.type === 'decoration') return 'Profildeki çerçeve / dekorasyon değişti.';
                            if (data.type === 'initial') return data.message || 'Kayıt ilk kez oluşturuldu.';
                          } catch (e) {
                            // Fallback
                            if (content.includes('userId') && content.includes('{')) return 'Discord profil verileri otomatik güncellendi.';
                            return content;
                          }
                          return content;
                        };

                        const formattedMessage = formatLogContent(cleanContent);
                        const richBody = isValidElement(formattedMessage) ? (
                          formattedMessage
                        ) : (
                          <LogRichContent
                            content={typeof formattedMessage === 'string' ? formattedMessage : String(formattedMessage ?? '')}
                            log={log}
                            setSelectedId={setSelectedId}
                            setView={setView}
                          />
                        );

                        return (
                          <div className="space-y-3">
                            {isAuto && (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-black uppercase tracking-widest">
                                <Activity className="w-2.5 h-2.5" /> Sistem Otomasyonu
                              </div>
                            )}
                            <div className="text-sm text-foreground/90 leading-relaxed font-medium w-full" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                              {richBody}
                            </div>
                          </div>
                        );
                      })()}

                      {urls.length > 0 && (!isMediaDelete || user.role === 'admin') && (
                        <div className="flex flex-wrap gap-3">
                          {urls.map((url, idx) => {
                            const isVideo = url.match(/\.(mp4|webm)$/i);
                            const isAudio = url.match(/\.(mp3|wav)$/i);
                            const isPDF = url.match(/\.pdf$/i);

                            return (
                              <div key={idx} className="relative group/media inline-block cursor-zoom-in">
                                <div
                                  onClick={() => setEnlargedLogMedia({ url, isVideo, isAudio, isPDF })}
                                  className="w-24 h-24 rounded-xl border border-white/10 shadow-lg bg-secondary/30 flex items-center justify-center overflow-hidden group-hover/media:border-primary transition-all"
                                >
                                  {isVideo ? (
                                    <div className="relative w-full h-full flex items-center justify-center bg-black/20">
                                      <Video className="w-8 h-8 text-blue-400" />
                                      <div className="absolute bottom-1 right-1 px-1 bg-black/60 rounded text-[8px] font-bold text-white">VIDEO</div>
                                    </div>
                                  ) : isAudio ? (
                                    <div className="relative w-full h-full flex items-center justify-center bg-black/20">
                                      <Mic className="w-8 h-8 text-green-400" />
                                      <div className="absolute bottom-1 right-1 px-1 bg-black/60 rounded text-[8px] font-bold text-white">SES</div>
                                    </div>
                                  ) : isPDF ? (
                                    <div className="relative w-full h-full flex items-center justify-center bg-black/20">
                                      <FileText className="w-8 h-8 text-red-400" />
                                      <div className="absolute bottom-1 right-1 px-1 bg-black/60 rounded text-[8px] font-bold text-white">PDF</div>
                                    </div>
                                  ) : (
                                    <img src={url} className="w-full h-full object-cover" />
                                  )}
                                </div>
                                {isMediaDelete && (
                                  <div className="absolute top-2 right-2 px-1 py-0.5 bg-destructive/80 backdrop-blur-md rounded text-[7px] font-black text-white uppercase tracking-widest shadow-xl">
                                    SİLİNDİ
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/media:opacity-100 transition-opacity rounded-xl flex items-center justify-center pointer-events-none">
                                  <Search className="w-4 h-4 text-white" />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {log.target_name && (
                        <div className="flex items-center justify-between mt-4">
                          <button
                            onClick={() => { 
                              setSelectedId(log.target_id); 
                              setHighlightLogId(log.id);
                              setView('people'); 
                            }}
                            className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 hover:bg-primary/20 rounded-lg border border-white/5 transition-all group/target"
                          >
                            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-tighter">Hedef:</span>
                            <div className="w-4 h-4 rounded-full overflow-hidden border border-border">
                              {log.target_avatar ? (
                                <img 
                                  src={`https://cdn.discordapp.com/avatars/${log.target_id}/${log.target_avatar}.${log.target_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} 
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <User className="w-full h-full p-0.5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-foreground truncate max-w-[200px]">{log.target_name}</span>
                            <div className="w-1 h-1 rounded-full bg-primary/40" />
                            <span className="text-[9px] font-bold text-primary opacity-0 group-hover/target:opacity-100 transition-opacity">MESAJA GİT</span>
                          </button>

                          {user.role === 'admin' && (
                            <div className="flex items-center gap-2">
                              <AnimatePresence mode="wait">
                                {confirmingDelete === log.id ? (
                                  <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex items-center gap-1 bg-destructive/10 rounded-lg p-1">
                                    <button onClick={() => deleteLogMutation.mutate(log.id)} className="px-2 py-1 bg-destructive text-white text-[8px] font-black rounded-md">SİL</button>
                                    <button onClick={() => setConfirmingDelete(null)} className="px-2 py-1 bg-white/5 text-muted-foreground text-[8px] font-black rounded-md">İPTAL</button>
                                  </motion.div>
                                ) : (
                                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setConfirmingDelete(log.id)} className="p-1.5 hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive transition-all rounded-lg">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </motion.button>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      </div>

      <AnimatePresence>
        {enlargedLogMedia && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEnlargedLogMedia(null)} className="absolute inset-0 bg-background/95 backdrop-blur-2xl" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative max-w-5xl w-full flex flex-col items-center gap-6 z-10">
              <div className="relative group w-full flex justify-center">
                {enlargedLogMedia.isVideo ? (
                  <video src={enlargedLogMedia.url} controls className="max-h-[75vh] w-auto rounded-[32px] border border-white/10 shadow-2xl" autoPlay />
                ) : enlargedLogMedia.isAudio ? (
                  <div className="bg-secondary/50 p-12 rounded-[32px] border border-white/10 flex flex-col items-center gap-6 w-full max-w-md">
                    <Mic className="w-16 h-16 text-green-400" />
                    <audio src={enlargedLogMedia.url} controls className="w-full" autoPlay />
                  </div>
                ) : enlargedLogMedia.isPDF ? (
                  <div className="bg-secondary/50 p-12 rounded-[32px] border border-white/10 flex flex-col items-center gap-6 w-full max-w-md text-center">
                    <FileText className="w-16 h-16 text-red-400" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold">PDF Dökümanı</h3>
                      <p className="text-muted-foreground text-sm">Bu dökümanı incelemek için aşağıdan indirin.</p>
                    </div>
                  </div>
                ) : (
                  <img src={enlargedLogMedia.url} className="max-h-[75vh] w-auto rounded-[32px] border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)]" />
                )}
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => handleDownload(enlargedLogMedia.url)}
                  className="px-8 py-3 bg-primary text-white rounded-2xl text-xs font-black shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> BU DOSYAYI İNDİR
                </button>
                <button onClick={() => setEnlargedLogMedia(null)} className="px-8 py-3 bg-white/10 text-white rounded-2xl text-xs font-black border border-white/10 hover:bg-white/20 transition-all">KAPAT</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
