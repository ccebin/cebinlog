import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Notification from './Notification';
import ConfirmDialog from './ConfirmDialog';
import {
  Users,
  Shield,
  UserMinus,
  CheckCircle,
  XCircle,
  Clock,
  ShieldAlert,
  Search,
  MoreVertical,
  UserCheck,
  Share2,
  RefreshCw,
  Settings,
  Download,
  Upload,
  ShieldOff,
  Globe,
  WifiOff,
  Eye,
  EyeOff
} from 'lucide-react';
import { API_BASE } from '../lib/apiBase';

const Admin = ({ onUserUpdate }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [resetPassId, setResetPassId] = React.useState(null);
  const [newPass, setNewPass] = React.useState('');
  const [syncId, setSyncId] = React.useState(null);
  const [discordId, setDiscordId] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);

  // Custom Alerts State
  const [notification, setNotification] = React.useState(null);
  const [confirmData, setConfirmData] = React.useState(null);

  const notify = (message, type = 'success') => setNotification({ message, type });

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('nexus_token')}`
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => axios.get(`${API_BASE}/admin/users`, { headers: getHeaders() }).then(res => res.data)
  });

  const { data: bans = [], refetch: refetchBans } = useQuery({
    queryKey: ['bannedIps'],
    queryFn: () => axios.get(`${API_BASE}/admin/banned-ips`, { headers: getHeaders() }).then(res => res.data)
  });

  const banMutation = useMutation({
    mutationFn: ({ ip, reason, target_id }) => axios.post(`${API_BASE}/admin/banned-ips`, { ip, reason, target_id }, { headers: getHeaders() }),
    onSuccess: () => {
      refetchBans();
      notify('IP adresi başarıyla engellendi.', 'success');
    },
    onError: (err) => notify(err.response?.data?.error || 'IP engelleme başarısız.', 'error')
  });

  const unbanMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/admin/banned-ips/${id}`, { headers: getHeaders() }),
    onSuccess: () => {
      refetchBans();
      notify('IP engelini kaldırıldı.', 'success');
    }
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, approved }) => axios.put(`${API_BASE}/admin/users/${id}/approve`, { approved }, { headers: getHeaders() }),
    onSuccess: () => queryClient.invalidateQueries(['adminUsers'])
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => axios.put(`${API_BASE}/admin/users/${id}/role`, { role }, { headers: getHeaders() }),
    onSuccess: () => queryClient.invalidateQueries(['adminUsers'])
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/admin/users/${id}`, { headers: getHeaders() }),
    onSuccess: () => queryClient.invalidateQueries(['adminUsers'])
  });

  const syncDiscordMutation = useMutation({
    mutationFn: ({ id, discord_id }) => axios.put(`${API_BASE}/admin/users/${id}/sync-discord`, { discord_id }, { headers: getHeaders() }),
    onSuccess: (res, variables) => {
      queryClient.invalidateQueries(['adminUsers']);
      const currentUser = JSON.parse(localStorage.getItem('nexus_user'));
      if (variables.id === currentUser?.id && onUserUpdate) {
        onUserUpdate(res.data.user);
      }
      setSyncId(null);
      setDiscordId('');
    },
    onError: (err) => alert(err.response?.data?.error || 'Discord senkronizasyonu başarısız.')
  });

  const importMutation = useMutation({
    mutationFn: (data) => axios.post(`${API_BASE}/admin/import`, { data }, { headers: getHeaders() }),
    onSuccess: () => {
      notify('Veriler başarıyla içe aktarıldı. Uygulama yenileniyor...', 'success');
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (err) => notify(err.response?.data?.error || 'İçe aktarma başarısız.', 'error')
  });

  const discordResyncMutation = useMutation({
    mutationFn: (mode) =>
      axios
        .post(`${API_BASE}/admin/discord-resync-targets`, { mode }, { headers: getHeaders() })
        .then((res) => res.data),
    onSuccess: async (data, mode) => {
      const { summary } = data;
      notify(
        `Discord güncelleme (${mode === 'all' ? 'tüm aktifler' : 'stub kayıtlar'}): ${summary.ok} başarılı, ${summary.failed} hata / ${summary.targets} hedef.`,
        summary.failed > 0 ? 'error' : 'success',
      );
      await queryClient.refetchQueries({ queryKey: ['people'] });
    },
    onError: (err) => notify(err.response?.data?.error || err.message || 'Senk başarısız.', 'error')
  });

  const handleExport = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/export`, { headers: getHeaders() });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nexus_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      notify('Yedek başarıyla oluşturuldu.', 'success');
    } catch (err) {
      notify('Dışa aktarma başarısız.', 'error');
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (file) {
      setConfirmData({
        title: 'VERİLERİ GERİ YÜKLE',
        message: 'DİKKAT: Mevcut tüm veriler silinecek ve yedektekilerle değiştirilecek. Bu işlem geri alınamaz. Emin misiniz?',
        onConfirm: () => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const data = JSON.parse(ev.target.result);
              importMutation.mutate(data);
              setConfirmData(null);
            } catch (err) {
              notify('Geçersiz JSON dosyası.', 'error');
              setConfirmData(null);
            }
          };
          reader.readAsText(file);
        }
      });
    }
  };

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }) => axios.put(`${API_BASE}/admin/users/${id}/reset-password`, { password }, { headers: getHeaders() }),
    onSuccess: () => {
      alert('Şifre başarıyla sıfırlandı.');
      setResetPassId(null);
      setNewPass('');
    }
  });

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.display_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-primary" /> Yönetim Paneli
          </h1>
          <p className="text-muted-foreground mt-1 font-medium tracking-wide">Panel kullanıcılarını ve yetkilerini yönetin.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Kullanıcı ara..."
              className="w-full bg-secondary/50 border border-border rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:border-primary transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="h-8 w-px bg-border mx-2" />

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-6 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-xl text-xs font-black uppercase tracking-widest transition-all"
          >
            <Download className="w-4 h-4" /> Yedek Al
          </button>

          <div className="relative group/import">
            <input
              type="file" accept=".json"
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              onChange={handleImport}
            />
            <button className="flex items-center gap-2 px-6 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
              <Upload className="w-4 h-4" /> Yedeği Yükle
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-border bg-card/40 backdrop-blur-xl p-6 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-widest text-foreground">Hedef Discord profilleri</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              «NewUser_…» veya «User …» görünümlü yer tutucuları Discord ile doldurur. Kayıtlı anahtar ID 17–23 hane rakam değilse senk çalışmaz (kırık/kısa kimlik); profili doğru Discord ID ile silip yeniden açın. Çok kayıtta barındırma süresi yetmeyebilir.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={discordResyncMutation.isPending}
            onClick={() => discordResyncMutation.mutate('stubs')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            {discordResyncMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Stub kayıtları güncelle
          </button>
          <button
            type="button"
            disabled={discordResyncMutation.isPending}
            onClick={() =>
              setConfirmData({
                title: 'TÜM HEDEFLERİ GÜNCELLE',
                message:
                  'Tüm aktif hedef kayıtlar Discord ile yenilenir. Büyük veritabanında uzun sürebilir. Devam?',
                onConfirm: () => {
                  discordResyncMutation.mutate('all');
                  setConfirmData(null);
                },
              })
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            Tüm aktif hedefleri güncelle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredUsers.map((user) => (
            <motion.div
              key={user.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card/40 backdrop-blur-xl border border-border rounded-[24px] p-6 hover:bg-card/60 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center relative overflow-hidden group/avatar">
                    {user.avatar ? (
                      <img src={`https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`} className="w-full h-full object-cover transition-transform group-hover/avatar:scale-110" />
                    ) : (
                      <Users className="w-6 h-6 text-primary" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg leading-none">{user.display_name}</h3>
                      {user.discord_id && (
                        <div className="px-1.5 py-0.5 rounded-md bg-[#5865F2]/10 text-[#5865F2] text-[8px] font-black uppercase tracking-tighter">
                          DISCORD BAĞLI
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-medium">@{user.username}</span>
                      <div className="w-1 h-1 rounded-full bg-border" />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'text-primary' : 'text-muted-foreground'}`}>
                        {user.role === 'admin' ? 'Yönetici' : 'Saha Ajanı'}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-border" />
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                        <Globe className="w-3 h-3" />
                        <span>{user.last_ip || 'IP YOK'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {/* Status Badge */}
                  <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${user.approved ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                    {user.approved ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {user.approved ? 'ONAYLANDI' : 'ONAY BEKLİYOR'}
                    </span>
                  </div>

                  <div className="h-10 w-px bg-border" />

                  {/* Actions */}
                  <div className="flex gap-2">
                    {(JSON.parse(localStorage.getItem('nexus_user'))?.username === 'cebin' || user.role !== 'admin') && (
                      <button
                        onClick={() => setSyncId(user.id)}
                        className={`p-2.5 rounded-xl transition-all ${user.discord_id ? 'bg-[#5865F2]/10 text-[#5865F2]' : 'bg-secondary text-muted-foreground hover:text-[#5865F2]'}`}
                        title="Discord Bağla"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                    )}

                    {(JSON.parse(localStorage.getItem('nexus_user'))?.username === 'cebin' || user.id === JSON.parse(localStorage.getItem('nexus_user'))?.id || user.role !== 'admin') && (
                      <button
                        onClick={() => setResetPassId(user.id)}
                        className="p-2.5 bg-secondary text-muted-foreground hover:text-foreground rounded-xl transition-all"
                        title="Şifre Sıfırla"
                      >
                        <Settings className="w-5 h-5" />
                      </button>
                    )}

                    {user.id !== JSON.parse(localStorage.getItem('nexus_user'))?.id &&
                      user.username !== 'cebin' &&
                      (JSON.parse(localStorage.getItem('nexus_user'))?.username === 'cebin' || user.role !== 'admin') ? (
                      <>
                        {!user.approved ? (
                          <button
                            onClick={() => approveMutation.mutate({ id: user.id, approved: true })}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> YETKİ VER
                          </button>
                        ) : (
                          <button
                            onClick={() => approveMutation.mutate({ id: user.id, approved: false })}
                            className="p-2.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded-xl transition-all"
                            title="Yetkiyi Kaldır"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        )}

                        {JSON.parse(localStorage.getItem('nexus_user'))?.username === 'cebin' && (
                          <button
                            onClick={() => roleMutation.mutate({ id: user.id, role: user.role === 'admin' ? 'user' : 'admin' })}
                            className={`p-2.5 rounded-xl transition-all ${user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                            title={user.role === 'admin' ? 'Rolü Düşür' : 'Admin Yap'}
                          >
                            <Shield className="w-5 h-5" />
                          </button>
                        )}

                        <button
                          onClick={() => {
                            if (!user.last_ip) return notify('Kullanıcının IP adresi bulunamadı.', 'warning');
                            setConfirmData({
                              title: 'IP ADRESİNİ ENGELLE',
                              message: `${user.display_name} kullanıcısının IP adresini (${user.last_ip}) engellemek istediğinize emin misiniz? Bu IP'den kimse erişemeyecektir.`,
                              onConfirm: () => {
                                banMutation.mutate({
                                  ip: user.last_ip,
                                  reason: `${user.username} kullanıcısı üzerinden engellendi.`,
                                  target_id: user.id
                                });
                                setConfirmData(null);
                              }
                            });
                          }}
                          className="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-all border border-red-500/10"
                          title="IP Adresini Engelle"
                        >
                          <WifiOff className="w-5 h-5" />
                        </button>

                        <button
                          onClick={() => {
                            setConfirmData({
                              title: 'KULLANICIYI SİL',
                              message: `${user.display_name} kullanıcısını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
                              onConfirm: () => {
                                deleteMutation.mutate(user.id);
                                setConfirmData(null);
                              }
                            });
                          }}
                          className="p-2.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl transition-all"
                          title="Kullanıcıyı Sil"
                        >
                          <UserMinus className="w-5 h-5" />
                        </button>
                      </>
                    ) : (
                      <div className="px-4 py-2 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest italic">
                          {user.username === 'cebin' ? 'ANA YÖNETİCİ' : 'SİZİN HESABINIZ'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline Action Trays */}
              <AnimatePresence>
                {syncId === user.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="mt-4 pt-4 border-t border-border overflow-hidden"
                  >
                    <div className="flex gap-3">
                      <input
                        type="text" placeholder="Discord Kullanıcı ID Girin..."
                        className="flex-1 bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:border-[#5865F2]"
                        value={discordId}
                        onChange={(e) => setDiscordId(e.target.value)}
                        autoFocus
                      />
                      <button
                        onClick={() => syncDiscordMutation.mutate({ id: user.id, discord_id: discordId })}
                        disabled={syncDiscordMutation.isPending || !discordId}
                        className="px-6 py-2 bg-[#5865F2] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                      >
                        {syncDiscordMutation.isPending ? 'BAĞLANIYOR...' : 'VERİLERİ SENKRONİZE ET'}
                      </button>
                      <button onClick={() => setSyncId(null)} className="px-4 py-2 bg-secondary rounded-xl text-[10px] font-bold">İPTAL</button>
                    </div>
                  </motion.div>
                )}

                {resetPassId === user.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="mt-4 pt-4 border-t border-border overflow-hidden"
                  >
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <input
                          type={showPass ? 'text' : 'password'}
                          placeholder="Yeni Şifre Girin..."
                          className="w-full bg-background border border-border rounded-xl px-4 py-2 pr-10 text-sm outline-none focus:border-primary"
                          value={newPass}
                          onChange={(e) => setNewPass(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(!showPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          if (newPass.length < 4) return notify('Şifre en az 4 karakter olmalıdır.', 'warning');
                          resetPasswordMutation.mutate({ id: user.id, password: newPass });
                        }}
                        disabled={resetPasswordMutation.isPending || !newPass}
                        className="px-6 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                      >
                        {resetPasswordMutation.isPending ? 'GÜNCELLENİYOR...' : 'ŞİFREYİ SIFIRLA'}
                      </button>
                      <button onClick={() => { setResetPassId(null); setShowPass(false); }} className="px-4 py-2 bg-secondary rounded-xl text-[10px] font-bold">İPTAL</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-[32px] bg-secondary/5">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium italic">Kullanıcı bulunamadı.</p>
        </div>
      )}

      {/* Banned IPs Section */}
      {bans.length > 0 && (
        <div className="mt-12 space-y-6">
          <div className="flex items-center gap-3">
            <ShieldOff className="w-6 h-6 text-amber-500" />
            <h2 className="text-xl font-black tracking-tight uppercase">Engellenmiş IP Adresleri</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bans.map((ban) => (
              <div key={ban.id} className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-black text-foreground">{ban.ip}</span>
                    <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-black uppercase tracking-widest">YASAKLI</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{ban.reason || 'Neden belirtilmedi.'}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-tighter">Tarih: {new Date(ban.timestamp).toLocaleString('tr-TR')}</p>
                </div>
                <button
                  onClick={() => {
                    setConfirmData({
                      title: 'IP ENGELİNİ KALDIR',
                      message: `${ban.ip} adresinin engelini kaldırmak istiyor musunuz?`,
                      onConfirm: () => {
                        unbanMutation.mutate(ban.id);
                        setConfirmData(null);
                      }
                    });
                  }}
                  className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Engeli Kaldır
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global Notifications & Modals */}
      <AnimatePresence>
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!confirmData}
        title={confirmData?.title}
        message={confirmData?.message}
        onConfirm={confirmData?.onConfirm}
        onCancel={() => setConfirmData(null)}
      />
    </div>
  );
};

export default Admin;
