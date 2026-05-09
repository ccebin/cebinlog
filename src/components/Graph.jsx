import React, { useEffect, useRef } from 'react'
import { DataSet, Network } from 'vis-network/standalone'
import { Share2, Zap, Target, Search, Globe, MessageSquare } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { API_BASE } from '../lib/apiBase'

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

export default function Graph() {
  const containerRef = useRef(null)
  const networkRef = useRef(null)
  const nodesRef = useRef(null)
  const edgesRef = useRef(null)
  const [searchTerm, setSearchTerm] = React.useState('')
  const driftState = useRef({
    angle: 0,
    isPaused: false,
    isHovering: false
  })

  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => axios.get(`${API_BASE}/people`, { headers: getHeaders() }).then(res => res.data)
  })

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => axios.get(`${API_BASE}/connections`, { headers: getHeaders() }).then(res => res.data)
  })

  const { data: logsData = [] } = useQuery({
    queryKey: ['allLogs'],
    queryFn: () => axios.get(`${API_BASE}/logs`, { headers: getHeaders() }).then(res => res.data)
  })

  useEffect(() => {
    if (!containerRef.current || people.length === 0) return

    const graphNodes = []
    const graphEdges = []

    // 1. Identify Unique Locations & Names for Shared Hubs
    const uniqueLocations = [...new Set(people.map(p => p.location).filter(Boolean))]
    const uniqueFirstNames = [...new Set(people.map(p => p.real_name?.split(' ')[0]).filter(Boolean))]

    uniqueLocations.forEach(loc => {
      graphNodes.push({
        id: `loc-${loc}`,
        label: loc,
        shape: 'dot',
        size: 12,
        color: { background: '#22c55e', border: 'transparent' },
        font: { color: '#ffffff', size: 12, face: 'Inter', weight: 'bold', strokeWidth: 4, strokeColor: '#09090b' },
        shadow: { enabled: true, color: 'rgba(34, 197, 94, 0.4)', size: 20 }
      })
    })

    uniqueFirstNames.forEach(name => {
      graphNodes.push({
        id: `fname-${name}`,
        label: name,
        shape: 'dot',
        size: 10,
        color: { background: '#7c4dff', border: 'transparent' },
        font: { color: '#ffffff', size: 11, face: 'Inter', weight: 'bold', strokeWidth: 3, strokeColor: '#09090b' },
        shadow: { enabled: false }
      })
    })

    people.forEach(p => {
      // Main Person Node
      graphNodes.push({
        id: p.id,
        label: p.display_name,
        shape: 'circularImage',
        image: getAvatarUrl(p),
        size: 30,
        borderWidth: 0,
        color: { background: '#09090b' },
        font: { color: '#fafafa', size: 12, face: 'Inter', weight: 'bold' },
        shadow: { enabled: false }
      })

      // Shared Info: Name (Connect to shared name hub)
      if (p.real_name) {
        const firstName = p.real_name.split(' ')[0]
        graphEdges.push({
          from: p.id,
          to: `fname-${firstName}`,
          length: 150,
          dashes: true,
          color: { color: '#7c4dff', opacity: 0.1 }
        })
      }

      // Shared Info: Location (Connect to shared hub)
      if (p.location) {
        graphEdges.push({
          from: p.id,
          to: `loc-${p.location}`,
          length: 200,
          dashes: true,
          color: { color: '#22c55e', opacity: 0.1 }
        })
      }
    })

    // Original Connections
    connections.forEach(c => {
      graphEdges.push({
        from: c.from_id,
        to: c.to_id,
        label: c.type,
        color: { color: '#3f3f46', opacity: 0.3 },
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        smooth: { type: 'continuous' },
        length: 300
      })
    })

    // 4. Add Logs/Notes as Nodes
    logsData.forEach(log => {
      if (log.type !== 'note') return
      const logId = `log-${log.id}`
      const preview = log.content.substring(0, 30) + (log.content.length > 30 ? '...' : '')

      graphNodes.push({
        id: logId,
        label: preview,
        title: log.content, // Tooltip
        shape: 'box',
        margin: 10,
        color: { background: 'rgba(9, 9, 11, 0.8)', border: '#3f3f46' },
        font: { color: '#a1a1aa', size: 10, face: 'Inter', multi: true },
        shadow: { enabled: false }
      })

      graphEdges.push({
        from: log.target_id,
        to: logId,
        length: 80,
        color: { color: '#27272a', opacity: 0.5 },
        width: 1
      })
    })

    const nodes = new DataSet(graphNodes)
    const edges = new DataSet(graphEdges)
    nodesRef.current = nodes
    edgesRef.current = edges

    const options = {
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -50,
          centralGravity: 0.01,
          springLength: 100,
          springConstant: 0.08,
          avoidOverlap: 0.5
        },
        maxVelocity: 10,
        stabilization: {
          enabled: true,
          iterations: 50,
          updateInterval: 50
        }
      },
      layout: {
        improvedLayout: false
      },
      interaction: {
        hover: true,
        tooltipDelay: 300,
        hideEdgesOnDrag: true,
        hideEdgesOnZoom: true,
        zoomView: true
      }
    }

    networkRef.current = new Network(containerRef.current, { nodes, edges }, options)

    // Interaction logic for highlighting and motion control
    networkRef.current.on('click', (params) => {
      const selectedId = params.nodes[0]

      if (selectedId) {
        if (driftState.current.selectedNode === selectedId) return
        driftState.current.selectedNode = selectedId
        driftState.current.isPaused = true

        // Focus and Zoom In
        networkRef.current.focus(selectedId, {
          scale: 1.2,
          animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
        })

        const connectedNodes = networkRef.current.getConnectedNodes(selectedId)
        const connectedEdges = networkRef.current.getConnectedEdges(selectedId)

        // Update nodes: Highlight selected and neighbors with glow
        const allNodes = nodes.getIds()
        nodes.update(allNodes.map(id => {
          const isActive = id === selectedId || connectedNodes.includes(id)
          return {
            id,
            opacity: isActive ? 1 : 0.1,
            shadow: { enabled: isActive, color: id === selectedId ? '#7c4dff' : 'rgba(124, 77, 255, 0.4)', size: id === selectedId ? 35 : 20 }
          }
        }))

        // Update edges: Elegant glowing curves
        const allEdges = edges.getIds()
        edges.update(allEdges.map(id => {
          const isConnected = connectedEdges.includes(id)
          return {
            id,
            color: isConnected ? { color: '#7c4dff', opacity: 1 } : { color: '#27272a', opacity: 0.05 },
            width: isConnected ? 2 : 1,
            shadow: { enabled: isConnected, color: '#7c4dff', size: 10 },
            smooth: { type: 'curvedCW', roundness: 0.4 }
          }
        }))
      } else {
        if (!driftState.current.selectedNode && !driftState.current.isPaused) return

        // Reset view and RESTART motion with force
        driftState.current.selectedNode = null
        driftState.current.isPaused = false

        // Zoom Out (Fit)
        networkRef.current.fit({
          animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
        })

        nodes.update(nodes.getIds().map(id => ({ id, opacity: 1, shadow: { enabled: false } })))
        edges.update(edges.getIds().map(id => ({
          id,
          color: { color: '#3f3f46', opacity: 1 },
          width: 1,
          shadow: { enabled: false },
          smooth: { type: 'curvedCW', roundness: 0.2 }
        })))

        // Force an immediate simulation kickstart
        if (networkRef.current) {
          networkRef.current.startSimulation()
        }
      }
    })

    // Hover logic to slow down motion
    networkRef.current.on('hoverNode', () => { driftState.current.isHovering = true })
    networkRef.current.on('blurNode', () => { driftState.current.isHovering = false })

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy()
        networkRef.current = null
      }
      cancelAnimationFrame(driftState.current.requestId)
    }
  }, [people, connections, logsData])

  const getAvatarUrl = (person) => {
    if (!person.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png'
    const isGif = person.avatar.startsWith('a_')
    return `https://cdn.discordapp.com/avatars/${person.id}/${person.avatar}.${isGif ? 'gif' : 'png'}?size=128`
  }

  const handleZoom = (factor) => {
    if (!networkRef.current) return
    const scale = networkRef.current.getScale()
    networkRef.current.moveTo({
      scale: scale * factor,
      animation: { duration: 300, easingFunction: 'easeInOutQuad' }
    })
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (!searchTerm || !networkRef.current || !nodesRef.current) return

    const target = people.find(p =>
      p.id.toLowerCase() === searchTerm.toLowerCase() ||
      p.username.toLowerCase() === searchTerm.toLowerCase() ||
      p.display_name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    if (target) {
      handleSelectNode(target.id)
      setSearchTerm('')
    }
  }

  const handleSelectNode = (selectedId) => {
    if (!networkRef.current || !nodesRef.current || !edgesRef.current) return

    networkRef.current.focus(selectedId, {
      scale: 1.2,
      animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
    })

    // Trigger highlight logic
    driftState.current.isPaused = true
    const connectedNodes = networkRef.current.getConnectedNodes(selectedId)
    const connectedEdges = networkRef.current.getConnectedEdges(selectedId)

    nodesRef.current.update(nodesRef.current.getIds().map(id => {
      const isActive = id === selectedId || connectedNodes.includes(id)
      return {
        id,
        opacity: isActive ? 1 : 0.1,
        shadow: { enabled: isActive, color: id === selectedId ? '#7c4dff' : 'rgba(124, 77, 255, 0.4)', size: id === selectedId ? 35 : 20 }
      }
    }))

    edgesRef.current.update(edgesRef.current.getIds().map(id => {
      const isConnected = connectedEdges.includes(id)
      return {
        id,
        color: isConnected ? { color: '#7c4dff', opacity: 1 } : { color: '#27272a', opacity: 0.05 },
        width: isConnected ? 2 : 1,
        shadow: { enabled: isConnected, color: '#7c4dff', size: 10 }
      }
    }))
  }

  const searchResults = React.useMemo(() => {
    if (!searchTerm) return []
    const term = searchTerm.toLowerCase()
    const results = []

    // Search People
    people.forEach(p => {
      if (p.display_name.toLowerCase().includes(term) || p.username.toLowerCase().includes(term) || p.id.toLowerCase() === term) {
        results.push({ type: 'person', id: p.id, label: p.display_name, sub: `@${p.username}`, img: getAvatarUrl(p) })
      }
    })

    // Search Locations
    const uniqueLocations = [...new Set(people.map(p => p.location).filter(Boolean))]
    uniqueLocations.forEach(loc => {
      if (loc.toLowerCase().includes(term)) {
        results.push({ type: 'loc', id: `loc-${loc}`, label: loc, sub: 'Konum Merkezi', icon: <Globe className="w-4 h-4" /> })
      }
    })

    // Search Shared Names
    const uniqueNames = [...new Set(people.map(p => p.real_name?.split(' ')[0]).filter(Boolean))]
    uniqueNames.forEach(name => {
      if (name.toLowerCase().includes(term)) {
        results.push({ type: 'name', id: `fname-${name}`, label: name, sub: 'İsim Merkezi', icon: <Target className="w-4 h-4" /> })
      }
    })

    // Search Logs
    logsData.forEach(log => {
      if (log.type === 'note' && log.content.toLowerCase().includes(term)) {
        const preview = log.content.substring(0, 30) + (log.content.length > 30 ? '...' : '')
        results.push({ type: 'log', id: `log-${log.id}`, label: preview, sub: 'İstihbarat Notu', icon: <MessageSquare className="w-4 h-4" /> })
      }
    })

    return results.slice(0, 50)
  }, [searchTerm, people, logsData])

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] space-y-6">
      <div className="flex justify-between items-end flex-shrink-0">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">İlişki Ağı</h1>
          <p className="text-muted-foreground mt-2">Hedefler arasındaki tüm sosyal ve operational bağlantıları görselleştirin.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => networkRef.current?.stabilize()}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-xl text-xs font-bold text-primary uppercase tracking-widest hover:bg-primary/20 transition-all"
          >
            <Zap className="w-4 h-4" /> Fizik Motorunu Yenile
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-secondary/5 rounded-[40px] border border-border overflow-hidden shadow-inner group">
        <style>
          {`
            @keyframes subtleFloat {
              0% { transform: translate(0, 0) scale(1); }
              33% { transform: translate(4px, 4px) scale(1.002); }
              66% { transform: translate(-4px, 2px) scale(0.998); }
              100% { transform: translate(0, 0) scale(1); }
            }
            .floating-graph {
              animation: subtleFloat 20s ease-in-out infinite;
            }
          `}
        </style>
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#7c4dff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div ref={containerRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing floating-graph" />

        {/* Integrated Search HUD */}
        <div className="absolute top-8 left-8 z-50">
          <div className="relative group">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Hedef veya Bağlantı Ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 bg-background/80 backdrop-blur-xl border border-border rounded-2xl px-4 py-3 pl-12 text-sm outline-none focus:border-primary focus:w-96 transition-all shadow-2xl"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
            </form>

            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 right-0 mt-3 bg-background/90 backdrop-blur-2xl border border-border rounded-3xl shadow-2xl overflow-y-auto max-h-[60vh] custom-scrollbar"
                >
                  {searchResults.map(res => (
                    <button
                      key={res.id}
                      onClick={() => {
                        handleSelectNode(res.id)
                        setSearchTerm('')
                      }}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-primary/5 transition-colors border-b border-border/50 last:border-0 group/item"
                    >
                      {res.img ? (
                        <img src={res.img} className="w-10 h-10 rounded-full border-2 border-border group-hover/item:border-primary/50 transition-colors" alt="" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground group-hover/item:text-primary transition-colors">
                          {res.icon}
                        </div>
                      )}
                      <div className="text-left">
                        <div className="text-sm font-bold text-foreground">{res.label}</div>
                        <div className="text-[11px] text-muted-foreground">{res.sub}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* HUD Overlay */}
        <div className="absolute bottom-8 left-8 flex flex-col gap-2">
          <div className="px-4 py-2 bg-background/80 backdrop-blur-md border border-border rounded-xl flex items-center gap-3 shadow-2xl">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{people.length} Düğüm Aktif</span>
          </div>
        </div>

        <div className="absolute top-8 right-8 flex flex-col gap-2">
          <div className="p-2 bg-background/80 backdrop-blur-md border border-border rounded-xl shadow-2xl flex flex-col gap-1">
            <button
              onClick={() => handleZoom(1.2)}
              title="Yakınlaştır"
              className="p-2 hover:bg-secondary rounded-lg transition-colors font-bold text-sm text-muted-foreground"
            >
              +
            </button>
            <div className="h-px bg-border mx-1" />
            <button
              onClick={() => handleZoom(0.8)}
              title="Uzaklaştır"
              className="p-2 hover:bg-secondary rounded-lg transition-colors font-bold text-sm text-muted-foreground"
            >
              -
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
