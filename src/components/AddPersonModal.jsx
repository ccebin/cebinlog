import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, X, Info, Loader2, RefreshCw } from 'lucide-react'
import axios from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { twMerge } from 'tailwind-merge'
import { clsx } from 'clsx'
import { API_BASE } from '../lib/apiBase'

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

export default function AddPersonModal({ isOpen, onClose, notify }) {
  const [newId, setNewId] = useState('')
  const [syncError, setSyncError] = useState(null)
  const queryClient = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: (id) => axios.post(`${API_BASE}/people/${id}/sync-profile`, {}, { headers: getHeaders() }).then(res => res.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['people'])
      
      if (!data.isNew) {
        setSyncError('Bu kişi zaten sistemde kayıtlı. Verileri Discord ile güncellendi.');
      } else {
        onClose();
        setNewId('');
        setSyncError(null);
      }
    },
    onError: (err) => {
      setSyncError(err.response?.data?.error || 'Senkronizasyon hatası');
    }
  })

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/90 backdrop-blur-md"
        onClick={() => {
          onClose()
          setSyncError(null)
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md p-8 rounded-[32px] border border-border bg-card shadow-2xl"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <User className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Yeni Hedef Tanımla</h2>
          <p className="text-sm text-muted-foreground mt-1">Discord ID üzerinden tüm verileri otomatik çekin.</p>
        </div>

        <div className="space-y-5">
          <AnimatePresence>
            {syncError && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                className={cn(
                  "rounded-xl p-3 flex items-center gap-3 border",
                  syncError.includes('kayıtlı')
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-destructive/10 border-destructive/20"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                  syncError.includes('kayıtlı') ? "bg-amber-500/20" : "bg-destructive/20"
                )}>
                  {syncError.includes('kayıtlı') ? <Info className="w-3.5 h-3.5 text-amber-500" /> : <X className="w-3.5 h-3.5 text-destructive" />}
                </div>
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-widest leading-tight",
                  syncError.includes('kayıtlı') ? "text-amber-500" : "text-destructive"
                )}>{syncError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Discord Kullanıcı ID</label>
            <input
              type="text"
              placeholder="Örn: 123456789012345678"
              value={newId}
              onChange={(e) => {
                setNewId(e.target.value)
                setSyncError(null)
              }}
              className="w-full bg-secondary/50 border border-border rounded-2xl px-5 py-4 outline-none focus:border-primary transition-all text-sm font-medium"
            />
          </div>

          <button
            onClick={() => syncMutation.mutate(newId)}
            disabled={!newId || syncMutation.isPending}
            className="w-full bg-primary text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
          >
            {syncMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>SENKRONİZE EDİLİYOR...</span>
              </>
            ) : (
              <span>HEDEFİ SİSTEME EKLE</span>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
