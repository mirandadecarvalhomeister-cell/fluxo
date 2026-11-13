export function Icon({ name, className = '' }) {
  return (
    <svg className={`ic ${className}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export default function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="i-feed" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></symbol>
        <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></symbol>
        <symbol id="i-orbit" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.5" /><circle cx="12" cy="4" r="1.6" /><circle cx="19" cy="16" r="1.6" /><circle cx="5" cy="16" r="1.6" /><path d="M12 6v3.5M17.6 15l-3.2-1.7M6.4 15l3.2-1.7" /></symbol>
        <symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9.2C1.6 7.4 3.7 4 7 4c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.4 3.4 4 6.8-2 4.8-9 9.2-9 9.2z" /></symbol>
        <symbol id="i-comment" viewBox="0 0 24 24"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" /></symbol>
        <symbol id="i-share" viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></symbol>
        <symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 8" /></symbol>
        <symbol id="i-video" viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="3" /><path d="m16 10 5-3v10l-5-3z" /></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
        <symbol id="i-camera" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></symbol>
        <symbol id="i-send" viewBox="0 0 24 24"><path d="m21 3-9.5 18-2.2-7.8L2 11z" /><path d="m21 3-11.7 10.2" /></symbol>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></symbol>
        <symbol id="i-back" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" /></symbol>
        <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></symbol>
        <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></symbol>
        <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" /></symbol>
        <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 4 2.4 4 5.7" /></symbol>
        <symbol id="i-radio" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></symbol>
        <symbol id="i-dcheck" viewBox="0 0 24 24"><path d="m2 12.5 4.5 4.5L15 8M10 15.5l1.5 1.5L21 8" /></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" /></symbol>
        <symbol id="i-pause" viewBox="0 0 24 24"><rect x="7" y="5" width="3.5" height="14" rx="1.2" /><rect x="13.5" y="5" width="3.5" height="14" rx="1.2" /></symbol>
        <symbol id="i-bookmark" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z" /></symbol>
        <symbol id="i-hash" viewBox="0 0 24 24"><path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18" /></symbol>
        <symbol id="i-mega" viewBox="0 0 24 24"><path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></symbol>
        <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="i-eyeoff" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7c2 0 3.7.6 5.1 1.5M22 12s-3.6 7-10 7c-2 0-3.7-.6-5.1-1.5" /><path d="M4 4l16 16" /></symbol>
        <symbol id="i-file" viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 13h6M9 17h6" /></symbol>
        <symbol id="i-paperclip" viewBox="0 0 24 24"><path d="M20 11.5 12.5 19a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" /></symbol>
        <symbol id="i-mic" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" /></symbol>
        <symbol id="i-volume" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></symbol>
        <symbol id="i-smile" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></symbol>
        <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></symbol>
        <symbol id="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></symbol>
        <symbol id="i-screen" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></symbol>
        <symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></symbol>
        <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 13a4.5 4.5 0 0 0 6.4 0l2.4-2.4a4.5 4.5 0 1 0-6.4-6.4L11 5.6" /><path d="M14 11a4.5 4.5 0 0 0-6.4 0l-2.4 2.4a4.5 4.5 0 1 0 6.4 6.4L13 18.4" /></symbol>
        <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z" /></symbol>
        <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></symbol>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></symbol>
        <symbol id="i-broom" viewBox="0 0 24 24"><path d="m14 4 6 6-3 3-6-6z" /><path d="M11 7 4 14l-1 7 7-1 7-7" /><path d="m9 16 2 2" /></symbol>
        <symbol id="i-brush" viewBox="0 0 24 24"><path d="M20.7 6.3a2.4 2.4 0 0 0-3.4-3.4L9 11.2l3.8 3.8 7.9-8.7z" /><path d="M10 14 4.5 19.5l-1.4 1.4" /><path d="M9 11.2 12.8 15" /></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></symbol>
        <symbol id="i-volumeoff" viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10z" /><path d="m17 9 5 6M22 9l-5 6" /></symbol>
        <symbol id="i-expand" viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M9 4H4M4 4l6 6M15 20h5M20 20l-6-6" /></symbol>
        <symbol id="i-compress" viewBox="0 0 24 24"><path d="M9 4v5H4M15 20v-5h5M9 9H4M9 9 3 3M15 15h5M15 15l6 6" /></symbol>
        <symbol id="i-flip" viewBox="0 0 24 24"><path d="M4 8a8 8 0 0 1 13.6-3.6L20 7M20 16a8 8 0 0 1-13.6 3.6L4 17" /><path d="M20 3v4h-4M4 21v-4h4" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="i-flash" viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></symbol>
        <symbol id="i-flashoff" viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /><path d="M3 3l18 18" /></symbol>
        <symbol id="i-sticker" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 0-9 9c1.4 0 3.6-.5 5.5-2.5S21 13.4 21 12z" /><path d="M21 12h-5a4 4 0 0 1-4-4V3" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></symbol>
        <symbol id="i-forward" viewBox="0 0 24 24"><path d="M14 5l7 7-7 7" /><path d="M21 12H8a5 5 0 0 0-5 5v2" /></symbol>
        <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14" /></symbol>
        <symbol id="i-filter" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v7l-4 2v-9z" /></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.4 3.6 5.4 3.6 9S14.4 18.6 12 21c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3z" /></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="m12 3 2.1 5.4L20 10.5l-5.9 2.1L12 18l-2.1-5.4L4 10.5l5.9-2.1z" /><path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5L18 19l-1.5-.5L18 18z" /></symbol>
        <symbol id="i-game" viewBox="0 0 24 24"><path d="M7 8h10a5 5 0 0 1 4.8 6.4l-1 3.4a2.4 2.4 0 0 1-4.2.8L15 16H9l-1.6 2.6a2.4 2.4 0 0 1-4.2-.8l-1-3.4A5 5 0 0 1 7 8z" /><path d="M8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01" /></symbol>
        <symbol id="i-trophy" viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5H5a1 1 0 0 0-1 1v1a3 3 0 0 0 4 3M16 5h3a1 1 0 0 1 1 1v1a3 3 0 0 1-4 3" /><path d="M12 13v4M8 21h8M9.5 21c0-2 .8-3.5 2.5-4 1.7.5 2.5 2 2.5 4" /></symbol>
        <symbol id="i-sword" viewBox="0 0 24 24"><path d="M14.5 3.5 21 3l-.5 6.5-9 9-4-4z" /><path d="m3 21 5.5-5.5M7 17l-1.5-1.5M6 21h1M3 18v1" /></symbol>
        <symbol id="i-skull" viewBox="0 0 24 24"><path d="M12 3a8 8 0 0 0-5 14.2V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.8A8 8 0 0 0 12 3z" /><circle cx="9" cy="11" r="1.5" /><circle cx="15" cy="11" r="1.5" /><path d="M10 17h4M11 20v1M13 20v1" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
        <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" /></symbol>
      </defs>
    </svg>
  );
}
