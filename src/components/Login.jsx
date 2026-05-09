import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react'
import CebinLogo from './CebinLogo'
import CebinBrandTitle from './CebinBrandTitle'
import axios from 'axios'
import Notification from './Notification'
import { AnimatePresence } from 'framer-motion'
import { API_BASE } from '../lib/apiBase'

export default function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [form, setForm] = useState({ username: '', password: '', display_name: '' })
  const [error, setError] = useState('')
  const [notification, setNotification] = useState(null)

  const notify = (message, type = 'success') => setNotification({ message, type })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login'
      const res = await axios.post(`${API_BASE}${endpoint}`, form)
      if (isRegister) {
        notify('Kayıt başarılı, giriş yapabilirsiniz.', 'success')
        setIsRegister(false)
      } else {
        onLogin({ ...res.data, rememberMe })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#09090b] relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(124,77,255,0.1),transparent_50%)]" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="mb-6 relative">
            <div className="absolute inset-0 blur-2xl bg-primary/35 rounded-full scale-150" aria-hidden />
            <CebinLogo size={72} withGlow className="relative" />
          </div>
          <h1 className="mb-2">
            <CebinBrandTitle variant="login" />
          </h1>
          <p className="text-sm text-muted-foreground font-medium tracking-wide">
            İstihbarat kayıtları ve operasyon günlüğü
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4 bg-card/30 p-6 rounded-3xl border border-border/50 backdrop-blur-xl">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Kullanıcı Adı</label>
              <input 
                type="text" 
                value={form.username}
                onChange={(e) => setForm({...form, username: e.target.value})}
                placeholder="admin"
                className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-1">Parola</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={form.password}
                  onChange={(e) => setForm({...form, password: e.target.value})}
                  placeholder="••••••••"
                  className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3 pr-12 outline-none focus:border-primary transition-colors text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isRegister && (
              <div className="flex items-center gap-2 px-1 pt-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-4 h-4 border border-border rounded bg-secondary/50 peer-checked:bg-primary peer-checked:border-primary transition-all" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity">
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tight">Beni Hatırla</span>
                </label>
              </div>
            )}
            {error && <p className="text-destructive text-xs font-medium ml-1">{error}</p>}
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 group"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                <span>{isRegister ? 'Hesap Oluştur' : 'Sisteme Bağlan'}</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <p className="text-center mt-8 text-sm text-muted-foreground">
          {isRegister ? 'Zaten hesabınız var mı?' : 'Henüz yetkiniz yok mu?'}
          <button 
            onClick={() => setIsRegister(!isRegister)}
            className="text-primary font-bold ml-2 hover:underline"
          >
            {isRegister ? 'Giriş Yap' : 'Talep Et'}
          </button>
        </p>
      </motion.div>
      {/* Global Notifications */}
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
