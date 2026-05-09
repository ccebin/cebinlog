import React from 'react'
import {
  LayoutDashboard,
  Users,
  Image as ImageIcon,
  Share2,
  History,
  LogOut,
  Shield,
  ShieldAlert,
  Globe
} from 'lucide-react'
import CebinLogo from './CebinLogo'
import CebinBrandTitle from './CebinBrandTitle'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'people', label: 'Kişiler', icon: Users },
  { id: 'gallery', label: 'Galeri', icon: ImageIcon },
  { id: 'graph', label: 'Ağ Grafiği', icon: Share2 },
  { id: 'map', label: 'Operasyon Haritası', icon: Globe },
  { id: 'logs', label: 'Sistem Logları', icon: History },
]

export default function Sidebar({ view, setView, user, onLogout }) {
  return (
    <aside className="w-64 border-r border-border bg-card/30 flex flex-col p-4">
      <div className="flex items-center gap-3 px-3 py-6 mb-4">
        <CebinLogo size={36} withGlow className="shrink-0" />
        <div className="flex flex-col leading-none min-w-0">
          <CebinBrandTitle variant="sidebar" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/90 mt-1">
            kayıt &amp; istihbarat
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              view === item.id
                ? "bg-secondary text-primary"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <item.icon className={cn("w-4 h-4", view === item.id ? "text-primary" : "")} />
            {item.label}
          </button>
        ))}
        {user.role === 'admin' && (
          <div className="space-y-1 mt-4 pt-4 border-t border-white/5">
            <button
              onClick={() => setView('admin')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                view === 'admin'
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
              )}
            >
              <Shield className="w-4 h-4" />
              Kullanıcı Yönetimi
            </button>
            <button
              onClick={() => setView('archive')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                view === 'archive'
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
              )}
            >
              <ShieldAlert className="w-4 h-4" />
              İstihbarat Arşivi
            </button>
          </div>
        )}
      </nav>

      <div className="mt-auto pt-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-lg bg-secondary/30">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
            {user.avatar ? (
              <img src={`https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-primary">{user.display_name?.[0].toUpperCase() || 'U'}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user.display_name}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{user.role}</p>
          </div>
          <button
            onClick={onLogout}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Çıkış Yap"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
