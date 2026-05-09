import React, { useState, useRef, isValidElement } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, useMotionTemplate } from 'framer-motion'
import {
  Search, Plus, MoreHorizontal, User, History,
  Link as LinkIcon, RefreshCw, X, Pin, Trash2,
  MapPin, Calendar, Fingerprint, ExternalLink, Image as ImageIcon,
  ChevronLeft, ChevronRight, Download, CheckCircle2, FileText, Pencil,
  Video, Mic, File, Copy, Check, Shield, ArrowRight, Info, Activity
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import ConfirmDialog from './ConfirmDialog'
import { cn } from '../lib/utils'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import html2pdf from 'html2pdf.js'
import Linkify from './Linkify'
import LogRichContent from './LogRichContent'
import { logContentLooksLikeDeletion, logContentLooksLikeUpload } from '../lib/logDetect'
import { API_BASE, FILE_BASE } from '../lib/apiBase'
const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

export default function People({
  selectedId, setSelectedId,
  highlightLogId, setHighlightLogId,
  highlightMediaId, setHighlightMediaId,
  search, setSearch, notify,
  setView
}) {
  const user = JSON.parse(localStorage.getItem('nexus_user') || '{}')
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)

  // Custom Alerts State
  const [confirmData, setConfirmData] = useState(null)

  const [noteContent, setNoteContent] = useState('')
  const [editingConn, setEditingConn] = useState(false)
  const [connTarget, setConnTarget] = useState('')
  const [connSearch, setConnSearch] = useState('')
  const [connType, setConnType] = useState('Arkadaş')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [activeGuildFilter, setActiveGuildFilter] = useState(null)
  const [confirmDeletePerson, setConfirmDeletePerson] = useState(false)
  const [activeTab, setActiveTab] = useState(localStorage.getItem('nexus_active_tab') || 'notes')
  const [previewIndex, setPreviewIndex] = useState(localStorage.getItem('nexus_preview_index') !== null ? parseInt(localStorage.getItem('nexus_preview_index')) : null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [selectedMediaIds, setSelectedMediaIds] = useState([])
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [tempNote, setTempNote] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [enlargedLogMedia, setEnlargedLogMedia] = useState(null)
  const [copiedId, setCopiedId] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [editingNoteContent, setEditingNoteContent] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 14

  const exportToPDF = () => {
    const person = selectedPerson;
    const personLogs = logs || [];
    const personMediaList = (personMedia || []).filter(m =>
      !m.url.match(/\.(mp4|webm|mp3|wav|pdf)$/i)
    );

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Pop-up engelleyici önizlemeyi engelliyor. Lütfen izin verin.");
      return;
    }

    const html = `
      <html>
        <head>
          <title>Rapor Önizleme - ${person.display_name}</title>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
            body { font-family: 'Inter', sans-serif; background: #09090b; margin: 0; padding: 0; color: white; }
            .toolbar { position: sticky; top: 0; background: #111113; border-bottom: 1px solid #1e293b; padding: 12px 40px; display: flex; justify-content: space-between; align-items: center; z-index: 1000; }
            .download-btn { background: #6366f1; color: white; border: none; padding: 10px 28px; border-radius: 12px; font-weight: 800; cursor: pointer; transition: all 0.2s; font-size: 12px; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3); }
            .download-btn:hover { background: #4f46e5; transform: translateY(-1px); }
            .pdf-wrapper { padding: 40px 0; display: flex; justify-content: center; }
            .pdf-container { background: white; width: 210mm; min-height: 297mm; box-shadow: 0 40px 100px -20px rgba(0,0,0,0.8); position: relative; overflow: hidden; border: 1px solid #e2e8f0; }
            .pdf-container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #6366f1, #a855f7); }
            
            /* PDF Content Styles */
            .pdf-content { padding: 60px; color: #09090b; line-height: 1.6; }
            .pdf-header { border-bottom: 2px solid #09090b; padding-bottom: 30px; margin-bottom: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
            .pdf-header-left h1 { font-size: 48px; font-weight: 900; margin: 15px 0 0; text-transform: uppercase; letter-spacing: -3px; color: #09090b; line-height: 0.9; }
            .pdf-header-right { text-align: right; font-weight: 700; font-size: 11px; color: #6366f1; font-family: 'JetBrains Mono', monospace; }
            .pdf-profile-grid { display: grid; grid-template-columns: 220px 1fr; gap: 50px; margin-bottom: 50px; }
            .pdf-avatar-container { width: 220px; height: 220px; border: 2px solid #09090b; padding: 5px; background: white; }
            .pdf-avatar-container img { width: 100%; height: 100%; object-fit: cover; }
            .pdf-info-table { width: 100%; border-collapse: collapse; }
            .pdf-info-table th { text-align: left; font-size: 9px; text-transform: uppercase; color: #6366f1; padding-bottom: 6px; letter-spacing: 1.5px; font-weight: 800; }
            .pdf-info-table td { font-size: 16px; font-weight: 700; padding-bottom: 18px; border-bottom: 1px solid #e2e8f0; color: #09090b; }
            .pdf-section-title { font-size: 12px; font-weight: 900; text-transform: uppercase; border-left: 5px solid #09090b; padding-left: 15px; margin: 50px 0 25px; color: #09090b; letter-spacing: 2px; background: #f8fafc; padding-top: 10px; padding-bottom: 10px; }
            .pdf-log-item { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0; }
            .pdf-log-meta { font-size: 10px; color: #6366f1; margin-bottom: 5px; font-family: 'JetBrains Mono', monospace; font-weight: 700; }
            .pdf-log-content { font-size: 13px; color: #1e293b; }
            .pdf-media-grid { column-count: 2; column-gap: 20px; }
            .pdf-media-item { break-inside: avoid; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; text-align: center; background: #f8fafc; }
            .pdf-media-item img { width: 100%; height: auto; border-radius: 8px; display: block; }
            .pdf-confidential { background: #000; color: white; padding: 4px 12px 7px; font-weight: 900; font-size: 10px; font-family: 'JetBrains Mono', monospace; display: inline-block; line-height: 1; text-transform: uppercase; border-radius: 2px; letter-spacing: 1px; }
            
            /* Watermark or Accents */
            .pdf-footer { position: absolute; bottom: 40px; left: 60px; right: 60px; display: flex; justify-content: space-between; font-size: 10px; opacity: 0.4; font-family: 'JetBrains Mono', monospace; border-top: 2px solid #09090b; padding-top: 20px; color: #09090b; }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <div style="font-weight: 900; letter-spacing: 2px; font-size: 14px;">CEBIN LOG <span style="opacity: 0.5;">//</span> RAPOR ÖNİZLEME</div>
            <button class="download-btn" onclick="downloadPDF()">PDF OLARAK İNDİR</button>
          </div>
          
          <div class="pdf-wrapper">
            <div class="pdf-container" id="pdf-target">
              <div class="pdf-content">
                <div class="pdf-header">
                  <div class="pdf-header-left">
                    <div style="margin-bottom: 15px;"><span class="pdf-confidential">GİZLİ // CONFIDENTIAL</span></div>
                    <h1>${person.display_name}</h1>
                  </div>
                  <div class="pdf-header-right">
                    DOSYA NO: ${person.id.slice(0, 8).toUpperCase()}<br/>
                    TARİH: ${new Date().toLocaleDateString('tr-TR')}<br/>
                    SAAT: ${new Date().toLocaleTimeString('tr-TR')}
                  </div>
                </div>

                <div class="pdf-profile-grid">
                  <div class="pdf-avatar-container">
                    <img src="${person.avatar ? `https://cdn.discordapp.com/avatars/${person.id}/${person.avatar}.${person.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" crossorigin="anonymous" />
                  </div>
                  <div>
                    <table class="pdf-info-table">
                      <tr><th>KULLANICI ADI</th></tr><tr><td>${person.username}</td></tr>
                      <tr><th>DISCORD ID</th></tr><tr><td>${person.id}</td></tr>
                      <tr><th>GERÇEK AD</th></tr><tr><td>${person.real_name || 'BİLİNMİYOR'}</td></tr>
                      <tr><th>LOKASYON</th></tr><tr><td>${person.location || 'BELİRTİLMEMİŞ'}</td></tr>
                      <tr><th>YAŞ DURUMU</th></tr><tr><td>${person.age || 'TANIMSIZ'}</td></tr>
                    </table>
                    <div style="margin-top: 20px; font-size: 13px; color: #475569; line-height: 1.8;">
                      <strong style="color: #6366f1; font-size: 10px; letter-spacing: 1px;">BİYOGRAFİ / ANALİZ:</strong><br/>
                      ${person.bio || 'Sistemde biyografi verisi bulunmuyor.'}
                    </div>
                  </div>
                </div>

                <div class="pdf-section-title">İstihbarat Notları</div>
                ${personLogs.length > 0 ? personLogs.map(log => `
                  <div class="pdf-log-item">
                    <div class="pdf-log-meta">LOG_${new Date(log.timestamp).getTime().toString(16).toUpperCase()} // ${new Date(log.timestamp).toLocaleString('tr-TR')}</div>
                    <div class="pdf-log-content">${log.content}</div>
                  </div>
                `).join('') : '<p style="font-size: 12px; opacity: 0.3; font-style: italic; color: #64748b;">Sistemde kayıtlı veri bulunamadı.</p>'}

                <div class="pdf-section-title">Medya Kanıt Arşivi</div>
                <div class="pdf-media-grid">
                  ${personMediaList.length > 0 ? personMediaList.map(m => `
                    <div class="pdf-media-item">
                      <div style="font-size: 9px; margin-bottom: 10px; font-weight: 800; color: #6366f1; font-family: 'JetBrains Mono', monospace;">${new Date(m.timestamp).toLocaleDateString('tr-TR')}</div>
                      <img src="${m.url.startsWith('/uploads') ? FILE_BASE + m.url : m.url}" crossorigin="anonymous" />
                    </div>
                  `).join('') : '<p style="font-size: 12px; opacity: 0.3; font-style: italic; color: #64748b;">Arşivlenmiş görsel kanıt bulunamadı.</p>'}
                </div>

                <div class="pdf-footer">
                  <div>CEBIN LOG SİSTEMİ v1.0</div>
                  <div>GİZLİLİK DERECESİ: KRİTİK</div>
                  <div>SAYFA 01</div>
                </div>
              </div>
            </div>
          </div>

          <script>
            function downloadPDF() {
              const btn = document.querySelector('.download-btn');
              const originalText = btn.innerText;
              btn.innerText = 'DOSYA HAZIRLANIYOR...';
              btn.style.opacity = '0.7';
              btn.disabled = true;
              
              const element = document.getElementById('pdf-target');
              const opt = {
                margin:       0,
                filename:     'Rapor - ${person.display_name}.pdf',
                image:        { type: 'jpeg', quality: 1 },
                html2canvas:  { 
                  scale: 2, 
                  useCORS: true, 
                  letterRendering: true,
                  backgroundColor: '#ffffff'
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
              };
              
              html2pdf().set(opt).from(element).save().then(() => {
                btn.innerText = originalText;
                btn.style.opacity = '1';
                btn.disabled = false;
              });
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };



  // Persist Active Tab

  React.useEffect(() => {
    localStorage.setItem('nexus_active_tab', activeTab)
  }, [activeTab])

  // Persist Preview Index
  React.useEffect(() => {
    if (previewIndex !== null) localStorage.setItem('nexus_preview_index', previewIndex)
    else localStorage.removeItem('nexus_preview_index')
  }, [previewIndex])

  // Reset page on search or filter change
  React.useEffect(() => {
    setCurrentPage(1)
  }, [search, activeGuildFilter])

  // Clear sub-states when person changes
  React.useEffect(() => {
    if (selectedId) {
      // Keep state if it belongs to this person (simplified for now)
    } else {
      setPreviewIndex(null)
      localStorage.removeItem('nexus_preview_index')
    }
  }, [selectedId])

  // Auto-scroll to highlighted media
  React.useEffect(() => {
    if (highlightMediaId && selectedId) {
      setActiveTab('media');
      setTimeout(() => {
        const el = document.getElementById(`media-${highlightMediaId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => setHighlightMediaId(null), 3000);
        }
      }, 500);
    }
  }, [highlightMediaId, selectedId]);

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

      link.download = `${selectedPerson.display_name}_${Date.now()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      // Fallback
      window.open(url, '_blank');
    }
  };

  const handleBulkDownload = async (items) => {
    const zip = new JSZip();
    const folder = zip.folder(`nexus_intel_${selectedPerson.display_name}_${Date.now()}`);

    const downloadPromises = items.map(async (item, idx) => {
      const url = item.url.startsWith('/uploads') ? `${FILE_BASE}${item.url}` : item.url;
      try {
        const response = await axios.get(url, { responseType: 'blob' });
        const ext = item.url.split('.').pop() || 'png';
        folder.file(`${idx + 1}_${item.id}.${ext}`, response.data);
      } catch (err) {
        console.error(`Download failed for ${url}`, err);
      }
    });

    await Promise.all(downloadPromises);
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `nexus_archive_${selectedPerson.display_name}.zip`);
  };

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['people'],
    queryFn: () => axios.get(`${API_BASE}/people`, { headers: getHeaders() }).then(res => res.data)
  })

  const { data: selectedPerson } = useQuery({
    queryKey: ['person', selectedId],
    queryFn: () => axios.get(`${API_BASE}/people/${selectedId}`, { headers: getHeaders() }).then(res => res.data),
    enabled: !!selectedId
  })

  const { data: logs = [] } = useQuery({
    queryKey: ['logs', selectedId],
    queryFn: () => axios.get(`${API_BASE}/logs/${selectedId}`, { headers: getHeaders() }).then(res => res.data),
    enabled: !!selectedId
  })

  const { data: personMedia = [], isFetching: isFetchingMedia } = useQuery({
    queryKey: ['media', selectedId],
    queryFn: () => axios.get(`${API_BASE}/media/${selectedId}`, { headers: getHeaders() }).then(res => res.data),
    enabled: !!selectedId
  })

  const { data: allConnections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => axios.get(`${API_BASE}/connections`, { headers: getHeaders() }).then(res => res.data)
  })

  const { data: systemLogs = [] } = useQuery({
    queryKey: ['systemLogs', selectedId],
    queryFn: () => axios.get(`${API_BASE}/people/${selectedId}/system-logs`, { headers: getHeaders() }).then(res => res.data),
    enabled: !!selectedId
  })

  // Auto-scroll to highlighted log
  React.useEffect(() => {
    if (highlightLogId && selectedId) {
      // Determine which tab the log belongs to
      const logEntry = logs?.find(l => l.id === highlightLogId) || systemLogs?.find(l => l.id === highlightLogId);
      if (logEntry) {

        // Check if this is a media-related log (Upload or Delete)
        if (logContentLooksLikeUpload(logEntry.content) || logContentLooksLikeDeletion(logEntry.content)) {
          const urlMatch = logEntry.content.match(/\(URL:\s*([^, \)]+)/);
          const idMatch = logEntry.content.match(/\(ID:\s*(\d+)/);

          let targetMediaId = null;

          if (idMatch && idMatch[1]) {
            targetMediaId = parseInt(idMatch[1], 10);
          } else if (urlMatch && urlMatch[1]) {
            const mediaUrl = urlMatch[1];
            // personMedia might take a second to load, but typically the URL works once loaded
            const mediaItem = personMedia?.find(m => m.url === mediaUrl);
            if (mediaItem) targetMediaId = mediaItem.id;
            else if (isFetchingMedia) return; // Wait for media to load before falling back to log highlight
          }

          if (targetMediaId) {
            setHighlightMediaId(targetMediaId);
            setHighlightLogId(null);
            return; // Exit early, let the media useEffect handle the rest
          }
        }

        setActiveTab(logEntry.type === 'note' ? 'notes' : 'logs');
        setTimeout(() => {
          const el = document.getElementById(`log-${highlightLogId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => setHighlightLogId(null), 3000);
          }
        }, 500);
      }
    }
  }, [highlightLogId, selectedId, logs, systemLogs, personMedia, isFetchingMedia, setHighlightMediaId, setHighlightLogId]);

  const addConnectionMutation = useMutation({
    mutationFn: (data) => axios.post(`${API_BASE}/connections`, data, { headers: getHeaders() }),
    onSuccess: () => queryClient.invalidateQueries(['connections'])
  })

  const deleteConnectionMutation = useMutation({
    mutationFn: ({ from, to }) => axios.post(`${API_BASE}/connections/delete`, { from_id: from, to_id: to }, { headers: getHeaders() }),
    onSuccess: () => {
      setConfirmDeleteId(null)
      queryClient.invalidateQueries(['connections'])
    },
    onError: (err) => {
      console.error('Bağlantı silme hatası:', err)
      alert(`Bağlantı silinemedi: ${err.response?.data?.error || err.message}`)
    }
  })

  const addMediaMutation = useMutation({
    mutationFn: (data) => axios.post(`${API_BASE}/media`, { target_id: selectedId, ...data }, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries(['media', selectedId]);
      notify('Dosya galeriye eklendi');
    },
    onError: (err) => {
      console.error('Media upload error:', err);
      notify(err.response?.data?.error || 'Dosya yüklenemedi', 'error');
    }
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/media/${id}`, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries(['media', selectedId])
      setPreviewIndex(null)
      setDeleteConfirmId(null)
      setSelectedMediaIds(prev => prev.filter(mid => mid !== deleteConfirmId))
    }
  })

  const bulkDeleteMediaMutation = useMutation({
    mutationFn: (ids) => axios.post(`${API_BASE}/media/bulk-delete`, { ids }, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries(['media', selectedId])
      setSelectedMediaIds([])
      setDeleteConfirmId(null)
    }
  })

  const editMediaNoteMutation = useMutation({
    mutationFn: ({ id, note }) => axios.put(`${API_BASE}/media/${id}/note`, { note }, { headers: getHeaders() }),
    onSuccess: () => {
      queryClient.invalidateQueries(['media', selectedId])
      setIsEditingNote(false)
    }
  })

  const syncMutation = useMutation({
    mutationFn: async (id) => {
      const { data } = await axios.post(`${API_BASE}/people/${id}/sync-profile`, {}, { headers: getHeaders() });
      return data;
    },
    onSuccess: (data) => {
      if (!data.isNew) {
        notify('Bu kişi zaten sistemde kayıtlı. Verileri güncellendi.');
      }

      if (data.person) {
        queryClient.setQueryData(['person', data.person.id || selectedId], data.person);
      }
      queryClient.invalidateQueries(['people']);
      queryClient.invalidateQueries(['person', data.person?.id || selectedId]);
      queryClient.invalidateQueries(['system-logs', data.person?.id || selectedId]);
    },
    onError: (err) => {
      notify(err.response?.data?.error || 'Bir hata oluştu.', 'error')
    }
  })

  const saveIdentityMutation = useMutation({
    mutationFn: (data) => {
      if (!selectedPerson?.id) return Promise.reject(new Error('Kayıt henüz yüklenmedi.'))
      return axios.post(`${API_BASE}/people`, { ...selectedPerson, ...data, update: true }, { headers: getHeaders() })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['people'])
      queryClient.invalidateQueries(['person', selectedId])
    },
    onError: (err) => notify(err.response?.data?.error || err.message || 'Kaydedilemedi.', 'error'),
  })

  const deletePersonMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/people/${id}`, { headers: getHeaders() }),
    onSuccess: () => {
      setSelectedId(null)
      setConfirmDeletePerson(false)
      queryClient.invalidateQueries(['people'])
    }
  })

  const addNoteMutation = useMutation({
    mutationFn: (content) => axios.post(`${API_BASE}/logs`, { target_id: selectedId, content }, { headers: getHeaders() }),
    onSuccess: () => {
      setNoteContent('')
      queryClient.invalidateQueries(['logs', selectedId])
    }
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => axios.delete(`${API_BASE}/logs/${id}`, { headers: getHeaders() }),
    onSuccess: () => queryClient.invalidateQueries(['logs', selectedId])
  })

  const editNoteMutation = useMutation({
    mutationFn: ({ id, content }) => axios.put(`${API_BASE}/logs/${id}`, { content }, { headers: getHeaders() }),
    onSuccess: () => {
      setEditingNoteId(null)
      setEditingNoteContent('')
      queryClient.invalidateQueries(['logs', selectedId])
    }
  })

  const pinNoteMutation = useMutation({
    mutationFn: ({ id, pinned }) => axios.put(`${API_BASE}/logs/${id}/pin`, { pinned }, { headers: getHeaders() }),
    onSuccess: () => queryClient.invalidateQueries(['logs', selectedId])
  })

  const getAvatarUrl = (person, size = 256) => {
    if (!person.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png'
    const isGif = person.avatar.startsWith('a_')
    return `https://cdn.discordapp.com/avatars/${person.id}/${person.avatar}.${isGif ? 'gif' : 'png'}?size=${size}`
  }

  const getBannerUrl = (person, size = 1024) => {
    if (!person.banner) return null
    const isGif = person.banner.startsWith('a_')
    return `https://cdn.discordapp.com/banners/${person.id}/${person.banner}.${isGif ? 'gif' : 'png'}?size=${size}`
  }

  const getDecorationUrl = (person) => {
    if (!person.decoration) return null
    return `https://cdn.discordapp.com/avatar-decoration-presets/${person.decoration}.png?size=240`
  }

  const getShortLocation = (loc) => {
    if (!loc) return '';
    const parts = loc.split(',').map(p => p.trim());
    if (parts.length === 1) return loc;

    // Filter candidates by removing country, postcodes, and common 'filler' regions
    const ignoredKeywords = ['bölgesi', 'mahallesi', 'sokak', 'bulvarı', 'caddesi', 'yolu', 'mah.', 'sk.', 'cad.', 'türkiye'];
    const candidates = parts.slice(0, -1).filter(p => {
      const lower = p.toLowerCase();
      const isNumeric = /^[\d\s-]+$/.test(p);
      const isIgnored = ignoredKeywords.some(kw => lower.includes(kw));
      return !isNumeric && !isIgnored && p.length > 2;
    });

    // The most significant part (City/Province) is usually the last candidate
    // e.g., "Çankaya, Ankara" -> picks "Ankara"
    // e.g., "Van, Doğu Anadolu Bölgesi" -> picks "Van"
    return candidates[candidates.length - 1] || parts[0];
  }

  const getGuildsArray = (person) => {
    if (!person?.guilds) return [];
    try {
      const g = typeof person.guilds === 'string' ? JSON.parse(person.guilds) : person.guilds;
      return Array.isArray(g) ? g : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-8">
      {activeGuildFilter && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center mt-6"
        >
          <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 border border-primary/20 rounded-2xl backdrop-blur-xl">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">FİLTRE: {activeGuildFilter?.name}</span>
            <button
              onClick={() => setActiveGuildFilter(null)}
              className="ml-2 p-1 hover:bg-primary/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-primary" />
            </button>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-64 rounded-3xl bg-secondary animate-pulse" />)}
        </div>
      ) : (() => {
        const filteredPeople = people.filter(p => {
          const matchesSearch = !search || [
            p.display_name, p.username, p.id, p.real_name
          ].some(f => f?.toLowerCase().includes(search.toLowerCase()));

          if (!matchesSearch) return false;

          if (activeGuildFilter) {
            const guilds = getGuildsArray(p);
            return guilds.some(g => g.id === activeGuildFilter.id);
          }
          return true;
        });

        const totalPages = Math.ceil(filteredPeople.length / itemsPerPage);
        const paginatedPeople = filteredPeople.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

        // Reset page if out of bounds
        if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);

        return (
          <div className="space-y-10">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
              {paginatedPeople.map((p) => (
                <PersonCard
                  key={p.id}
                  p={p}
                  setSelectedId={setSelectedId}
                  getAvatarUrl={getAvatarUrl}
                  getBannerUrl={getBannerUrl}
                  getDecorationUrl={getDecorationUrl}
                  getShortLocation={getShortLocation}
                  setActiveGuildFilter={setActiveGuildFilter}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col items-center gap-6 py-12 border-t border-white/5">
                <div className="flex items-center p-1.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-2xl">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-3 hover:bg-white/5 disabled:opacity-20 disabled:hover:bg-transparent rounded-xl transition-all group"
                  >
                    <ChevronLeft className="w-5 h-5 group-active:scale-90 transition-transform" />
                  </button>

                  <div className="h-8 w-px bg-white/10 mx-2" />

                  <div className="flex items-center gap-1.5 px-2">
                    {[1, 2, 3, 4].map(pageNum => (
                      totalPages >= pageNum && (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            "w-11 h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center",
                            currentPage === pageNum
                              ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105 z-10"
                              : "text-white/40 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          {pageNum}
                        </button>
                      )
                    ))}

                    {totalPages > 4 && (
                      <div className="relative group/input">
                        <input
                          type="number"
                          min="1"
                          max={totalPages}
                          placeholder={currentPage > 4 && currentPage < totalPages ? currentPage : "..."}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = parseInt(e.target.value);
                              if (val >= 1 && val <= totalPages) {
                                setCurrentPage(val);
                                e.target.value = '';
                              }
                            }
                          }}
                          className={cn(
                            "w-11 h-11 border rounded-xl text-center text-xs font-black focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-white/20",
                            (currentPage > 4 && currentPage < totalPages)
                              ? "bg-primary border-primary text-white shadow-lg shadow-primary/30 scale-105 z-10"
                              : "bg-white/5 border-white/10 text-white/40 focus:border-primary/50 focus:bg-primary/10"
                          )}
                        />
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-primary text-[9px] font-black rounded opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none whitespace-nowrap uppercase tracking-tighter">Git</div>
                      </div>
                    )}

                    {totalPages > 4 && (
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        className={cn(
                          "w-11 h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center",
                          currentPage === totalPages
                            ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105 z-10"
                            : "text-white/40 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        {totalPages}
                      </button>
                    )}
                  </div>

                  <div className="h-8 w-px bg-white/10 mx-2" />

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-3 hover:bg-white/5 disabled:opacity-20 disabled:hover:bg-transparent rounded-xl transition-all group"
                  >
                    <ChevronRight className="w-5 h-5 group-active:scale-90 transition-transform" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-px w-8 bg-white/10" />
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
                    SAYFA {currentPage} <span className="mx-2 text-white/5">/</span> {totalPages}
                  </p>
                  <div className="h-px w-8 bg-white/10" />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Expanded View Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedId && selectedPerson && (
            <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/95 backdrop-blur-xl"
                onClick={() => setSelectedId(null)}
              />
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.95 }}
                className="relative w-full max-w-5xl h-[85vh] rounded-[32px] border border-border bg-card shadow-[0_0_100px_-20px_rgba(124,77,255,0.2)] flex overflow-hidden"
              >
                {/* Left Side: Profile & Identity */}
                <div className="w-80 border-r border-border flex flex-col overflow-y-auto custom-scrollbar bg-secondary/5">
                    <div
                      className="h-48 bg-center bg-cover relative cursor-zoom-in"
                      style={{ backgroundImage: getBannerUrl(selectedPerson) ? `url(${getBannerUrl(selectedPerson)})` : 'linear-gradient(to bottom, #7c4dff, #09090b)' }}
                      onClick={() => getBannerUrl(selectedPerson) && setEnlargedLogMedia({ url: getBannerUrl(selectedPerson, 2048) })}
                    >
                    <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/20 to-transparent" />
                  </div>
                  <div className="px-8 -mt-14 relative z-10">
                    <div className="relative inline-block group/avatar">
                      <img
                        src={getAvatarUrl(selectedPerson)}
                        className="w-28 h-28 rounded-full border-[6px] border-card shadow-2xl relative z-10 transition-transform group-hover/avatar:scale-105 cursor-zoom-in"
                        onClick={() => setEnlargedLogMedia({ url: getAvatarUrl(selectedPerson, 2048) })}
                      />
                      {getDecorationUrl(selectedPerson) && (
                        <img
                          src={getDecorationUrl(selectedPerson)}
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] max-w-none z-20 pointer-events-none"
                        />
                      )}
                    </div>
                    <div className="mt-6">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                          <h2 className="text-2xl font-bold tracking-tight truncate">{selectedPerson.display_name}</h2>
                          {getGuildsArray(selectedPerson).map((g, idx) => (
                            <button
                              key={`${g.id}-${idx}`}
                              type="button"
                              onClick={() => {
                                setSelectedId(null);
                                setActiveGuildFilter({ id: g.id, name: g.name });
                                setSearch('');
                              }}
                              title="Bu tag ile filtrele"
                              className="inline-flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md bg-secondary/70 border border-border/80 hover:border-primary/30 hover:bg-primary/10 transition-all"
                            >
                              {g.icon ? (
                                <img src={g.icon} alt="" className="w-4 h-4 rounded-full object-cover" />
                              ) : (
                                <Shield className="w-3.5 h-3.5 text-primary/80" />
                              )}
                              <span className="text-[11px] font-bold tracking-tight text-foreground/90">{g.name}</span>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => syncMutation.mutate(selectedId)}
                          disabled={syncMutation.isPending}
                          className={cn(
                            "p-2 hover:bg-primary/10 rounded-xl border border-border/50 text-muted-foreground hover:text-primary transition-all active:scale-95 group/sync shrink-0",
                            syncMutation.isPending && "animate-spin text-primary"
                          )}
                          title="Profil Verilerini Discord'dan Güncelle"
                        >
                          <RefreshCw className={cn("w-4 h-4 transition-transform group-hover/sync:rotate-180", syncMutation.isPending && "animate-spin")} />
                        </button>
                      </div>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <p className="text-sm text-muted-foreground font-medium">@{selectedPerson.username}</p>
                        <div className="relative">
                          <AnimatePresence>
                            {copiedId && (
                              <motion.div
                                initial={{ opacity: 0, y: 10, x: '-50%' }}
                                animate={{ opacity: 1, y: -20, x: '-50%' }}
                                exit={{ opacity: 0, y: -30, x: '-50%' }}
                                className="absolute left-1/2 bottom-full mb-2 px-2 py-1 bg-primary text-[8px] font-black text-white rounded-md whitespace-nowrap z-50 shadow-lg shadow-primary/20 pointer-events-none uppercase tracking-widest"
                              >
                                Kopyalandı
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(selectedPerson.id);
                              setCopiedId(true);
                              setTimeout(() => setCopiedId(false), 2000);
                            }}
                            className="flex items-center gap-1.5 w-fit group/id"
                          >
                            <p className="text-[10px] text-muted-foreground/40 font-mono tracking-wider uppercase group-hover/id:text-primary transition-colors">{selectedPerson.id}</p>
                            <Copy className="w-2.5 h-2.5 text-muted-foreground/20 group-hover/id:text-primary transition-colors" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 space-y-6">
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                          <Fingerprint className="w-3 h-3 text-primary" /> Temel Bilgiler
                        </h4>
                        <div className="space-y-3">
                          <IdentityField
                            label="Gerçek Ad" value={selectedPerson.real_name}
                            onSave={(v) => saveIdentityMutation.mutate({ real_name: v })}
                          />
                          <LocationField
                            value={selectedPerson.location}
                            onSave={(v) => saveIdentityMutation.mutate({ location: v })}
                          />
                          <IdentityField
                            label="Yaş" value={selectedPerson.age}
                            onSave={(v) => saveIdentityMutation.mutate({ age: v })}
                            icon={Calendar}
                          />
                        </div>
                      </div>

                      {/* Compact Connections in Sidebar */}
                      <div className="pt-6 border-t border-border space-y-4">
                        <div className="flex justify-between items-center px-1">
                          <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                            <LinkIcon className="w-3 h-3 text-primary" /> Bağlantılar
                          </h4>
                          <button
                            onClick={() => setEditingConn(!editingConn)}
                            className="text-[9px] font-bold text-primary hover:underline"
                          >
                            {editingConn ? 'KAPAT' : 'EKLE'}
                          </button>
                        </div>

                        {editingConn && (
                          <div className="p-3 bg-secondary/30 rounded-xl border border-primary/20 space-y-3 animate-in fade-in slide-in-from-top-1">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                              <input
                                type="text"
                                placeholder="Kişi Ara..."
                                className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-[10px] outline-none focus:border-primary"
                                value={connSearch}
                                onChange={(e) => {
                                  setConnSearch(e.target.value);
                                  setConnTarget(''); // Reset selection on type
                                }}
                              />
                            </div>

                            {connSearch && !connTarget && (
                              <div className="max-h-60 overflow-y-auto custom-scrollbar border border-border rounded-lg bg-background divide-y divide-border">
                                {people
                                  .filter(p => p.id !== selectedId && (p.display_name.toLowerCase().includes(connSearch.toLowerCase()) || p.username.toLowerCase().includes(connSearch.toLowerCase())))
                                  .map(p => (
                                    <button
                                      key={p.id}
                                      onClick={() => {
                                        setConnTarget(p.id);
                                        setConnSearch(p.display_name);
                                      }}
                                      className="w-full flex items-center gap-2 p-2 hover:bg-secondary transition-colors text-left"
                                    >
                                      <img src={getAvatarUrl(p)} className="w-5 h-5 rounded-full" />
                                      <span className="text-[10px] font-medium truncate">{p.display_name}</span>
                                    </button>
                                  ))
                                }
                              </div>
                            )}

                            {connTarget && (
                              <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg">
                                <img src={getAvatarUrl(people.find(p => p.id === connTarget))} className="w-5 h-5 rounded-full" />
                                <span className="text-[10px] font-bold text-primary">Seçildi: {people.find(p => p.id === connTarget).display_name}</span>
                              </div>
                            )}

                            <input
                              type="text"
                              placeholder="İlişki (Örn: Arkadaş)"
                              className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-[10px] outline-none focus:border-primary"
                              value={connType}
                              onChange={(e) => setConnType(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && connTarget && connType) {
                                  addConnectionMutation.mutate({ from_id: selectedId, to_id: connTarget, type: connType, note: '' });
                                  setEditingConn(false);
                                  setConnTarget('');
                                  setConnSearch('');
                                  setConnType('Arkadaş');
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                if (connTarget && connType) {
                                  addConnectionMutation.mutate({ from_id: selectedId, to_id: connTarget, type: connType, note: '' });
                                  setEditingConn(false);
                                  setConnTarget('');
                                  setConnSearch('');
                                  setConnType('Arkadaş');
                                }
                              }}
                              className="w-full bg-primary text-white py-1.5 rounded-lg text-[10px] font-bold hover:scale-[1.02] active:scale-95 transition-all"
                            >
                              BAĞLANTIYI KAYDET
                            </button>
                          </div>
                        )}

                        <div className="space-y-2">
                          {allConnections.filter(c => c.from_id === selectedId || c.to_id === selectedId).map((conn, idx) => {
                            const otherId = conn.from_id === selectedId ? conn.to_id : conn.from_id;
                            const otherPerson = people.find(p => p.id === otherId);
                            return (
                              <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/5 group hover:bg-white/10 transition-colors relative">
                                <img src={otherPerson?.avatar ? getAvatarUrl(otherPerson) : 'https://cdn.discordapp.com/embed/avatars/0.png'} className="w-6 h-6 rounded-full" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold truncate">{otherPerson?.display_name || 'Bilinmeyen'}</p>
                                  <p className="text-[8px] text-primary font-bold uppercase">{conn.type}</p>
                                </div>
                                {confirmDeleteId === `${conn.from_id}-${conn.to_id}` ? (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="absolute inset-0 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center gap-2 rounded-lg z-20 border border-destructive/20"
                                  >
                                    <span className="text-[9px] font-black text-destructive uppercase tracking-widest">Silinsin mi?</span>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => deleteConnectionMutation.mutate({ from: conn.from_id, to: conn.to_id })}
                                        className="px-3 py-1 bg-destructive text-white rounded-md text-[8px] font-bold hover:bg-destructive/80 transition-colors shadow-lg shadow-destructive/20"
                                      >
                                        SİL
                                      </button>
                                      <button
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="px-3 py-1 bg-secondary text-foreground rounded-md text-[8px] font-bold hover:bg-secondary/80 transition-colors"
                                      >
                                        İPTAL
                                      </button>
                                    </div>
                                  </motion.div>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteId(`${conn.from_id}-${conn.to_id}`);
                                    }}
                                    className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-border">
                        <p className="text-xs text-muted-foreground leading-relaxed italic opacity-80">
                          "{selectedPerson.bio || 'Biyografi bulunmuyor.'}"
                        </p>
                      </div>

                      <div className="pt-6 border-t border-border">
                        {confirmDeletePerson ? (
                          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-1">
                            <p className="text-[10px] font-bold text-destructive uppercase text-center tracking-widest">TÜM VERİLER SİLİNSİN Mİ?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => deletePersonMutation.mutate(selectedId)}
                                disabled={deletePersonMutation.isPending}
                                className="flex-1 bg-destructive text-white py-2 rounded-xl text-[10px] font-bold hover:bg-destructive/80 transition-all shadow-lg shadow-destructive/20"
                              >
                                {deletePersonMutation.isPending ? 'SİLİNİYOR...' : 'EVET, SİL'}
                              </button>
                              <button
                                onClick={() => setConfirmDeletePerson(false)}
                                className="flex-1 bg-secondary text-foreground py-2 rounded-xl text-[10px] font-bold hover:bg-secondary/80 transition-all"
                              >
                                İPTAL
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeletePerson(true)}
                            className="w-full flex items-center justify-center gap-2 p-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-2xl transition-all group"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Kişiyi Sistemden Sil</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Notes & Activity */}
                <div className="flex-1 flex flex-col overflow-hidden bg-background/20">
                  <div className="px-8 h-20 border-b border-border flex justify-between items-center bg-card/50">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <History className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-bold tracking-tight">İstihbarat Merkezi</span>
                        {selectedPerson && (
                          <button
                            onClick={exportToPDF}
                            disabled={isExporting}
                            className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl text-primary transition-all group"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-black uppercase tracking-widest">{isExporting ? 'HAZIRLANIYOR...' : 'PDF DIŞA AKTAR'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-secondary rounded-xl transition-all active:scale-95">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-6 px-8 py-4 border-b border-border/50 bg-secondary/5">
                    <button
                      onClick={() => setActiveTab('notes')}
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative py-2",
                        activeTab === 'notes' ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      İstihbarat Notları
                      {activeTab === 'notes' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />}
                    </button>
                    <button
                      onClick={() => setActiveTab('media')}
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative py-2",
                        activeTab === 'media' ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Medya Kanıtları
                      {activeTab === 'media' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />}
                    </button>
                    <button
                      onClick={() => setActiveTab('logs')}
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative py-2",
                        activeTab === 'logs' ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Profil Geçmişi
                      {activeTab === 'logs' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    {activeTab === 'notes' ? (
                      /* Notes Section */
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <History className="w-4 h-4 text-primary" /> İstihbarat Notları
                          </h3>
                        </div>

                        <div className="space-y-4 bg-secondary/10 p-6 rounded-[24px] border border-white/5">
                          <textarea
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey && noteContent.trim()) {
                                e.preventDefault();
                                addNoteMutation.mutate(noteContent);
                              }
                            }}
                            placeholder="Yeni bir gözlem, IP adresi veya not ekleyin..."
                            className="w-full bg-transparent border-none text-sm outline-none h-20 resize-none placeholder:text-muted-foreground/50"
                          />
                          <div className="flex justify-end pt-2 border-t border-white/5">
                            <button
                              onClick={() => addNoteMutation.mutate(noteContent)}
                              disabled={!noteContent || addNoteMutation.isPending}
                              className="bg-primary text-white px-6 py-2 rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                              {addNoteMutation.isPending ? 'Kaydediliyor...' : <><Plus className="w-3.5 h-3.5" /> Notu İşle</>}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {logs.map((log) => (
                            <motion.div
                              key={log.id}
                              id={`log-${log.id}`}
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={cn(
                                "p-5 rounded-[20px] border transition-all group relative",
                                log.pinned ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/5" : "border-border bg-card/40 hover:bg-card/60",
                                highlightLogId === log.id && "ring-2 ring-primary border-primary bg-primary/10 animate-pulse"
                              )}
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-7 h-7 rounded-full overflow-hidden border border-primary/20 bg-secondary flex items-center justify-center shrink-0">
                                    {log.author_avatar ? (
                                      <img src={`https://cdn.discordapp.com/avatars/${log.author_discord_id}/${log.author_avatar}.${log.author_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-[10px] font-bold text-primary">{log.author?.[0].toUpperCase()}</span>
                                    )}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-bold tracking-tight">{log.author}</span>
                                    <span className="text-[9px] text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
                                  </div>
                                  {log.pinned === 1 && (
                                    <div className="ml-2 px-1.5 py-0.5 rounded-md bg-primary/20 text-primary text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                                      <Pin className="w-2.5 h-2.5 fill-primary" /> Sabit
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      const hist = JSON.parse(log.history || '[]');
                                      if (hist.length < 3) {
                                        setEditingNoteId(log.id)
                                        setEditingNoteContent(log.content)
                                      }
                                    }}
                                    className={cn(
                                      "p-2 rounded-lg hover:bg-secondary transition-all",
                                      (JSON.parse(log.history || '[]').length >= 3) ? "opacity-20 cursor-not-allowed" : "text-muted-foreground hover:text-primary"
                                    )}
                                    disabled={JSON.parse(log.history || '[]').length >= 3}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => pinNoteMutation.mutate({ id: log.id, pinned: !log.pinned })}
                                    className={cn("p-2 rounded-lg hover:bg-secondary transition-all", log.pinned ? "text-primary" : "text-muted-foreground")}
                                  >
                                    <Pin className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setConfirmData({
                                        title: 'NOTU SİL',
                                        message: 'Bu istihbarat notunu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
                                        onConfirm: () => {
                                          deleteNoteMutation.mutate(log.id)
                                          setConfirmData(null)
                                          notify('Not başarıyla silindi.', 'success')
                                        }
                                      })
                                    }}
                                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {editingNoteId === log.id ? (
                                <div className="space-y-3 mt-2 animate-in fade-in slide-in-from-top-1">
                                  <textarea
                                    value={editingNoteContent}
                                    onChange={(e) => setEditingNoteContent(e.target.value)}
                                    className="w-full bg-secondary/50 border border-primary/30 rounded-xl p-3 text-sm outline-none focus:border-primary resize-none h-24"
                                    autoFocus
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => setEditingNoteId(null)}
                                      className="px-4 py-1.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:bg-secondary transition-all"
                                    >
                                      İPTAL
                                    </button>
                                    <button
                                      onClick={() => editNoteMutation.mutate({ id: log.id, content: editingNoteContent })}
                                      className="px-4 py-1.5 rounded-lg text-[10px] font-bold bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                                    >
                                      KAYDET
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
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
                                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Eski</span>
                                                    <div 
                                                      className={cn("rounded-lg border border-border overflow-hidden bg-secondary/30 cursor-zoom-in", type === 'banner' ? "w-40 aspect-[16/9]" : "w-12 h-12 rounded-full")}
                                                      onClick={() => setEnlargedLogMedia({ url: getDiscordUrl(userId, oldHash, type, 2048) })}
                                                    >
                                                      <img src={oldUrl} className="w-full h-full object-cover" />
                                                    </div>
                                                  </div>
                                                )}
                                                {newUrl ? (
                                                  <div className="space-y-2">
                                                    <span className="text-[9px] font-black text-primary uppercase tracking-widest">Yeni</span>
                                                    <div 
                                                      className={cn("rounded-lg border border-primary/30 overflow-hidden bg-secondary/30 shadow-lg shadow-primary/5 cursor-zoom-in", type === 'banner' ? "w-40 aspect-[16/9]" : "w-12 h-12 rounded-full")}
                                                      onClick={() => setEnlargedLogMedia({ url: getDiscordUrl(userId, newHash, type, 2048) })}
                                                    >
                                                      <img src={newUrl} className="w-full h-full object-cover" />
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div className="space-y-2">
                                                    <span className="text-[9px] font-black text-destructive uppercase tracking-widest">Durum</span>
                                                    <div className="px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded-lg text-[9px] font-bold text-destructive">KALDIRILDI</div>
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
                                        // Fallback for non-JSON content or legacy logs
                                        if (content.includes('userId') && content.includes('{')) return 'Discord profil verileri otomatik güncellendi.';
                                        return content;
                                      }
                                      return content;
                                    };

                                    const isAuto = log.type === 'system' && (log.content.includes('"type"') || log.content.includes('{'));
                                    const formattedMessage = formatLogContent(log.content);
                                    const notesRichBody = isValidElement(formattedMessage) ? (
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
                                      <div className="space-y-3 w-full max-w-full overflow-hidden min-w-0">
                                        {isAuto && (
                                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[8px] font-black uppercase tracking-widest">
                                            <Activity className="w-2.5 h-2.5" /> Sistem Otomasyonu
                                          </div>
                                        )}
                                        <div className="text-sm text-foreground/90 leading-relaxed font-medium w-full" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                                          {notesRichBody}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  {log.history && JSON.parse(log.history).length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-border/50 space-y-4">
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-[10px] font-black text-primary/70 uppercase tracking-[0.2em]">
                                          <History className="w-3.5 h-3.5" /> Düzenleme Geçmişi
                                        </div>
                                        <div className="px-2 py-0.5 rounded-md bg-secondary/50 border border-border text-[8px] font-black text-muted-foreground uppercase">
                                          {3 - JSON.parse(log.history).length} DÜZENLEME HAKKI KALDI
                                        </div>
                                      </div>
                                      <div className="space-y-3">
                                        {JSON.parse(log.history).map((hist, hIdx) => (
                                          <div key={hIdx} className="p-4 rounded-[20px] bg-secondary/30 border border-border/40 relative overflow-hidden group/history">
                                            <p className="text-12px text-muted-foreground/80 italic leading-relaxed mb-3 break-words whitespace-pre-wrap">
                                              "<Linkify>{hist.content}</Linkify>"
                                            </p>
                                            <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                                              <div className="flex items-center gap-2.5">
                                                <div className="w-6 h-6 rounded-full overflow-hidden border border-primary/20 bg-primary/10 flex items-center justify-center shrink-0">
                                                  {hist.editor_avatar ? (
                                                    <img src={`https://cdn.discordapp.com/avatars/${hist.editor_discord_id}/${hist.editor_avatar}.${hist.editor_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full object-cover" />
                                                  ) : (
                                                    <span className="text-[9px] font-black text-primary">{hist.editor_name?.[0].toUpperCase() || 'U'}</span>
                                                  )}
                                                </div>
                                                <div className="flex flex-col">
                                                  <span className="text-[10px] font-bold text-foreground/70 leading-none">
                                                    {hist.editor_name} <span className="text-muted-foreground font-medium">düzenledi</span>
                                                  </span>
                                                  <span className="text-[8px] text-muted-foreground/60 italic mt-0.5">
                                                    {new Date(hist.edited_at).toLocaleString()}
                                                  </span>
                                                </div>
                                              </div>
                                              <span className="text-[8px] font-black text-primary/40 uppercase tracking-widest">SÜRÜM #{hIdx + 1}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ) : activeTab === 'media' ? (
                      /* Media Section */
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                              <ImageIcon className="w-4 h-4 text-primary" /> Medya Kanıtları
                            </h3>
                            <div className="h-4 w-px bg-border" />
                            <button
                              onClick={() => {
                                if (selectedMediaIds.length === personMedia.length) setSelectedMediaIds([])
                                else setSelectedMediaIds(personMedia.map(m => m.id))
                              }}
                              className="text-[10px] font-bold text-primary hover:underline uppercase tracking-tighter"
                            >
                              {selectedMediaIds.length === personMedia.length ? 'SEÇİMİ KALDIR' : 'TÜMÜNÜ SEÇ'}
                            </button>
                          </div>
                          <div className="flex items-center gap-4">
                            <input
                              type="file"
                              ref={fileInputRef}
                              className="hidden"
                              accept="image/*,video/*,audio/*,.pdf"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    addMediaMutation.mutate({ url: ev.target.result, note: '', isBase64: true });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </div>
                        </div>

                        {/* Bulk Actions Bar */}
                        <AnimatePresence>
                          {selectedMediaIds.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="bg-primary/10 border border-primary/20 p-4 rounded-2xl flex justify-between items-center mb-6"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-black">
                                  {selectedMediaIds.length}
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest">Öğe Seçildi</span>
                              </div>
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handleBulkDownload(personMedia.filter(m => selectedMediaIds.includes(m.id)))}
                                  className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl text-[10px] font-bold flex items-center gap-2 transition-all"
                                >
                                  <Download className="w-3.5 h-3.5" /> ZIP OLARAK İNDİR
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId('bulk')}
                                  className="px-4 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-xl text-[10px] font-bold flex items-center gap-2 transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> SEÇİLİLERİ SİL
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {personMedia.length === 0 ? (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="p-12 text-center border border-dashed border-border rounded-3xl bg-secondary/10 cursor-pointer hover:bg-primary/5 transition-all group"
                          >
                            <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 group-hover:bg-primary/10 transition-all">
                              <ImageIcon className="w-8 h-8 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                            </div>
                            <p className="text-xs text-muted-foreground font-medium italic group-hover:text-primary transition-colors">Henüz görsel kanıt eklenmemiş. Buraya tıklayarak ekleyebilirsiniz.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-3">
                            {personMedia.map((m, idx) => {
                              const isVideo = m.url.match(/\.(mp4|webm)$/i);
                              const isAudio = m.url.match(/\.(mp3|wav)$/i);
                              const isPDF = m.url.match(/\.pdf$/i);
                              const imageUrl = m.url.startsWith('/uploads') ? `${FILE_BASE}${m.url}` : m.url;
                              const isSelected = selectedMediaIds.includes(m.id);
                              return (
                                <div
                                  key={m.id}
                                  id={`media-${m.id}`}
                                  className={cn(
                                    "relative aspect-square group rounded-xl overflow-hidden border transition-all cursor-pointer",
                                    isSelected ? "ring-2 ring-primary border-primary" : "border-border",
                                    highlightMediaId === m.id && "ring-4 ring-primary border-primary shadow-[0_0_30px_rgba(var(--primary),0.5)] animate-pulse"
                                  )}
                                  onClick={() => {
                                    if (selectedMediaIds.length > 0) {
                                      if (isSelected) setSelectedMediaIds(prev => prev.filter(id => id !== m.id))
                                      else setSelectedMediaIds(prev => [...prev, m.id])
                                    } else {
                                      setPreviewIndex(idx)
                                    }
                                  }}
                                >
                                  <div className="w-full h-full bg-secondary/30 flex items-center justify-center">
                                    {isVideo ? (
                                      <Video className="w-8 h-8 text-blue-400" />
                                    ) : isAudio ? (
                                      <Mic className="w-8 h-8 text-green-400" />
                                    ) : isPDF ? (
                                      <FileText className="w-8 h-8 text-red-400" />
                                    ) : (
                                      <img src={imageUrl} className={cn("w-full h-full object-cover transition-transform duration-500 group-hover:scale-110", m.is_deleted && "opacity-40 grayscale")} />
                                    )}
                                  </div>

                                  {m.is_deleted && (
                                    <div className="absolute top-2 left-2 z-20 px-2 py-0.5 bg-destructive/80 backdrop-blur-md rounded-lg text-[8px] font-black text-white uppercase tracking-widest shadow-xl border border-white/10">
                                      SİLİNDİ
                                    </div>
                                  )}

                                  {/* Selection Checkbox */}
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isSelected) setSelectedMediaIds(prev => prev.filter(id => id !== m.id))
                                      else setSelectedMediaIds(prev => [...prev, m.id])
                                    }}
                                    className={cn(
                                      "absolute top-2 right-2 z-20 w-5 h-5 rounded-md border backdrop-blur-md flex items-center justify-center transition-all",
                                      isSelected ? "bg-primary border-primary" : "bg-black/20 border-white/20 opacity-0 group-hover:opacity-100"
                                    )}
                                  >
                                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                  </div>

                                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                                    <div className="space-y-2">
                                      <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                          <div className="w-5 h-5 rounded-full overflow-hidden border border-white/10 shrink-0">
                                            {m.author_avatar ? (
                                              <img src={`https://cdn.discordapp.com/avatars/${m.author_discord_id}/${m.author_avatar}.${m.author_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`} className="w-full h-full object-cover" />
                                            ) : (
                                              <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                                                <User className="w-2 h-2 text-primary" />
                                              </div>
                                            )}
                                          </div>
                                          <p className="text-[9px] font-bold text-primary uppercase tracking-tighter truncate">Ekleyen: {m.author}</p>
                                        </div>
                                      </div>

                                      {m.note && (
                                        <p className="text-[10px] text-white/90 italic leading-snug line-clamp-2 border-t border-white/10 pt-2">
                                          "<Linkify>{m.note}</Linkify>"
                                        </p>
                                      )}

                                      <div className="flex items-center gap-1.5 text-[8px] font-bold text-white/40 uppercase pt-1">
                                        <Calendar className="w-2.5 h-2.5" />
                                        {new Date(m.timestamp).toLocaleDateString()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Upload Card */}
                            <div
                              onClick={() => fileInputRef.current?.click()}
                              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group"
                            >
                              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all">
                                <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
                              </div>
                              <span className="text-[9px] font-black text-muted-foreground group-hover:text-primary uppercase tracking-widest">DOSYA YÜKLE</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : activeTab === 'logs' ? (
                      <div className="space-y-4">
                        {systemLogs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <History className="w-12 h-12 mb-4" />
                            <p className="text-sm font-bold tracking-widest uppercase">Kayıt Bulunmuyor</p>
                          </div>
                        ) : (
                          systemLogs.map((log, idx) => (
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              key={log.id}
                              id={`log-${log.id}`}
                              className="group relative pl-8 pb-8 last:pb-0"
                            >
                              {/* Timeline Line */}
                              {idx !== systemLogs.length - 1 && (
                                <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-border group-hover:bg-primary/20 transition-colors" />
                              )}

                              {/* Timeline Dot */}
                              <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-secondary border-2 border-border flex items-center justify-center z-10 group-hover:border-primary/50 transition-colors shadow-lg">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                              </div>

                              <div className="bg-secondary/20 border border-border/50 rounded-2xl p-5 hover:bg-secondary/40 transition-all hover:border-primary/20 shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                  <span className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 px-2 py-1 rounded-lg">SİSTEM OTOMASYONU</span>
                                  <span className="text-[10px] font-mono text-muted-foreground opacity-50">{new Date(log.timestamp).toLocaleString('tr-TR')}</span>
                                </div>

                                {(() => {
                                  const content = log.content;
                                  const getDiscordUrl = (userId, hash, type, size) => {
                                    if (!hash || !userId) return null;
                                    const ext = hash.startsWith('a_') ? 'gif' : 'png';
                                    const baseUrl = type === 'banner' ? 'banners' : 'avatars';
                                    const s = size || (type === 'banner' ? 600 : 128);
                                    return `https://cdn.discordapp.com/${baseUrl}/${userId}/${hash}.${ext}?size=${s}`;
                                  };

                                  if (content.includes('"type"') && content.includes('{')) {
                                    try {
                                      const data = JSON.parse(content);
                                      if (data.type === 'banner' || data.type === 'avatar') {
                                        const { type, userId, old: oldHash, new: newHash } = data;
                                        const oldUrl = getDiscordUrl(userId, oldHash, type);
                                        const newUrl = getDiscordUrl(userId, newHash, type);

                                        return (
                                          <div className="flex items-center gap-6 py-2 overflow-hidden min-w-0">
                                            {oldUrl && (
                                              <div className="flex flex-col items-center gap-2 shrink-0">
                                                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Önceki</div>
                                                 <div 
                                                  className={cn("rounded-lg border border-border overflow-hidden bg-secondary/30 cursor-zoom-in", type === 'banner' ? "w-40 aspect-[16/9]" : "w-16 h-16 rounded-full")}
                                                  onClick={() => setEnlargedLogMedia({ url: getDiscordUrl(userId, oldHash, type, 2048) })}
                                                >
                                                  <img src={oldUrl} className="w-full h-full object-cover opacity-60" />
                                                </div>
                                              </div>
                                            )}
                                            {(oldUrl && newUrl) && <ArrowRight className="w-5 h-5 text-primary/40 animate-pulse shrink-0" />}
                                            {newUrl ? (
                                              <div className="flex flex-col items-center gap-2 shrink-0">
                                                <div className="text-[9px] font-bold text-primary uppercase tracking-widest">Yeni</div>
                                                 <div 
                                                  className={cn("rounded-lg border border-primary/40 overflow-hidden bg-secondary/30 shadow-xl shadow-primary/10 cursor-zoom-in", type === 'banner' ? "w-40 aspect-[16/9]" : "w-16 h-16 rounded-full")}
                                                  onClick={() => setEnlargedLogMedia({ url: getDiscordUrl(userId, newHash, type, 2048) })}
                                                >
                                                  <img src={newUrl} className="w-full h-full object-cover" />
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded-lg text-[9px] font-bold text-destructive uppercase tracking-tighter">GÖRSEL KALDIRILDI</div>
                                            )}
                                            <div className="ml-4 min-w-0">
                                              <p className="text-sm font-bold text-foreground truncate">
                                                {type === 'banner' ? 'Kapak fotoğrafı yenilendi' : 'Profil fotoğrafı yenilendi'}
                                              </p>
                                            </div>
                                          </div>
                                        );
                                      }
                                      if (data.type === 'username') return `Discord kullanıcı adı «${data.new}» olarak güncellendi.`;
                                      if (data.type === 'display_name') return `Görünen ad «${data.new}» olarak güncellendi.`;
                                      if (data.type === 'decoration') return 'Profildeki çerçeve / dekorasyon değişti.';
                                      if (data.type === 'initial') return data.message || 'Kayıt ilk kez oluşturuldu.';
                                    } catch (e) {
                                      // Fallback to existing regex if needed, but JSON.parse is preferred
                                    }
                                  }

                                  if (content.includes('"type":"display_name"')) {
                                    const matchOld = content.match(/"old":"([^"]+)"/);
                                    const matchNew = content.match(/"new":"([^"]+)"/);
                                    return (
                                      <div className="flex items-center gap-4 py-1">
                                        <div className="px-3 py-1 bg-secondary border border-border rounded-lg line-through opacity-50 text-xs">{matchOld ? matchOld[1] : '?'}</div>
                                        <ArrowRight className="w-4 h-4 text-primary/40" />
                                        <div className="px-3 py-1 bg-primary/20 border border-primary/30 rounded-lg text-xs font-bold text-primary shadow-sm">{matchNew ? matchNew[1] : '?'}</div>
                                        <p className="text-sm font-medium text-foreground ml-2">Nickname Değiştirildi</p>
                                      </div>
                                    );
                                  }

                                  if (content.includes('"type":"username"')) {
                                    const matchOld = content.match(/"old":"([^"]+)"/);
                                    const matchNew = content.match(/"new":"([^"]+)"/);
                                    return (
                                      <div className="flex items-center gap-4 py-1">
                                        <div className="px-3 py-1 bg-secondary border border-border rounded-lg line-through opacity-50 text-xs">{matchOld ? matchOld[1] : '?'}</div>
                                        <ArrowRight className="w-4 h-4 text-primary/40" />
                                        <div className="px-3 py-1 bg-primary/20 border border-primary/30 rounded-lg text-xs font-bold text-primary shadow-sm">{matchNew ? matchNew[1] : '?'}</div>
                                        <p className="text-sm font-medium text-foreground ml-2">Kullanıcı Adı Değişti</p>
                                      </div>
                                    );
                                  }

                                  if (content.includes('"type":"initial"')) {
                                    const match = content.match(/"message":"([^"]+)"/);
                                    return <p className="text-sm text-foreground/90 font-medium leading-relaxed">{match ? match[1] : 'Kayıt ilk kez oluşturuldu.'}</p>;
                                  }

                                  // Handle non-JSON logs (like manual deletions/uploads)
                                  const urlMatch = content.match(/\(URL: ([^, \)]+)/);

                                  if (urlMatch) {
                                    const url = urlMatch[1];
                                    const noteMatch = content.match(/Not: (.*?)\)/);
                                    const note = noteMatch ? noteMatch[1] : null;
                                    const fullUrl = url.startsWith('/uploads') ? `${FILE_BASE}${url}` : url;
                                    const isMediaDelete = logContentLooksLikeDeletion(content);
                                    const isAdmin = user.role === 'admin';

                                    // Hide preview for non-admins if it's a delete log
                                    if (isMediaDelete && !isAdmin) {
                                      let plain = content.split('(URL:')[0].trim();
                                      if (log.author && plain.startsWith(log.author)) {
                                        plain = plain.substring(log.author.length).trim();
                                      }
                                      return (
                                        <div className="text-sm text-foreground/90 font-medium leading-relaxed">
                                          <LogRichContent content={plain} log={log} setSelectedId={setSelectedId} setView={setView} />
                                        </div>
                                      );
                                    }

                                    // Extract clean message by removing author name and metadata
                                    let message = content.split('(URL:')[0].trim();
                                    if (log.author && message.startsWith(log.author)) {
                                      message = message.substring(log.author.length).trim();
                                    }

                                    return (
                                      <div className="space-y-4">
                                        <div className="text-sm text-foreground/90 font-medium leading-relaxed">
                                          <LogRichContent content={message} log={log} setSelectedId={setSelectedId} setView={setView} />
                                        </div>
                                        <div className="relative group/logimg max-w-sm">
                                          <div className="aspect-video rounded-2xl overflow-hidden border border-border/50 bg-black/20">
                                            {url.match(/\.(mp4|webm)$/i) ? (
                                              <video src={fullUrl} className="w-full h-full object-cover" muted />
                                            ) : (
                                              <img src={fullUrl} className="w-full h-full object-cover" />
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/logimg:opacity-100 transition-opacity flex items-center justify-center">
                                              <button
                                                onClick={() => {
                                                  setEnlargedLogMedia({
                                                    url: fullUrl,
                                                    note: note,
                                                    isVideo: url.match(/\.(mp4|webm)$/i),
                                                    isAudio: url.match(/\.(mp3|wav)$/i),
                                                    isPDF: url.match(/\.pdf$/i)
                                                  })
                                                }}
                                                className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-primary/20 hover:scale-110 transition-all"
                                              >
                                                <ImageIcon className="w-5 h-5" />
                                              </button>
                                            </div>
                                          </div>
                                          {note && (
                                            <div className="mt-2 px-3 py-1.5 bg-secondary/30 rounded-xl border border-white/5 text-[10px] text-muted-foreground italic">
                                              <span className="font-bold text-primary/70 not-italic uppercase tracking-tighter mr-2">NOT:</span>
                                              <Linkify>{note}</Linkify>
                                            </div>
                                          )}
                                          {isMediaDelete && (
                                            <div className="absolute top-2 right-2 px-2 py-1 bg-destructive/80 backdrop-blur-md rounded-lg text-[8px] font-black text-white uppercase tracking-widest shadow-xl">
                                              SİLİNEN KANIT
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }

                                  let plainBody = log.content;
                                  if (log.author && plainBody.startsWith(log.author)) {
                                    plainBody = plainBody.substring(log.author.length).trim();
                                  }
                                  return (
                                    <div className="text-sm text-foreground/90 font-medium leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]">
                                      <LogRichContent content={plainBody} log={log} setSelectedId={setSelectedId} setView={setView} />
                                    </div>
                                  );
                                })()}
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 opacity-20">
                        <Plus className="w-12 h-12 mb-4" />
                        <p className="text-sm font-bold tracking-widest uppercase">Sekme Hazırlanıyor</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Image Preview Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence mode="wait">
          {previewIndex !== null && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-12 overflow-hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-2xl"
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
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Kanıt Dosyası</span>
                  <span className="text-white/60 text-xs font-medium">{previewIndex + 1} / {personMedia.length}</span>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      const item = personMedia?.[previewIndex];
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
                      const m = personMedia?.[previewIndex];
                      if (!m) return;
                      const url = m.url.startsWith('/uploads') ? `${FILE_BASE}${m.url}` : m.url;
                      handleDownload(url);
                    }}
                    className="p-3 bg-white/5 hover:bg-primary/20 hover:text-primary rounded-2xl text-white transition-all active:scale-95 flex items-center gap-2 group"
                  >
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span className="text-[10px] font-bold uppercase tracking-widest pr-1">İndir</span>
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
                  className="p-4 bg-black/40 hover:bg-primary/20 rounded-full text-white transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed pointer-events-auto backdrop-blur-md border border-white/5"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button
                  disabled={previewIndex === personMedia.length - 1}
                  onClick={(e) => { e.stopPropagation(); setPreviewIndex(prev => prev + 1); }}
                  className="p-4 bg-black/40 hover:bg-primary/20 rounded-full text-white transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed pointer-events-auto backdrop-blur-md border border-white/5"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </motion.div>

              <motion.div
                key={previewIndex}
                initial={{ opacity: 0, scale: 0.9, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: -20 }}
                className="relative z-[110] w-full h-full flex items-center justify-center pointer-events-none p-12"
              >
                <div className="relative group/image pointer-events-auto max-w-full max-h-[90vh] flex flex-col items-center justify-center">
                  {personMedia?.[previewIndex]?.url.match(/\.(mp4|webm)$/i) ? (
                    <video src={personMedia[previewIndex].url.startsWith('/uploads') ? `${FILE_BASE}${personMedia[previewIndex].url}` : personMedia?.[previewIndex]?.url} controls className="max-w-full max-h-[70vh] rounded-3xl shadow-2xl" autoPlay />
                  ) : personMedia?.[previewIndex]?.url.match(/\.(mp3|wav)$/i) ? (
                    <div className="bg-secondary/50 p-12 rounded-[40px] border border-white/10 flex flex-col items-center gap-8 min-w-[400px]">
                      <Mic className="w-20 h-20 text-green-400" />
                      <audio src={personMedia[previewIndex].url.startsWith('/uploads') ? `${FILE_BASE}${personMedia[previewIndex].url}` : personMedia?.[previewIndex]?.url} controls className="w-full" autoPlay />
                    </div>
                  ) : personMedia?.[previewIndex]?.url.match(/\.pdf$/i) ? (
                    <div className="bg-secondary/50 p-12 rounded-[40px] border border-white/10 flex flex-col items-center gap-8 min-w-[400px] text-center">
                      <FileText className="w-20 h-20 text-red-400" />
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold">PDF Dökümanı</h3>
                        <p className="text-muted-foreground">Bu dökümanı incelemek için lütfen indirme butonunu kullanın.</p>
                      </div>
                    </div>
                  ) : (
                    <img src={personMedia?.[previewIndex]?.url.startsWith('/uploads') ? `${FILE_BASE}${personMedia[previewIndex].url}` : personMedia?.[previewIndex]?.url} className="max-w-full max-h-[70vh] object-contain rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.9)] select-none border border-white/10" />
                  )}
                  {personMedia?.[previewIndex] && (
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
                                  setTempNote(personMedia[previewIndex].note || '')
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
                                  editMediaNoteMutation.mutate({ id: personMedia[previewIndex].id, note: '' })
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
                            <span className="text-[9px] font-bold text-white/70 uppercase tracking-tighter">{personMedia?.[previewIndex]?.author || 'Sistem'}</span>
                            {personMedia?.[previewIndex]?.author_avatar ? (
                              <img
                                src={`https://cdn.discordapp.com/avatars/${personMedia[previewIndex].author_discord_id}/${personMedia[previewIndex].author_avatar}.${personMedia[previewIndex].author_avatar.startsWith('a_') ? 'gif' : 'png'}?size=32`}
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                              />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center border border-white/10">
                                <User className="w-2 h-2 text-primary" />
                              </div>
                            )}
                          </div>
                          <span className="text-[8px] text-white/50">{new Date(personMedia?.[previewIndex]?.timestamp).toLocaleString()}</span>
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
                                    editMediaNoteMutation.mutate({ id: personMedia[previewIndex].id, note: tempNote });
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
                                onClick={() => editMediaNoteMutation.mutate({ id: personMedia[previewIndex].id, note: tempNote })}
                                disabled={editMediaNoteMutation.isPending}
                                className="px-4 py-1.5 rounded-lg text-[10px] font-bold bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                              >
                                {editMediaNoteMutation.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="max-h-32 overflow-y-auto custom-scrollbar pr-1">
                            <p className="text-white/90 text-sm italic leading-relaxed text-center break-words whitespace-pre-wrap">
                              {personMedia?.[previewIndex]?.note ? `"${personMedia[previewIndex].note}"` : <span className="opacity-30 italic">Not eklenmemiş...</span>}
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
      {/* Delete Confirmation Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {deleteConfirmId && (
            <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
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
                  <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto text-destructive animate-pulse">
                    <Trash2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{deleteConfirmId === 'bulk' ? 'Seçilileri Sil?' : 'Kanıtı Sil?'}</h3>
                    <p className="text-sm text-muted-foreground mt-2 px-4">
                      {deleteConfirmId === 'bulk'
                        ? `${selectedMediaIds.length} adet kanıt dosyası arşivden kalıcı olarak silinecektir. Bu işlem geri alınamaz.`
                        : "Bu işlem geri alınamaz. Kanıt dosyası arşivden kalıcı olarak silinecektir."
                      }
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => {
                        if (deleteConfirmId === 'bulk') {
                          bulkDeleteMediaMutation.mutate(selectedMediaIds);
                        } else {
                          deleteMediaMutation.mutate(deleteConfirmId);
                        }
                      }}
                      disabled={deleteMediaMutation.isPending || bulkDeleteMediaMutation.isPending}
                      className="w-full py-4 bg-destructive text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-destructive/20 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      {(deleteMediaMutation.isPending || bulkDeleteMediaMutation.isPending) ? "SİLİNİYOR..." : "EVET, KALICI OLARAK SİL"}
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
        </AnimatePresence>,
        document.body
      )}

      {/* Enlarged Log Media Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {enlargedLogMedia && (
            <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 overflow-hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-2xl"
                onClick={() => setEnlargedLogMedia(null)}
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-6"
              >
                <div className="relative group/largeimg">
                  {enlargedLogMedia.isVideo ? (
                    <video src={enlargedLogMedia.url} controls className="max-w-full max-h-[70vh] rounded-[32px] shadow-2xl" autoPlay />
                  ) : enlargedLogMedia.isAudio ? (
                    <div className="bg-secondary/50 p-12 rounded-[40px] border border-white/10 flex flex-col items-center gap-8 min-w-[400px]">
                      <Mic className="w-20 h-20 text-green-400" />
                      <audio src={enlargedLogMedia.url} controls className="w-full" autoPlay />
                    </div>
                  ) : enlargedLogMedia.isPDF ? (
                    <div className="bg-secondary/50 p-12 rounded-[40px] border border-white/10 flex flex-col items-center gap-8 min-w-[400px] text-center">
                      <FileText className="w-20 h-20 text-red-400" />
                      <h3 className="text-2xl font-bold">PDF Dökümanı</h3>
                    </div>
                  ) : (
                    <img src={enlargedLogMedia.url} className="max-w-full max-h-[70vh] object-contain rounded-[32px] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10" />
                  )}

                  <button
                    onClick={() => setEnlargedLogMedia(null)}
                    className="absolute -top-12 right-0 p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white transition-all active:scale-95"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {enlargedLogMedia.note && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-white/5 backdrop-blur-md border border-white/10 rounded-[24px] max-w-2xl text-center shadow-xl"
                  >
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Görsel Notu</span>
                    </div>
                    <p className="text-white/90 text-sm italic leading-relaxed break-words whitespace-pre-wrap">
                      "{enlargedLogMedia.note}"
                    </p>
                  </motion.div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <ConfirmDialog
        isOpen={!!confirmData}
        title={confirmData?.title}
        message={confirmData?.message}
        onConfirm={confirmData?.onConfirm}
        onCancel={() => setConfirmData(null)}
      />
    </div>
  )
}

function PersonCard({ p, setSelectedId, getAvatarUrl, getBannerUrl, getDecorationUrl, getShortLocation, setActiveGuildFilter }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseX = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseY = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(mouseY, [-100, 100], [3, -3]);
  const rotateY = useTransform(mouseX, [-100, 100], [-3, 3]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    x.set((px - 0.5) * 200);
    y.set((py - 0.5) * 200);
  };

  const z = useMotionValue(0);
  const springZ = useSpring(z, { stiffness: 300, damping: 30 });
  const transform = useMotionTemplate`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${springZ}px)`;

  return (
    <motion.div
      onClick={() => setSelectedId(p.id)}
      onMouseMove={(e) => {
        handleMouseMove(e);
        z.set(-20);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
        z.set(0);
      }}
      style={{ transform, transformStyle: "preserve-3d" }}
      className="group relative bg-card/60 backdrop-blur-xl rounded-[32px] p-0 border border-white/10 cursor-pointer overflow-hidden shadow-2xl hover:shadow-primary/30 h-[200px] flex flex-row max-w-[500px] mx-auto w-full"
    >
      {/* Full Background Banner */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0 bg-center bg-cover transition-transform duration-1000 group-hover:scale-105"
          style={{
            backgroundImage: getBannerUrl(p) ? `url(${getBannerUrl(p)})` : 'linear-gradient(135deg, #7c4dff, #18181b)',
            imageRendering: 'high-quality',
            filter: 'brightness(0.6) contrast(1.1)'
          }}
        />
        {/* Subtle Grain Overlay to mask low-res */}
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-black/90" />
      </div>

      {/* Left Side: Avatar */}
      <div className="w-1/3 relative z-10 flex items-center justify-center">
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-white/10 bg-card/50 overflow-hidden shadow-2xl relative z-10">
            <img src={getAvatarUrl(p)} className="w-full h-full object-cover" />
          </div>
          {getDecorationUrl(p) && (
            <img
              src={getDecorationUrl(p)}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[125%] max-w-none z-20 pointer-events-none"
            />
          )}
          <div className="absolute bottom-1.5 right-1.5 w-5 h-5 bg-green-500 border-2 border-white/20 rounded-full z-30 shadow-lg" />
        </div>
      </div>

      {/* Right Side: Content */}
      <div className="flex-1 p-8 relative z-10 flex flex-col justify-center">
        <div className={p.real_name ? "translate-y-4" : "translate-y-0"}>
          <div className="space-y-0.5">
            <h3 className="font-bold text-2xl tracking-tight text-white group-hover:text-primary transition-colors leading-tight">{p.display_name}</h3>
            <p className="text-[11px] text-white/50 font-medium tracking-[0.2em] uppercase">@{p.username}</p>
          </div>

          {p.real_name && (
            <div className="mt-4 w-fit px-3 py-1 bg-primary/20 border border-primary/30 rounded-full backdrop-blur-md">
              <p className="text-[9px] text-primary-foreground font-black uppercase tracking-wide">{p.real_name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Top Right: Location Badge */}
      {p.location && (
        <div className="absolute top-5 right-5 z-20 px-3 py-1.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl flex items-center gap-1.5 shadow-xl">
          <MapPin className="w-3 h-3 text-primary" />
          <span className="text-[9px] font-black text-white/80 uppercase tracking-widest">{getShortLocation(p.location)}</span>
        </div>
      )}
    </motion.div>
  );
}
function IdentityField({ label, value, onSave, icon: Icon = User }) {
  const [editing, setEditing] = useState(false)
  const isAge = label === 'Yaş'
  const toInputStr = (v) => (v === null || v === undefined ? '' : String(v))

  const [val, setVal] = useState(toInputStr(value))

  React.useEffect(() => {
    if (!editing) setVal(toInputStr(value))
  }, [value, editing])

  const displayText =
    value === null || value === undefined || value === ''
      ? 'Belirtilmedi'
      : String(value)

  const handleSave = () => {
    if (isAge) {
      const trimmed = val.trim()
      const next = trimmed === '' ? null : parseInt(trimmed, 10)
      if (next !== null && !Number.isFinite(next)) {
        setEditing(false)
        return
      }
      const prev =
        value === null || value === undefined || value === ''
          ? null
          : Number(value)
      if (next !== prev) onSave(next)
    } else {
      if (toInputStr(val) !== toInputStr(value)) onSave(val)
    }
    setEditing(false)
  }

  return (
    <div className="space-y-1.5 p-3 rounded-xl hover:bg-white/5 transition-colors group">
      <div className="flex justify-between items-center">
        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.1em] flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-primary/70" /> {label}
        </label>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[9px] text-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity">DÜZENLE</button>
        )}
      </div>
      {editing ? (
        <div className="flex gap-2">
          <input
            type={isAge ? 'number' : 'text'}
            min={isAge ? 0 : undefined}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
            className="flex-1 bg-secondary/80 border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary"
            autoFocus
          />
          <button type="button" onClick={handleSave} className="bg-primary text-white p-1.5 rounded-lg active:scale-90 transition-transform"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <p className="text-sm font-semibold tracking-tight">{displayText}</p>
      )}
    </div>
  )
}

function LocationField({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  React.useEffect(() => {
    if (!editing) setVal(value ?? '')
  }, [value, editing])

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (editing && val.length > 2) {
        fetchSuggestions(val)
      } else {
        setSuggestions([])
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [val, editing])

  const fetchSuggestions = async (query) => {
    setLoading(true)
    try {
      // Added addressdetails=1 to get individual components
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`)
      setSuggestions(res.data)
      setShowDropdown(true)
    } catch (e) {
      console.error('OSM Fetch Error:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = () => {
    if (val !== (value ?? '')) {
      onSave(val)
    }
    setEditing(false)
    setShowDropdown(false)
  }

  const selectSuggestion = (s) => {
    setVal(s.display_name)
    setSuggestions([])
    setShowDropdown(false)
  }

  return (
    <div className="space-y-1.5 p-3 rounded-xl hover:bg-white/5 transition-colors group relative">
      <div className="flex justify-between items-center">
        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.1em] flex items-center gap-1.5">
          <MapPin className="w-3 h-3 text-primary/70" /> KONUM
        </label>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-[9px] text-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity uppercase">Düzenle</button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 relative">
          <div className="flex gap-2">
            <input
              type="text" value={val}
              onChange={(e) => setVal(e.target.value)}
              onFocus={() => val.length > 2 && setShowDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
              placeholder="Adres veya şehir arayın..."
              className="flex-1 bg-secondary/80 border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary"
              autoFocus
            />
            <button onClick={handleSave} className="bg-primary text-white p-1.5 rounded-lg active:scale-90 transition-transform"><Plus className="w-3.5 h-3.5" /></button>
          </div>

          {/* Suggestions Dropdown */}
          <AnimatePresence>
            {showDropdown && (suggestions.length > 0 || loading) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-10 mt-1 z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
              >
                {loading ? (
                  <div className="p-3 text-[10px] text-muted-foreground animate-pulse">Sistem taranıyor...</div>
                ) : (
                  <div className="divide-y divide-border max-h-48 overflow-y-auto custom-scrollbar">
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectSuggestion(s)}
                        className="w-full px-3 py-2 text-left text-[10px] hover:bg-primary/10 transition-colors flex flex-col gap-0.5"
                      >
                        <span className="font-bold text-foreground truncate">{s.display_name.split(',')[0]}</span>
                        <span className="text-muted-foreground truncate opacity-60">{s.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-sm font-semibold tracking-tight">{value || 'Belirtilmedi'}</p>
      )}
    </div>
  )
}
