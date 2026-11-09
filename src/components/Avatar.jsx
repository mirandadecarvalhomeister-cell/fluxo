import { useState } from 'react';
import { pal } from '../lib/art';
import { isLive } from '../lib/selectors';
import { initials } from '../lib/utils';

export function Avatar({ user, size = 40 }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const [a, b] = pal(user?.id || 'fluxo');
  const showImage = user?.avatar && failedSrc !== user.avatar;
  return (
    <span className="av" style={{ '--s': `${size}px`, '--a': a, '--b': b }}>
      {showImage ? (
        <img
          src={user.avatar}
          alt=""
          loading="lazy"
          onError={() => setFailedSrc(user.avatar)}
        />
      ) : (
        initials(user?.name || '?')
      )}
    </span>
  );
}

export function LiveAvatar({ user, size = 44, data }) {
  if (isLive(data, user?.id)) {
    return (
      <span className="ring" title="Ao vivo agora">
        <Avatar user={user} size={size - 8} />
        <span className="lv">AO VIVO</span>
      </span>
    );
  }
  return <Avatar user={user} size={size} />;
}
