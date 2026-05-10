import React, { isValidElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { cn } from '../lib/utils'
import { Users, History, Image as ImageIcon, Activity, X, FileText, User as UserIcon, Tags, MapPin } from 'lucide-react'
import Linkify from './Linkify'
import LogRichContent from './LogRichContent'
import { logContentLooksLikeDeletion, logContentLooksLikeUpload, stripLeadingAuthorFromLogContent } from '../lib/logDetect'
import { API_BASE, FILE_BASE } from '../lib/apiBase'
const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

export default function Dashboard({ user: propUser, setView, setSelectedId, setHighlightLogId }) {
  const user = propUser || JSON.parse(localStorage.getItem('nexus_user') || '{}')
  const [enlargedLogMedia, setEnlargedLogMedia] = React.useState(null)
  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => axios.get(`${API_BASE}/people`, { headers: getHeaders() }).then(res => res.data)
  })

  const { data: logs = [] } = useQuery({
    queryKey: ['logs'],
    queryFn: () => axios.get(`${API_BASE}/logs`, { headers: getHeaders() }).then(res => res.data)
  })

  const { data: media = [] } = useQuery({
    queryKey: ['media'],
    queryFn: () => axios.get(`${API_BASE}/media`, { headers: getHeaders() }).then(res => res.data)
  })

  const stats = [
    { label: 'Takip Edilen Hedef', value: people.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Toplam Kayıt', value: logs.length, icon: History, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Medya Kanıtı', value: media.length, icon: ImageIcon, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Aktif İzleme', value: '7/24', icon: Activity, color: 'text-red-500', bg: 'bg-red-500/10' },
  ]

  const targetInsights = React.useMemo(() => {
    const n = people.length || 1;
    const guildCounts = new Map()
    for (const p of people) {
      try {
        const raw = p.guilds
        const g = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
        if (Array.isArray(g) && g.length > 0 && g[0]?.name) {
          const label = g[0].name
          guildCounts.set(label, (guildCounts.get(label) || 0) + 1)
        } else {
          guildCounts.set('Etiket yok / senkron yok', (guildCounts.get('Etiket yok / senkron yok') || 0) + 1)
        }
      } catch {
        guildCounts.set('Etiket yok / senkron yok', (guildCounts.get('Etiket yok / senkron yok') || 0) + 1)
      }
    }
    const guildRows = [...guildCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)

    const mediaCounts = {}
    for (const m of media) {
      if (m.is_deleted) continue
      const tid = m.target_id
      if (!tid) continue
      mediaCounts[tid] = (mediaCounts[tid] || 0) + 1
    }
    const topMedia = Object.entries(mediaCounts)
      .map(([id, count]) => ({
        id,
        count,
        person: people.find((x) => x.id === id),
      }))
      .filter((x) => x.person)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    let locFilled = 0
    const cityHints = new Map()
    for (const p of people) {
      const loc = (p.location || '').trim()
      if (loc) {
        locFilled++
        const parts = loc.split(',').map((s) => s.trim()).filter(Boolean)
        const key = parts.length ? parts[parts.length - 1] : loc
        if (key.length > 1) cityHints.set(key, (cityHints.get(key) || 0) + 1)
      }
    }
    const topLocations = [...cityHints.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)

    return { guildRows, n, topMedia, locFilled, locEmpty: people.length - locFilled, topLocations }
  }, [people, media])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Genel Durum</h1>
        <p className="text-muted-foreground mt-1">Sistem üzerindeki tüm aktif istihbarat verileri.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 rounded-2xl border border-border bg-card/50 hover:bg-card transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className={stat.bg + " p-3 rounded-xl transition-transform group-hover:scale-110"}>
                <stat.icon className={"w-6 h-6 " + stat.color} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <h3 className="text-3xl font-bold mt-1 tracking-tighter">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold">Son Aktiviteler</h2>
          <div className="space-y-4">
            {logs.slice(0, 10).map((log, i) => {
              const urlMatch = log.content.match(/\(URL: ([^, \)]+)/);
              const url = urlMatch ? urlMatch[1] : null;
              const fullUrl = url ? (url.startsWith('/uploads') ? `${FILE_BASE}${url}` : url) : null;
              
              // Extract clean message by removing author name and metadata
              let rawContent = log.content.split('(URL:')[0].trim();
              rawContent = stripLeadingAuthorFromLogContent(rawContent, log.author);
              // Remove the (Hedef: Name) part
              rawContent = rawContent.replace(/\(Hedef:.*?\)/, '').trim();

              // Format JSON content if it's an automation log
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
                      <div className="space-y-4">
                        <p className="font-bold text-primary italic uppercase tracking-tighter">
                          {type === 'banner' ? 'Kapak fotoğrafı yenilendi' : 'Profil fotoğrafı yenilendi'}
                        </p>
                        <div className="flex flex-wrap gap-4">
                          {oldUrl && (
                            <div className="space-y-2">
                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Eskisi</span>
                              <div 
                                className={cn("rounded-xl border border-border overflow-hidden bg-secondary/30 cursor-zoom-in", type === 'banner' ? "w-48 aspect-[16/9]" : "w-16 h-16 rounded-full")}
                                onClick={() => setEnlargedLogMedia({ url: getDiscordUrl(userId, oldHash, type, 2048) })}
                              >
                                <img src={oldUrl} className="w-full h-full object-cover" alt="Eski" />
                              </div>
                            </div>
                          )}
                          {newUrl ? (
                            <div className="space-y-2">
                              <span className="text-[10px] font-black text-primary uppercase tracking-widest">Yenisi</span>
                              <div 
                                className={cn("rounded-xl border border-primary/30 overflow-hidden bg-secondary/30 shadow-lg shadow-primary/5 cursor-zoom-in", type === 'banner' ? "w-48 aspect-[16/9]" : "w-16 h-16 rounded-full")}
                                onClick={() => setEnlargedLogMedia({ url: getDiscordUrl(userId, newHash, type, 2048) })}
                              >
                                <img src={newUrl} className="w-full h-full object-cover" alt="Yeni" />
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <span className="text-[10px] font-black text-destructive uppercase tracking-widest">Durum</span>
                              <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-xl text-[10px] font-bold text-destructive">GÖRSEL KALDIRILDI</div>
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
                      <div className="space-y-4 py-1">
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

              const message = formatLogContent(rawContent);
              const messageBody = isValidElement(message) ? (
                message
              ) : (
                <LogRichContent
                  content={typeof message === 'string' ? message : String(message ?? '')}
                  log={log}
                  setSelectedId={setSelectedId}
                  setView={setView}
                />
              );

              // Action types for badges
              const isDelete = log.type === 'system' && logContentLooksLikeDeletion(log.content);
              const isUpload = log.type === 'system' && logContentLooksLikeUpload(log.content);
              const isNote = log.type === 'note';
              const isAuto = log.type === 'system' && (log.content.includes('"type"') || log.content.includes('{'));
              
              return (
                <motion.div 
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group relative flex gap-5 p-5 rounded-[24px] border border-border/50 bg-card/20 hover:bg-card/40 hover:border-primary/20 transition-all shadow-sm hover:shadow-xl hover:shadow-primary/5 overflow-hidden"
                >
                  {/* Left Column: Avatar & Action Line */}
                  <div className="relative flex flex-col items-center flex-shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center overflow-hidden border-2 border-border group-hover:border-primary/50 transition-colors shadow-lg">
                      {log.author_avatar ? (
                        <img 
                          src={`https://cdn.discordapp.com/avatars/${log.author_discord_id}/${log.author_avatar}.${log.author_avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`} 
                          className="w-full h-full object-cover" 
                        />
                      ) : log.target_avatar ? (
                        <img 
                          src={`https://cdn.discordapp.com/avatars/${log.target_id}/${log.target_avatar}.${log.target_avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`} 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                          <Activity className="w-6 h-6 text-primary" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Content */}
                  <div className="flex-1 min-w-0 py-0.5">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white tracking-tight uppercase truncate max-w-[150px]">
                          {log.author_avatar ? log.author : (log.target_name || log.author)}
                        </span>
                        <div className="w-1 h-1 rounded-full bg-border" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                      
                      {/* Action Badge */}
                      <div className={cn(
                        "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border whitespace-nowrap",
                        isDelete ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        isUpload ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                        isNote ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        isAuto ? "bg-purple-500/10 text-purple-500 border-purple-500/20" :
                        "bg-primary/10 text-primary border-primary/20"
                      )}>
                        {isDelete ? 'Silme / arşiv' : isUpload ? 'Kanıt eklendi' : isNote ? 'İstihbarat notu' : isAuto ? 'Otomatik kayıt' : 'Sistem'}
                      </div>
                    </div>

                    <div className="text-sm text-foreground/80 leading-relaxed font-medium group-hover:text-foreground transition-colors" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                      {messageBody}
                    </div>

                    {/* Media Preview inside Log */}
                    {url && (
                      <div className="mt-4">
                        <div className="relative inline-block group/media-card">
                          <div className="w-64 aspect-video rounded-2xl overflow-hidden border border-border/50 bg-black/40 shadow-2xl">
                            {url.match(/\.(mp4|webm)$/i) ? (
                              <video src={fullUrl} className="w-full h-full object-cover" muted />
                            ) : (
                              <img src={fullUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover/media-card:scale-110" />
                            )}
                            
                            {/* Click Overlay */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/media-card:opacity-100 transition-all duration-300 flex items-center justify-center">
                              <button 
                                onClick={() => setEnlargedLogMedia({
                                  url: fullUrl,
                                  isVideo: url.match(/\.(mp4|webm)$/i),
                                  note: log.content.match(/Not: (.*?)\)/)?.[1]
                                })}
                                className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl text-white hover:bg-primary/20 hover:scale-110 active:scale-95 transition-all border border-white/10"
                              >
                                <ImageIcon className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                          
                          {isDelete && (
                            <div className="absolute -top-2 -right-2 px-2 py-1 bg-destructive/90 backdrop-blur-md rounded-lg text-[8px] font-black text-white uppercase tracking-widest shadow-2xl border border-white/10">
                              Arşivlendi
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Target Person Pill */}
                    {log.target_name && (
                      <div className="flex items-center mt-3">
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
                              <UserIcon className="w-full h-full p-0.5 text-muted-foreground" />
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-foreground truncate max-w-[200px]">{log.target_name}</span>
                          <div className="w-1 h-1 rounded-full bg-primary/40" />
                          <span className="text-[9px] font-bold text-primary opacity-0 group-hover/target:opacity-100 transition-opacity">MESAJA GİT</span>
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold">Hedef Dağılımı</h2>
          <div className="p-6 rounded-2xl border border-border bg-card/50 space-y-8">
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Henüz takip edilen hedef yok. Kişiler sekmesinden kayıt ekleyin; etiket ve kanıt özeti burada görünür.
              </p>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Tags className="w-4 h-4 text-primary" />
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Sunucu etiketi (guild)</h3>
                  </div>
                  <div className="space-y-3">
                    {targetInsights.guildRows.map(([label, count]) => {
                      const pct = Math.round((count / targetInsights.n) * 100)
                      return (
                        <div key={label} className="space-y-1.5">
                          <div className="flex justify-between text-[11px] gap-2">
                            <span className="font-semibold text-foreground truncate" title={label}>
                              {label}
                            </span>
                            <span className="text-muted-foreground shrink-0 tabular-nums">
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-r from-primary/80 to-violet-500/90"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <ImageIcon className="w-4 h-4 text-emerald-500/90" />
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      Kanıt yoğunluğu (en çok dosya)
                    </h3>
                  </div>
                  {targetInsights.topMedia.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Henüz bu hedeflere bağlı kanıt dosyası yok.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {targetInsights.topMedia.map(({ id, count, person }, idx) => (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(id)
                              setView('people')
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl border border-border/60 bg-secondary/20 hover:bg-primary/10 hover:border-primary/25 transition-all text-left group"
                          >
                            <span className="text-[10px] font-black text-primary/50 w-4 tabular-nums">{idx + 1}</span>
                            <div className="w-8 h-8 rounded-full overflow-hidden border border-border shrink-0">
                              {person.avatar ? (
                                <img
                                  src={`https://cdn.discordapp.com/avatars/${id}/${person.avatar}.${person.avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">
                                  {person.display_name?.[0]?.toUpperCase() || '?'}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate group-hover:text-primary transition-colors">
                                {person.display_name}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">@{person.username}</p>
                            </div>
                            <span className="text-xs font-black text-emerald-400/90 tabular-nums shrink-0">{count}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-amber-500/80" />
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Konum özeti</h3>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-secondary/60 border border-border text-[10px] font-semibold">
                      Konumlu: <span className="text-foreground">{targetInsights.locFilled}</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-secondary/60 border border-border text-[10px] font-semibold">
                      Boş: <span className="text-foreground">{targetInsights.locEmpty}</span>
                    </span>
                  </div>
                  {targetInsights.topLocations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {targetInsights.topLocations.map(([city, c]) => (
                        <span
                          key={city}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-muted-foreground"
                        >
                          {city}{' '}
                          <span className="text-foreground font-bold">{c}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic">Konum alanında veri girilmiş kayıt yok.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Enlarged Log Media Modal */}
      <AnimatePresence>
        {enlargedLogMedia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000000] flex items-center justify-center p-8 bg-background/95 backdrop-blur-xl"
            onClick={() => setEnlargedLogMedia(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative max-w-5xl w-full flex flex-col items-center gap-6"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setEnlargedLogMedia(null)}
                className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors"
              >
                <X className="w-8 h-8" />
              </button>

              <div className="w-full bg-secondary/30 rounded-[40px] border border-white/10 p-2 shadow-2xl overflow-hidden flex items-center justify-center min-h-[300px]">
                {enlargedLogMedia.isVideo ? (
                  <video src={enlargedLogMedia.url} controls className="max-w-full max-h-[70vh] rounded-[32px]" autoPlay />
                ) : (
                  <img src={enlargedLogMedia.url} className="max-w-full max-h-[70vh] object-contain rounded-[32px]" />
                )}
              </div>

              {enlargedLogMedia.note && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full p-6 bg-white/5 backdrop-blur-md border border-white/10 rounded-[24px]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-xs font-black text-primary uppercase tracking-widest">Kayıtlı Kanıt Notu</span>
                  </div>
                  <p className="text-sm text-white/80 italic leading-relaxed">"<Linkify>{enlargedLogMedia.note}</Linkify>"</p>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
