import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Image as ImageIcon, User, Calendar, ExternalLink,
  Search, Filter, X, Download, ChevronLeft, ChevronRight,
  Plus, Upload, FileText, Shield, Trash2, Pencil
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import axios from 'axios'
import { cn } from '../lib/utils'
import { API_BASE, FILE_BASE } from '../lib/apiBase'

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

export default function Gallery({ setView, setSelectedId, setHighlightMediaId }) {
  const queryClient = useQueryClient()
  const [previewIndex, setPreviewIndex] = useState(localStorage.getItem('nexus_gallery_preview_index') !== null ? parseInt(localStorage.getItem('nexus_gallery_preview_index')) : null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [searchResults, setSearchResults] = useState({ people: [], media: [] })
  const [isSearching, setIsSearching] = useState(false)

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadNote, setUploadNote] = useState('')
  const [uploadTargetId, setUploadTargetId] = useState('')
  const [uploadPreview, setUploadPreview] = useState(null)
  const [uploadSearch, setUploadSearch] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [tempNote, setTempNote] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Persist Preview Index
  useEffect(() => {
    if (previewIndex !== null) localStorage.setItem('nexus_gallery_preview_index', previewIndex)
    else localStorage.removeItem('nexus_gallery_preview_index')
  }, [previewIndex])

  const { data: people = [] } = useQuery({
    queryKey: ['people-list'],
    queryFn: () => axios.get(`${API_BASE}/people`, { headers: getHeaders() }).then(res => res.data)
  })

  const filteredPeople = people.filter(p =>
    p.display_name?.toLowerCase().includes(uploadSearch.toLowerCase()) ||
    p.username?.toLowerCase().includes(uploadSearch.toLowerCase()) ||
    p.real_name?.toLowerCase().includes(uploadSearch.toLowerCase())
  ).slice(0, 5)

  const uploadMutation = useMutation({
    mutationFn: (data) => axios.post(`${API_BASE}/media`, data, { headers: getHeaders() }),
    onSuccess: () => {
      setIsUploadModalOpen(false)
      setUploadPreview(null)
      setUploadNote('')
      setUploadTargetId('')
      setUploadSearch('')
      queryClient.invalidateQueries(['global-media'])
    }
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/media/${id}`, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries(['global-media'])
      setPreviewIndex(null)
      setDeleteConfirmId(null)
    }
  })

  const editNoteMutation = useMutation({
    mutationFn: ({ id, note }) => axios.put(`${API_BASE}/media/${id}/note`, { note }, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries(['global-media'])
      setIsEditingNote(false)
    }
  })

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setUploadPreview(reader.result)
      reader.readAsDataURL(file)
    }
  }

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      if (search.trim()) {
        fetchSuggestions(search)
        setShowSuggestions(true)
      } else {
        setSearchResults({ people: [], media: [] })
        setShowSuggestions(false)
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [search])

  const fetchSuggestions = async (q) => {
    setIsSearching(true)
    try {
      const res = await axios.get(`${API_BASE}/search?q=${encodeURIComponent(q)}&filter=active`, { headers: getHeaders() })
      setSearchResults({
        people: res.data.people || [],
        media: res.data.media || []
      })
    } catch (err) {
      console.error(err)
    } finally {
      setIsSearching(false)
    }
  }

  const { data: media = [], isLoading, isPlaceholderData } = useQuery({
    queryKey: ['global-media', debouncedSearch, selectedPerson?.id],
    queryFn: () => axios.get(`${API_BASE}/media`, {
      params: { 
        q: debouncedSearch,
        targetId: selectedPerson?.id
      },
      headers: getHeaders()
    }).then(res => res.data),
    placeholderData: keepPreviousData
  })

  const handleDownload = async (url) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;

      // Extract extension from URL or fallback to blob type
      const urlExt = url.split('.').pop().split(/[?#]/)[0];
      const ext = (urlExt && urlExt.length <= 4) ? urlExt : blob.type.split('/')[1] || 'png';

      link.download = `nexus_archive_${Date.now()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      window.open(url, '_blank');
    }
  };

  return (
    <>
      <div className="space-y-8 h-full flex flex-col">
        {/* Header removed as per user request */}

        <div className="flex-1 relative min-h-0 flex flex-col">
          {/* Floating Search & Filter HUD */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-8 pt-2 pointer-events-none">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-background/60 backdrop-blur-2xl border border-border rounded-[28px] p-2 flex items-center gap-2 shadow-2xl pointer-events-auto"
            >
                <div className="relative flex-1 group flex items-center gap-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  
                  <div className="flex-1 flex items-center bg-secondary/30 rounded-2xl pl-12 pr-4 py-1.5 min-h-[44px]">
                    {selectedPerson && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="flex items-center gap-2 bg-primary/20 border border-primary/30 rounded-full pl-1.5 pr-2 py-1 shrink-0"
                      >
                        <div className="w-5 h-5 rounded-full overflow-hidden border border-primary/20">
                          {selectedPerson.avatar ? (
                            <img src={`https://cdn.discordapp.com/avatars/${selectedPerson.id}/${selectedPerson.avatar}.${selectedPerson.avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full object-cover" />
                          ) : <User className="w-full h-full p-1 text-primary" />}
                        </div>
                        <span className="text-xs font-bold text-primary truncate max-w-[120px]">{selectedPerson.display_name}</span>
                        <button
                          onClick={() => {
                            setSelectedPerson(null);
                            setSearch('');
                            setDebouncedSearch('');
                          }}
                          className="p-0.5 hover:bg-primary/20 rounded-full text-primary transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.div>
                    )}
                    
                    <input
                      type="text"
                      placeholder={selectedPerson ? "" : "Arşivde ara (İsim, Konum, Not...)"}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onFocus={() => search.trim() && setShowSuggestions(true)}
                      className="w-full bg-transparent border-none outline-none text-sm py-1.5 placeholder:text-muted-foreground/50"
                    />
                  </div>

                {/* Suggestions Dropdown */}
                <AnimatePresence>
                  {showSuggestions && search.trim() && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-3 bg-card/95 backdrop-blur-xl border border-border rounded-[24px] shadow-2xl overflow-hidden z-[200] max-h-[400px] overflow-y-auto custom-scrollbar"
                    >
                      {isSearching ? (
                        <div className="p-8 text-center text-[10px] font-black text-primary animate-pulse uppercase tracking-[0.2em]">ARANIYOR...</div>
                      ) : (
                        <div className="p-3 space-y-4">
                          {searchResults.people?.length > 0 && (
                            <div>
                              <h4 className="px-3 py-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-widest">Eşleşen Kişiler</h4>
                              <div className="space-y-1">
                                {searchResults.people.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      setSelectedPerson(p);
                                      setSearch('');
                                      setDebouncedSearch(p.display_name);
                                      setShowSuggestions(false);
                                    }}
                                    className="w-full flex items-center gap-3 p-2.5 hover:bg-primary/10 rounded-xl transition-all text-left group"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                                      {p.avatar ? (
                                        <img src={`https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.${p.avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full object-cover" />
                                      ) : <User className="w-4 h-4 text-primary" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold truncate">{p.display_name}</div>
                                      <div className="text-[9px] text-muted-foreground truncate">@{p.username}</div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {searchResults.media?.length > 0 && (
                            <div>
                              <h4 className="px-3 py-1.5 text-[9px] font-black text-muted-foreground uppercase tracking-widest">Medya Önizleme</h4>
                              <div className="grid grid-cols-5 gap-2 px-2 pb-2">
                                {searchResults.media.map(m => (
                                  <div
                                    key={m.id}
                                    className="aspect-square rounded-lg overflow-hidden border border-border/50 hover:border-primary/50 transition-all cursor-pointer relative group/sug"
                                    onClick={() => {
                                      const p = people.find(person => person.id === m.target_id) || { id: m.target_id, display_name: m.target_name, avatar: m.target_avatar };
                                      setSelectedPerson(p);
                                      setSearch('');
                                      setDebouncedSearch(m.target_name);
                                      setShowSuggestions(false);
                                      // Find index in current media list if possible
                                      const idx = media.findIndex(item => item.id === m.id);
                                      if (idx !== -1) {
                                        setPreviewIndex(idx);
                                      }
                                    }}
                                  >
                                    <img
                                      src={m.url.startsWith('/uploads') ? `${FILE_BASE}${m.url}` : m.url}
                                      className="w-full h-full object-cover group-hover/sug:scale-110 transition-transform"
                                    />
                                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/sug:opacity-100 transition-opacity flex items-center justify-center">
                                      <ExternalLink className="w-4 h-4 text-white" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {!searchResults.people?.length && !searchResults.media?.length && (
                            <div className="p-6 text-center text-muted-foreground italic text-xs">Sonuç bulunamadı.</div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="pt-20"> {/* Padding to avoid HUD overlap initially */}
          <div className={cn(
            "transition-opacity duration-300",
            isPlaceholderData ? "opacity-50 pointer-events-none" : "opacity-100"
          )}>
            {isLoading && media.length === 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="aspect-square rounded-3xl bg-secondary animate-pulse" />)}
              </div>
            ) : media.length === 0 ? (
            <div
              onClick={() => setIsUploadModalOpen(true)}
              className="p-20 text-center border border-dashed border-border rounded-[40px] bg-secondary/5 cursor-pointer hover:bg-primary/5 transition-all group"
            >
              <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 group-hover:bg-primary/10 transition-all">
                <ImageIcon className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-lg font-bold group-hover:text-primary transition-colors">Henüz medya yok</h3>
              <p className="text-muted-foreground text-sm mt-1">Buraya tıklayarak veya kişi profillerinden fotoğraf ekleyerek galeriyi doldurabilirsiniz.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {/* Add New Media Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setIsUploadModalOpen(true)}
                className="group relative aspect-square rounded-[32px] overflow-hidden border border-dashed border-border bg-secondary/10 hover:bg-primary/5 hover:border-primary/50 transition-all cursor-pointer flex flex-col items-center justify-center gap-3"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">Yeni Kanıt</span>
                  <span className="text-[9px] text-muted-foreground font-bold uppercase opacity-60">DOSYA YÜKLE</span>
                </div>
                
                {/* Subtle Hover Effect */}
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>

              {media.map((item, i) => {
                const imageUrl = item.url.startsWith('/uploads') ? `${FILE_BASE}${item.url}` : item.url;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ 
                      type: "spring",
                      stiffness: 260,
                      damping: 20,
                      delay: i * 0.02 
                    }}
                    className="group relative aspect-square rounded-[32px] overflow-hidden border border-border bg-card shadow-2xl hover:border-primary/50 transition-all cursor-zoom-in"
                    onClick={() => setPreviewIndex(i)}
                  >
                    <img
                      src={imageUrl}
                      className={cn(
                        "w-full h-full object-cover transition-transform duration-500 group-hover:scale-110",
                        item.is_deleted && "opacity-40 grayscale"
                      )}
                      alt="Evidence"
                    />

                    {item.is_deleted && (
                      <div className="absolute top-4 left-4 z-20 px-3 py-1 bg-destructive/80 backdrop-blur-md rounded-xl text-[9px] font-black text-white uppercase tracking-[0.2em] shadow-xl border border-white/10">
                        SİLİNDİ (ARŞİVDE)
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full overflow-hidden border border-white/20">
                            {item.target_avatar ? (
                              <img src={`https://cdn.discordapp.com/avatars/${item.target_id}/${item.target_avatar}.${item.target_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-full h-full p-1 text-white" />
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-white tracking-tight truncate">{item.target_name}</span>
                        </div>

                        <div className="pt-2 border-t border-white/10">
                          <p className="text-[10px] text-white/60 font-medium mb-1.5">Ekleyen Operatör:</p>
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full overflow-hidden border border-white/10 shrink-0">
                              {item.author_avatar ? (
                                <img src={`https://cdn.discordapp.com/avatars/${item.author_discord_id}/${item.author_avatar}.${item.author_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                                  <User className="w-3 h-3 text-primary" />
                                </div>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-primary truncate">{item.author}</p>
                          </div>
                        </div>

                        {item.note && (
                          <div className="pt-2">
                            <p className="text-[10px] text-white/90 italic line-clamp-2 leading-relaxed">
                              "{item.note}"
                            </p>
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-2">
                          <div className="flex items-center gap-1.5 text-white/40">
                            <Calendar className="w-3 h-3" />
                            <span className="text-[9px] font-bold uppercase">{new Date(item.timestamp).toLocaleDateString()}</span>
                          </div>
                          <div className="p-1.5 bg-white/10 rounded-lg text-white">
                            <ImageIcon className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Image Preview Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence mode="wait">
          {previewIndex !== null && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-12 overflow-hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/95 backdrop-blur-3xl"
                onClick={() => setPreviewIndex(null)}
              />

              {/* Top Bar Controls */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-8 left-8 right-8 z-[110] flex justify-between items-center"
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Merkezi Arşiv Kanıtı</span>
                  <span className="text-white/60 text-xs font-medium">{previewIndex + 1} / {media.length} — {media[previewIndex]?.target_name}</span>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      const m = media?.[previewIndex];
                      if (!m) return;
                      setSelectedId(m.target_id);
                      setHighlightMediaId(m.id);
                      setView('people');
                    }}
                    className="p-3 bg-white/5 hover:bg-primary/20 hover:text-primary rounded-2xl text-white transition-all active:scale-95 flex items-center gap-3 group"
                    title="Kaynağa Git"
                  >
                    <ExternalLink className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest pr-1">Kaynağa Git</span>
                  </button>
                  <button
                    onClick={() => {
                      const item = media?.[previewIndex];
                      if (!item) return;
                      setDeleteConfirmId(item.id);
                    }}
                    className="p-3 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-2xl transition-all active:scale-95"
                    title="Kanıtı Sil"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => {
                      const item = media?.[previewIndex];
                      if (!item) return;
                      const url = item.url.startsWith('/uploads') ? `${FILE_BASE}${item.url}` : item.url;
                      handleDownload(url);
                    }}
                    className="p-3 bg-white/5 hover:bg-primary/20 hover:text-primary rounded-2xl text-white transition-all active:scale-95 flex items-center gap-3 group"
                  >
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span className="text-[10px] font-bold uppercase tracking-widest pr-1">Arşivi İndir</span>
                  </button>
                  <button
                    onClick={() => setPreviewIndex(null)}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all active:scale-95"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </motion.div>

              {/* Navigation Buttons */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-8 top-1/2 -translate-y-1/2 z-[110] flex justify-between pointer-events-none px-4"
              >
                <button
                  disabled={previewIndex === 0}
                  onClick={(e) => { e.stopPropagation(); setPreviewIndex(prev => prev - 1); }}
                  className="p-5 bg-black/40 hover:bg-primary/20 rounded-full text-white transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed pointer-events-auto backdrop-blur-md border border-white/5 shadow-2xl"
                >
                  <ChevronLeft className="w-10 h-10" />
                </button>
                <button
                  disabled={previewIndex === media.length - 1}
                  onClick={(e) => { e.stopPropagation(); setPreviewIndex(prev => prev + 1); }}
                  className="p-5 bg-black/40 hover:bg-primary/20 rounded-full text-white transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed pointer-events-auto backdrop-blur-md border border-white/5 shadow-2xl"
                >
                  <ChevronRight className="w-10 h-10" />
                </button>
              </motion.div>

              <motion.div
                key={previewIndex}
                initial={{ opacity: 0, scale: 0.9, x: 50 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: -50 }}
                className="relative z-[110] w-full h-full flex flex-col items-center justify-center pointer-events-none p-12 gap-6"
              >
                <div className="relative group/image pointer-events-auto max-w-full max-h-[90vh] flex flex-col items-center justify-center">
                  <img
                    src={media?.[previewIndex]?.url.startsWith('/uploads') ? `${FILE_BASE}${media[previewIndex].url}` : media?.[previewIndex]?.url}
                    className="max-w-full max-h-[70vh] object-contain rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.9)] select-none border border-white/10"
                  />
                  {media?.[previewIndex]?.note && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-6 bg-white/5 backdrop-blur-md border border-white/10 rounded-[24px] max-w-2xl min-w-[320px] pointer-events-auto"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">Kanıt Notu</span>
                          </div>
                          {!isEditingNote && !showDeleteConfirm && (
                            <div className="flex items-center gap-1 opacity-0 group-hover/image:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setIsEditingNote(true)
                                  setTempNote(media[previewIndex].note || '')
                                }}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-primary transition-all"
                              >
                                <Pencil className="w-3 h-3" title="Düzenle" />
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="p-1.5 hover:bg-destructive/10 rounded-lg text-white/40 hover:text-destructive transition-all"
                              >
                                <Trash2 className="w-3 h-3" title="Notu Kaldır" />
                              </button>
                            </div>
                          )}
                          {showDeleteConfirm && (
                            <motion.div
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-2 px-3 py-1 bg-destructive/10 border border-destructive/20 rounded-full"
                            >
                              <span className="text-[9px] font-bold text-destructive">EMİN MİSİNİZ?</span>
                              <button
                                onClick={() => {
                                  editNoteMutation.mutate({ id: media[previewIndex].id, note: '' })
                                  setShowDeleteConfirm(false)
                                }}
                                className="text-[9px] font-black text-destructive hover:underline"
                              >
                                SİL
                              </button>
                              <div className="w-px h-2 bg-destructive/20" />
                              <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="text-[9px] font-bold text-white/40 hover:text-white"
                              >
                                VAZGEÇ
                              </button>
                            </motion.div>
                          )}
                        </div>
                        <div className="flex flex-col items-end opacity-60">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[9px] font-bold text-white/70 uppercase tracking-tighter">{media?.[previewIndex]?.author || 'Sistem'}</span>
                            {media?.[previewIndex]?.author_avatar ? (
                              <img
                                src={`https://cdn.discordapp.com/avatars/${media[previewIndex].author_discord_id}/${media[previewIndex].author_avatar}.${media[previewIndex].author_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`}
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                              />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center border border-white/10">
                                <User className="w-2 h-2 text-primary" />
                              </div>
                            )}
                          </div>
                          <span className="text-[8px] text-white/50">{new Date(media?.[previewIndex]?.timestamp).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="border-t border-white/5 pt-3">
                        {isEditingNote ? (
                          <div className="space-y-3">
                            <div className="relative">
                              <textarea
                                value={tempNote}
                                onChange={(e) => setTempNote(e.target.value)}
                                maxLength={500}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    editNoteMutation.mutate({ id: media[previewIndex].id, note: tempNote });
                                  }
                                  if (e.key === 'Escape') setIsEditingNote(false);
                                }}
                                autoFocus
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-primary resize-none h-24 text-center"
                                placeholder="Notu buraya yazın..."
                              />
                              <div className="absolute bottom-2 right-3 text-[8px] font-bold text-white/20 uppercase tracking-widest">
                                {tempNote.length} / 500
                              </div>
                            </div>
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => setIsEditingNote(false)}
                                className="px-4 py-1.5 rounded-lg text-[10px] font-bold text-white/50 hover:bg-white/5 transition-all"
                              >
                                İPTAL
                              </button>
                              <button
                                onClick={() => editNoteMutation.mutate({ id: media[previewIndex].id, note: tempNote })}
                                disabled={editNoteMutation.isPending}
                                className="px-4 py-1.5 rounded-lg text-[10px] font-bold bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                              >
                                {editNoteMutation.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="max-h-32 overflow-y-auto custom-scrollbar pr-1">
                            <p className="text-white/90 text-sm italic leading-relaxed text-center break-words whitespace-pre-wrap">
                              {media?.[previewIndex]?.note ? `"${media[previewIndex].note}"` : <span className="opacity-30 italic">Not eklenmemiş...</span>}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsUploadModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-card border border-border rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Arşive Yeni Kanıt Ekle</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Sisteme doğrudan fotoğraf ve veri girişi yapın.</p>
                    </div>
                  </div>
                  <button onClick={() => setIsUploadModalOpen(false)} className="p-2 hover:bg-secondary rounded-xl transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">1. FOTOĞRAF SEÇ</span>
                      <div className="relative aspect-square rounded-[24px] border-2 border-dashed border-border hover:border-primary/50 transition-all bg-secondary/5 overflow-hidden group cursor-pointer">
                        {uploadPreview ? (
                          <>
                            <img src={uploadPreview} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold uppercase">Değiştir</div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                            <ImageIcon className="w-8 h-8 mb-2 opacity-20" />
                            <span className="text-[10px] font-bold text-center">DOSYA SEÇ VEYA SÜRÜKLE</span>
                          </div>
                        )}
                        <input type="file" onChange={handleFileSelect} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                      </div>
                    </label>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">2. İLGİLİ KİŞİYİ SEÇ</label>
                      <div className="relative group">
                        <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Kişi ara..."
                          value={uploadSearch}
                          onChange={(e) => setUploadSearch(e.target.value)}
                          className="w-full bg-secondary/50 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-primary transition-all"
                        />
                        {uploadSearch && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-[100] max-h-[150px] overflow-y-auto">
                            {filteredPeople.map(p => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setUploadTargetId(p.id)
                                  setUploadSearch(p.display_name)
                                }}
                                className={cn(
                                  "w-full flex items-center gap-3 p-2.5 hover:bg-secondary text-left transition-colors",
                                  uploadTargetId === p.id && "bg-primary/10"
                                )}
                              >
                                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                                  {p.avatar ? <img src={`https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.${p.avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} /> : <User className="w-3 h-3" />}
                                </div>
                                <div className="text-xs font-bold">{p.display_name}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {uploadTargetId && (
                        <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-1">
                          <Shield className="w-3 h-3 text-primary" />
                          <span className="text-[10px] font-bold text-primary uppercase">SEÇİLDİ: {people.find(p => p.id === uploadTargetId)?.display_name}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">3. NOT (OPSİYONEL)</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground" />
                        <textarea
                          placeholder="Kanıt hakkında not düş..."
                          value={uploadNote}
                          onChange={(e) => setUploadNote(e.target.value)}
                          className="w-full bg-secondary/50 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-primary transition-all h-24 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setIsUploadModalOpen(false)}
                    className="flex-1 py-3.5 rounded-2xl text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:bg-secondary transition-all"
                  >
                    Vazgeç
                  </button>
                  <button
                    disabled={!uploadPreview || !uploadTargetId || uploadMutation.isPending}
                    onClick={() => uploadMutation.mutate({
                      target_id: uploadTargetId,
                      url: uploadPreview,
                      note: uploadNote,
                      isBase64: true
                    })}
                    className="flex-[2] py-3.5 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {uploadMutation.isPending ? "Yükleniyor..." : <><Plus className="w-4 h-4" /> Arşive Kaydet</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setDeleteConfirmId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-card border border-border rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto text-destructive">
                  <Trash2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Kanıtı Sil?</h3>
                  <p className="text-sm text-muted-foreground mt-2 px-4">Bu işlem geri alınamaz. Kanıt dosyası arşivden kalıcı olarak silinecektir.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => deleteMediaMutation.mutate(deleteConfirmId)}
                    disabled={deleteMediaMutation.isPending}
                    className="w-full py-4 bg-destructive text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-destructive/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    {deleteMediaMutation.isPending ? "SİLİNİYOR..." : "EVET, KALICI OLARAK SİL"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="w-full py-4 bg-secondary text-foreground rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-secondary/80 transition-all"
                  >
                    VAZGEÇ
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
