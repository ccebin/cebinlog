import React from 'react';
import Linkify from './Linkify';
import { cn } from '../lib/utils';
import { User } from 'lucide-react';

const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

function discordAvatarUrl(userId, avatarHash, size = 32) {
  if (!userId || !avatarHash) return DEFAULT_AVATAR;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}

/**
 * Matches: 'Görünen İsim' (discordSnowflake), 'snowflake' kişisini, 'username' kullanıcısını, @mention
 */
const TOKEN =
  /('([^']+)'\s*\((\d{17,20})\))|('(\d{17,20})'\s+kişisini)|('([^']+)'\s+kullanıcısını)|(@([a-zA-Z0-9_.]+))/g;

function MentionPerson({ label, userId, avatarHash, onOpen }) {
  const src = discordAvatarUrl(userId, avatarHash);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(userId);
      }}
      className={cn(
        'inline-flex items-center gap-1 align-middle max-w-[min(100%,220px)] mx-0.5 px-1.5 py-0.5 rounded-md',
        'bg-[#5865F2]/20 border border-[#5865F2]/35 text-[#c9cdfb] text-xs font-semibold',
        'hover:bg-[#5865F2]/30 hover:border-[#5865F2]/50 transition-colors cursor-pointer shadow-sm'
      )}
      title="Profile git"
    >
      <img src={src} alt="" className="w-4 h-4 rounded-full shrink-0 bg-black/20" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function MentionSysUser({ username }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md',
        'bg-amber-500/15 border border-amber-500/30 text-amber-200/95 text-xs font-semibold'
      )}
      title="Sistem kullanıcısı"
    >
      <User className="w-3.5 h-3.5 shrink-0 opacity-90" />
      <span>@{username}</span>
    </span>
  );
}

function MentionAt({ username, setView }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setView?.('people');
      }}
      className={cn(
        'inline-flex items-center align-middle mx-0.5 px-1.5 py-0.5 rounded-md',
        'bg-[#5865F2]/20 border border-[#5865F2]/35 text-[#c9cdfb] text-xs font-semibold',
        'hover:bg-[#5865F2]/30 transition-colors cursor-pointer'
      )}
      title="Kişiler sekmesine geç (@ ile ara)"
    >
      @{username}
    </button>
  );
}

export default function LogRichContent({ content, log, setSelectedId, setView }) {
  if (!content || typeof content !== 'string') return null;

  const openPerson = (discordId) => {
    if (!discordId || !setSelectedId) return;
    setSelectedId(discordId);
    setView?.('people');
  };

  const nodes = [];
  let last = 0;
  let key = 0;
  const targetId = log?.target_id;
  const targetAvatar = log?.target_avatar;

  for (const m of content.matchAll(TOKEN)) {
    if (m.index > last) {
      nodes.push(
        <Linkify key={`t-${key++}`}>{content.slice(last, m.index)}</Linkify>
      );
    }

    if (m[2] !== undefined && m[3]) {
      const label = m[2];
      const id = m[3];
      const hash = targetId === id ? targetAvatar : null;
      nodes.push(
        <MentionPerson
          key={`p-${key++}`}
          label={label}
          userId={id}
          avatarHash={hash}
          onOpen={openPerson}
        />
      );
    } else if (m[5]) {
      const id = m[5];
      const hash = targetId === id ? targetAvatar : null;
      const short = id.length > 8 ? `…${id.slice(-6)}` : id;
      nodes.push(
        <MentionPerson
          key={`pi-${key++}`}
          label={short}
          userId={id}
          avatarHash={hash}
          onOpen={openPerson}
        />
      );
    } else if (m[7]) {
      nodes.push(<MentionSysUser key={`s-${key++}`} username={m[7]} />);
    } else if (m[9]) {
      nodes.push(<MentionAt key={`a-${key++}`} username={m[9]} setView={setView} />);
    }

    last = m.index + m[0].length;
  }

  if (last < content.length) {
    nodes.push(<Linkify key={`t-${key++}`}>{content.slice(last)}</Linkify>);
  }

  return <span className="inline leading-relaxed">{nodes}</span>;
}
