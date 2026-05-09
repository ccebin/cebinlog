import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const Notification = ({ message, type = 'info', onClose, duration = 5000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-500" />
  };

  const bgColors = {
    success: 'bg-green-500/10 border-green-500/20',
    error: 'bg-red-500/10 border-red-500/20',
    info: 'bg-blue-500/10 border-blue-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className={`fixed bottom-10 right-10 z-[10000] flex items-center gap-3 px-5 py-3.5 rounded-[20px] border border-white/10 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${bgColors[type]}`}
    >
      <div className="shrink-0 p-2 bg-white/5 rounded-xl">{icons[type]}</div>
      <div className="flex-1 pr-4">
        <p className="text-[13px] font-bold tracking-tight text-white leading-tight">{message}</p>
      </div>
      <button 
        onClick={onClose}
        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors group"
      >
        <X className="w-4 h-4 text-white/30 group-hover:text-white" />
      </button>
    </motion.div>
  );
};

export default Notification;
