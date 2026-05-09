import React from 'react';

// Matches http://, https://, or www., or just plain domain names like discord.com/channels/...
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s]+|(?:discord\.com\/channels\/)[^\s]+)/g;

export default function Linkify({ children, className = '' }) {
  if (!children || typeof children !== 'string') {
    return <span className={className}>{children}</span>;
  }

  const parts = children.split(URL_REGEX);

  return (
    <span className={className} style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
      {parts.map((part, i) => {
        if (part.match(URL_REGEX)) {
          let href = part;
          if (!href.startsWith('http')) {
            href = 'https://' + href;
          }
          
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 hover:underline font-bold transition-all relative z-50 inline"
              style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </span>
  );
}
