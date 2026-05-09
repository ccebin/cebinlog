import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Trash2, RefreshCcw, Search, User, ShieldAlert, History, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { cn } from '../lib/utils'
import { API_BASE, FILE_BASE } from '../lib/apiBase'

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

export default function Archive() {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [selectedId, setSelectedId] = React.useState(null)
  const [enlargedMedia, setEnlargedMedia] = React.useState(null)
  const [editingNote, setEditingNote] = React.useState(null)
  const [editContent, setEditContent] = React.useState('')
  const [confirmCard, setConfirmCard] = React.useState(null) // { id, type: 'restore' | 'hard' }
  const [confirmDetailAction, setConfirmDetailAction] = React.useState(null) // 'restore' | 'hard'

  const { data: archived = [], isLoading } = useQuery({
    queryKey: ['archived-people'],
    queryFn: () => axios.get(`${API_BASE}/admin/archived`, { headers: getHeaders() }).then(res => res.data)
  })

  const selectedPerson = archived.find(p => p.id === selectedId)

  const { data: personLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['person-logs', selectedId],
    queryFn: () => axios.get(`${API_BASE}/logs/${selectedId}`, { headers: getHeaders() }).then(res => res.data),
    enabled: !!selectedId
  })

  const { data: personMedia = [], refetch: refetchMedia } = useQuery({
    queryKey: ['person-media', selectedId],
    queryFn: () => axios.get(`${API_BASE}/media/${selectedId}`, { headers: getHeaders() }).then(res => res.data),
    enabled: !!selectedId
  })

  const restoreMutation = useMutation({
    mutationFn: (id) => axios.post(`${API_BASE}/people/${id}/restore`, {}, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries(['archived-people'])
      queryClient.invalidateQueries(['people-list'])
      setSelectedId(null)
      setConfirmCard(null)
      setConfirmDetailAction(null)
    }
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/people/${id}/hard`, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries(['archived-people'])
      setSelectedId(null)
      setConfirmCard(null)
      setConfirmDetailAction(null)
    }
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/media/${id}`, { headers: getHeaders() }),
    onSuccess: () => refetchMedia()
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/logs/${id}`, { headers: getHeaders() }),
    onSuccess: () => refetchLogs()
  })

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, content }) => axios.put(`${API_BASE}/logs/${id}`, { content }, { headers: getHeaders() }),
    onSuccess: () => {
      refetchLogs()
      setEditingNote(null)
    }
  })

  const filtered = archived.filter(p =>
    p.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.username?.toLowerCase().includes(search.toLowerCase()) ||
    p.id?.includes(search)
  )

  return (
    <div className="relative h-full">
      <div className={cn("space-y-8 max-w-5xl mx-auto transition-all duration-500", (selectedId || enlargedMedia) ? "blur-sm scale-95 opacity-50 pointer-events-none" : "")}>
        <div className="flex justify-between items-end">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ShieldAlert className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight">İstihbarat Arşivi</h1>
            </div>
            <p className="text-muted-foreground mt-2">Operatörler tarafından silinen ancak sistemde tutulan gizli kayıtlar.</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Arşivde ara (İsim, Kullanıcı Adı, ID)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card/30 border border-border rounded-2xl py-3 pl-11 pr-4 text-sm outline-none focus:border-primary/50 transition-all shadow-lg"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            [1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-28 rounded-3xl bg-card/30 animate-pulse" />)
          ) : filtered.length === 0 ? (
            <div className="col-span-full p-20 text-center border border-dashed border-border rounded-[40px] text-muted-foreground/50 bg-card/10">
              <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="italic font-medium">Arşivde kayıtlı kişi bulunmuyor.</p>
            </div>
          ) : (
            filtered.map((person) => (
              <motion.div
                key={person.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelectedId(person.id)}
                className="bg-card/40 border border-border rounded-[32px] p-4 flex items-center gap-4 hover:border-primary/40 transition-all group cursor-pointer hover:bg-primary/5 hover:shadow-2xl hover:shadow-primary/5 relative overflow-hidden"
              >
                <AnimatePresence>
                  {confirmCard?.id === person.id && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-10 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center"
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3">
                        {confirmCard.type === 'restore' ? 'Geri Yüklensin mi?' : 'TAMAMEN SİLİNSİN Mİ?'}
                      </p>
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirmCard.type === 'restore') restoreMutation.mutate(person.id);
                            else hardDeleteMutation.mutate(person.id);
                          }}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-[10px] font-bold text-white shadow-lg transition-transform active:scale-95",
                            confirmCard.type === 'restore' ? "bg-primary shadow-primary/20" : "bg-destructive shadow-destructive/20"
                          )}
                        >
                          EVET
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmCard(null);
                          }}
                          className="flex-1 py-2 bg-secondary text-foreground rounded-xl text-[10px] font-bold hover:bg-secondary/80 transition-all"
                        >
                          İPTAL
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/5 bg-secondary/50 flex items-center justify-center shrink-0">
                  {person.avatar ? (
                    <img src={`https://cdn.discordapp.com/avatars/${person.id}/${person.avatar}.${person.avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-muted-foreground/30" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{person.display_name}</h3>
                  <p className="text-[10px] text-muted-foreground truncate font-medium">@{person.username}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[8px] px-1.5 py-0.5 bg-black/20 rounded-full text-muted-foreground font-mono">ID: {person.id.slice(0, 8)}...</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmCard({ id: person.id, type: 'restore' });
                    }}
                    className="p-2.5 bg-primary/20 hover:bg-primary/30 rounded-xl text-primary transition-all shadow-lg shadow-primary/20"
                    title="Geri Yükle"
                  >
                    <RefreshCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmCard({ id: person.id, type: 'hard' });
                    }}
                    className="p-2.5 bg-destructive/20 hover:bg-destructive/30 rounded-xl text-destructive transition-all shadow-lg shadow-destructive/20"
                    title="Kalıcı Olarak Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* DETAIL MODAL */}
      <AnimatePresence>
        {selectedId && selectedPerson && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="absolute inset-0 bg-background/90 backdrop-blur-2xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-5xl max-h-[90vh] bg-card border border-white/10 rounded-[48px] shadow-[0_0_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden z-10"
            >
              {/* Header */}
              <div className="relative h-64 shrink-0 overflow-hidden bg-secondary/30">
                {selectedPerson.banner && (
                  <img src={`https://cdn.discordapp.com/banners/${selectedPerson.id}/${selectedPerson.banner}.${selectedPerson.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`} className="w-full h-full object-cover opacity-60" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />

                <div className="absolute bottom-10 left-12 flex items-end gap-8">
                  <div className="w-32 h-32 rounded-[40px] overflow-hidden border-4 border-card shadow-2xl bg-secondary relative">
                    {selectedPerson.avatar ? (
                      <img src={`https://cdn.discordapp.com/avatars/${selectedPerson.id}/${selectedPerson.avatar}.${selectedPerson.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-12 h-12 m-auto text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="mb-4">
                    <h2 className="text-5xl font-black tracking-tighter mb-1">{selectedPerson.display_name}</h2>
                    <p className="text-xl text-primary font-bold opacity-80">@{selectedPerson.username}</p>
                  </div>
                </div>

                <div className="absolute top-8 right-8">
                  <button
                    onClick={() => setSelectedId(null)}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white backdrop-blur-md transition-all group"
                  >
                    <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                  </button>
                </div>

                <div className="absolute bottom-10 right-12 flex gap-3">
                  {confirmDetailAction ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-2 bg-black/60 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl"
                    >
                      <span className="text-[10px] font-black uppercase px-4 tracking-widest text-white/70">Onaylıyor musunuz?</span>
                      <button
                        onClick={() => {
                          if (confirmDetailAction === 'restore') restoreMutation.mutate(selectedPerson.id);
                          else hardDeleteMutation.mutate(selectedPerson.id);
                        }}
                        className={cn(
                          "px-6 py-2 rounded-xl text-[11px] font-black text-white shadow-lg",
                          confirmDetailAction === 'restore' ? "bg-primary shadow-primary/20" : "bg-destructive shadow-destructive/20"
                        )}
                      >
                        EVET
                      </button>
                      <button
                        onClick={() => setConfirmDetailAction(null)}
                        className="px-6 py-2 bg-white/10 text-white rounded-xl text-[11px] font-black hover:bg-white/20"
                      >
                        İPTAL
                      </button>
                    </motion.div>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmDetailAction('restore')}
                        className="px-8 py-3 bg-primary text-white rounded-2xl text-xs font-black hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/30 flex items-center gap-2"
                      >
                        <RefreshCcw className="w-4 h-4" /> ARŞİVDEN ÇIKAR VE GERİ YÜKLE
                      </button>
                      <button
                        onClick={() => setConfirmDetailAction('hard')}
                        className="px-8 py-3 bg-destructive/20 text-destructive hover:bg-destructive/30 rounded-2xl text-xs font-black transition-all flex items-center gap-2 border border-destructive/30"
                      >
                        <Trash2 className="w-4 h-4" /> KALICI SİL
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
                {/* BIO */}
                <section>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" /> Biyografi ve Künye
                  </h4>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {[
                      { label: 'Gerçek İsim', value: selectedPerson.real_name },
                      { label: 'Konum', value: selectedPerson.location },
                      { label: 'Yaş', value: selectedPerson.age },
                      { label: 'ID', value: selectedPerson.id },
                    ].map(item => (
                      <div key={item.label} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                        <p className="text-[9px] text-muted-foreground uppercase font-bold mb-1">{item.label}</p>
                        <p className="text-sm font-bold text-foreground/90">{item.value || 'Bilinmiyor'}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed italic bg-white/5 p-4 rounded-2xl border border-dashed border-white/10">
                    "{selectedPerson.bio || 'Bu kişinin biyografisi bulunmuyor.'}"
                  </p>
                </section>

                {/* MEDIA */}
                <section>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" /> Arşiv Kanıtları ({personMedia.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {personMedia.map(m => (
                      <div
                        key={m.id}
                        className="aspect-square rounded-2xl overflow-hidden border border-white/5 bg-secondary/30 relative group/media transition-all shadow-lg"
                      >
                        <img src={m.url.startsWith('/uploads') ? `${FILE_BASE}${m.url}` : m.url} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button
                            onClick={() => setEnlargedMedia(m)}
                            className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-md transition-all"
                          >
                            <Search className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Bu fotoğrafı arşivden kalıcı olarak silmek istiyor musunuz?')) {
                                deleteMediaMutation.mutate(m.id)
                              }
                            }}
                            className="p-2 bg-destructive/60 hover:bg-destructive/80 rounded-full text-white backdrop-blur-md transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        {m.note && (
                          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/media:opacity-100 transition-opacity">
                            <p className="text-[8px] text-white font-medium truncate">{m.note}</p>
                          </div>
                        )}
                      </div>
                    ))}
                    {personMedia.length === 0 && (
                      <div className="col-span-full py-12 text-center border border-dashed border-border rounded-3xl text-muted-foreground/30 text-xs italic">
                        Henüz kanıt fotoğrafı eklenmemiş.
                      </div>
                    )}
                  </div>
                </section>

                {/* LOGS */}
                <section>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" /> Arşiv Notları ({personLogs.filter(l => l.type === 'note').length})
                  </h4>
                  <div className="space-y-4">
                    {personLogs.filter(l => l.type === 'note').map(log => (
                      <div key={log.id} className="p-5 rounded-3xl bg-white/5 border border-white/5 space-y-3 relative overflow-hidden group/note">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/40" />

                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                              {log.author?.[0].toUpperCase()}
                            </div>
                            <span className="text-[10px] font-bold text-primary">{log.author}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground font-medium">{new Date(log.timestamp).toLocaleString()}</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingNote(log.id)
                                  setEditContent(log.content)
                                }}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-all"
                              >
                                <RefreshCcw className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Bu istihbarat notunu kalıcı olarak silmek istiyor musunuz?')) {
                                    deleteNoteMutation.mutate(log.id)
                                  }
                                }}
                                className="p-1.5 hover:bg-destructive/20 rounded-lg text-muted-foreground hover:text-destructive transition-all"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {editingNote === log.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary/50"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingNote(null)} className="px-3 py-1 text-[10px] font-bold text-muted-foreground hover:text-white">İptal</button>
                              <button
                                onClick={() => updateNoteMutation.mutate({ id: log.id, content: editContent })}
                                className="px-4 py-1 bg-primary text-white rounded-lg text-[10px] font-bold"
                              >
                                GÜNCELLE
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground/90 leading-relaxed font-medium">
                            {log.content}
                          </p>
                        )}
                      </div>
                    ))}
                    {personLogs.filter(l => l.type === 'note').length === 0 && (
                      <div className="py-12 text-center border border-dashed border-border rounded-3xl text-muted-foreground/30 text-xs italic">
                        Herhangi bir istihbarat notu bulunmuyor.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX */}
      <AnimatePresence>
        {enlargedMedia && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEnlargedMedia(null)}
              className="fixed inset-0 bg-black/95 z-[200] backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[201] flex items-center justify-center p-8 pointer-events-none"
            >
              <div className="max-w-5xl w-full flex flex-col items-center pointer-events-auto">
                <img
                  src={enlargedMedia.url.startsWith('/uploads') ? `${FILE_BASE}${enlargedMedia.url}` : enlargedMedia.url}
                  className="max-h-[80vh] w-auto rounded-2xl shadow-2xl border border-white/10"
                />
                {enlargedMedia.note && (
                  <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
                    <p className="text-sm text-white/90 font-medium italic">"{enlargedMedia.note}"</p>
                  </div>
                )}
                <button
                  onClick={() => setEnlargedMedia(null)}
                  className="mt-8 px-8 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/10"
                >
                  KAPAT
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
