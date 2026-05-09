import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'ONAYLA', cancelText = 'İPTAL', type = 'danger' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-md bg-card border border-border rounded-[32px] p-8 shadow-2xl overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] -rotate-12 translate-x-4 -translate-y-4">
          <AlertTriangle className="w-32 h-32" />
        </div>

        <div className="relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-6">
            <AlertTriangle className="w-6 h-6" />
          </div>
          
          <h2 className="text-xl font-black uppercase tracking-widest mb-2">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">{message}</p>

          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 px-6 py-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-xs font-black uppercase tracking-widest transition-all"
            >
              {cancelText}
            </button>
            <button 
              onClick={onConfirm}
              className={`flex-1 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${
                type === 'danger' 
                  ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-600' 
                  : 'bg-primary text-white shadow-primary/20 hover:bg-primary/60'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ConfirmDialog;
