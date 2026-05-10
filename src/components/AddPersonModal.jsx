import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, X, Info, Loader2, RefreshCw, Upload, FileText } from 'lucide-react'
import axios from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { twMerge } from 'tailwind-merge'
import { clsx } from 'clsx'
import { API_BASE } from '../lib/apiBase'

function cn(...inputs) {
  return twMerge(clsx(inputs))
}

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

/** Discord snowflake: 17–22 digits */
function extractDiscordIds(text) {
  const matches = String(text || '').match(/\d{17,22}/g)
  return [...new Set(matches || [])]
}

export default function AddPersonModal({ isOpen, onClose, notify }) {
  const [tab, setTab] = useState('single')
  const [newId, setNewId] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [syncError, setSyncError] = useState(null)
  const [bulkReport, setBulkReport] = useState(null)
  const fileRef = useRef(null)
  const queryClient = useQueryClient()

  const parsedIds = extractDiscordIds(bulkText)

  const syncMutation = useMutation({
    mutationFn: (id) => axios.post(`${API_BASE}/people/${id}/sync-profile`, {}, { headers: getHeaders() }).then(res => res.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['people'])

      if (!data.isNew) {
        setSyncError('Bu kişi zaten sistemde kayıtlı. Verileri Discord ile güncellendi.')
      } else {
        onClose()
        setNewId('')
        setSyncError(null)
      }
    },
    onError: (err) => {
      setSyncError(err.response?.data?.error || 'Senkronizasyon hatası')
    }
  })

  const bulkMutation = useMutation({
    mutationFn: (ids) =>
      axios.post(`${API_BASE}/people/bulk-import`, { ids }, { headers: getHeaders() }).then(res => res.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['people'])
      setBulkReport(data)
      const { summary } = data
      notify?.(
        `Toplu içe aktarma: ${summary.imported} yeni, ${summary.updated} güncellendi, ${summary.failed} hata (${summary.total} ID).`
      )
    },
    onError: (err) => {
      setSyncError(err.response?.data?.error || err.message || 'Toplu içe aktarma başarısız')
    }
  })

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setBulkText(String(reader.result || ''))
      setSyncError(null)
      setBulkReport(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const resetAndClose = () => {
    setNewId('')
    setBulkText('')
    setSyncError(null)
    setBulkReport(null)
    setTab('single')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/90 backdrop-blur-md"
        onClick={() => {
          resetAndClose()
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto p-8 rounded-[32px] border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <User className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Yeni Hedef Tanımla</h2>
          <p className="text-sm text-muted-foreground mt-1">Discord ID ile tek tek veya .txt listesiyle toplu ekleyin.</p>
        </div>

        <div className="flex rounded-2xl bg-secondary/40 p-1 mb-6 border border-border">
          <button
            type="button"
            onClick={() => { setTab('single'); setSyncError(null); setBulkReport(null) }}
            className={cn(
              'flex-1 rounded-xl py-2.5 text-xs font-black uppercase tracking-widest transition-all',
              tab === 'single' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Tek ID
          </button>
          <button
            type="button"
            onClick={() => { setTab('bulk'); setSyncError(null); setBulkReport(null) }}
            className={cn(
              'flex-1 rounded-xl py-2.5 text-xs font-black uppercase tracking-widest transition-all',
              tab === 'bulk' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Toplu (.txt)
          </button>
        </div>

        <div className="space-y-5">
          <AnimatePresence>
            {syncError && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                className={cn(
                  'rounded-xl p-3 flex items-center gap-3 border',
                  syncError.includes('kayıtlı')
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-destructive/10 border-destructive/20'
                )}
              >
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                  syncError.includes('kayıtlı') ? 'bg-amber-500/20' : 'bg-destructive/20'
                )}>
                  {syncError.includes('kayıtlı') ? <Info className="w-3.5 h-3.5 text-amber-500" /> : <X className="w-3.5 h-3.5 text-destructive" />}
                </div>
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-widest leading-tight text-left',
                  syncError.includes('kayıtlı') ? 'text-amber-500' : 'text-destructive'
                )}>{syncError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {tab === 'single' && (
            <>
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
                type="button"
                onClick={() => syncMutation.mutate(newId.trim())}
                disabled={!newId.trim() || syncMutation.isPending}
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
            </>
          )}

          {tab === 'bulk' && (
            <>
              <input ref={fileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={handleFile} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-border bg-secondary/30 text-sm font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <Upload className="w-4 h-4" />
                .txt dosyası seç (veya aşağıya yapıştır)
              </button>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 flex items-center gap-2">
                  <FileText className="w-3 h-3" />
                  ID listesi
                </label>
                <textarea
                  value={bulkText}
                  onChange={(e) => {
                    setBulkText(e.target.value)
                    setSyncError(null)
                    setBulkReport(null)
                  }}
                  placeholder={'Her satıra bir ID veya virgülle ayırın:\n123456789012345678\n987654321098765432'}
                  rows={8}
                  className="w-full resize-y min-h-[140px] bg-secondary/50 border border-border rounded-2xl px-4 py-3 outline-none focus:border-primary transition-all text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Algılanan benzersiz ID: <span className="font-bold text-foreground">{parsedIds.length}</span>
                  {parsedIds.length > 500 && <span className="text-destructive"> (en fazla 500 gönderilir)</span>}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const ids = parsedIds.slice(0, 500)
                  if (ids.length === 0) {
                    setSyncError('Dosyada veya metinde geçerli Discord ID yok (17–22 haneli sayılar).')
                    return
                  }
                  setSyncError(null)
                  setBulkReport(null)
                  bulkMutation.mutate(ids)
                }}
                disabled={parsedIds.length === 0 || bulkMutation.isPending}
                className="w-full bg-primary text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
              >
                {bulkMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>İÇE AKTARILIYOR…</span>
                  </>
                ) : (
                  <span>TOPLU İÇE AKTAR</span>
                )}
              </button>

              {bulkMutation.isPending && (
                <p className="text-[10px] text-center text-muted-foreground">
                  Discord API limitine uygun ara ile işleniyor; çok sayıda ID birkaç dakika sürebilir.
                </p>
              )}

              {bulkReport?.summary && (
                <div className="rounded-2xl border border-border bg-secondary/30 p-4 text-left space-y-2">
                  <p className="text-xs font-bold text-foreground">Özet</p>
                  <ul className="text-[11px] text-muted-foreground space-y-1">
                    <li>Yeni: <span className="text-foreground font-semibold">{bulkReport.summary.imported}</span></li>
                    <li>Güncellenen: <span className="text-foreground font-semibold">{bulkReport.summary.updated}</span></li>
                    <li>Hata: <span className="text-destructive font-semibold">{bulkReport.summary.failed}</span></li>
                  </ul>
                  {bulkReport.results?.filter((r) => r.status === 'failed').length > 0 && (
                    <details className="text-[10px] pt-2 border-t border-border">
                      <summary className="cursor-pointer font-bold text-destructive">Başarısız ID’ler</summary>
                      <ul className="mt-2 max-h-32 overflow-y-auto font-mono space-y-1">
                        {bulkReport.results.filter((r) => r.status === 'failed').map((r) => (
                          <li key={r.id}>{r.id}: {r.error}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
