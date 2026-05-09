/**
 * - Geliştirme: http://localhost:3001
 * - Tek sunucu (Render vb.): VITE_API_URL verme → aynı origin, API_BASE=/api
 * - Ayrı domain (Vercel ön yüz + API): VITE_API_URL=https://api.example.com
 */
const raw = import.meta.env.VITE_API_URL

let origin = ''
if (typeof raw === 'string' && raw.trim() !== '') {
  origin = raw.trim().replace(/\/$/, '')
} else if (import.meta.env.DEV) {
  origin = 'http://localhost:3001'
}

export const FILE_BASE = origin
export const API_BASE = origin ? `${origin}/api` : '/api'
