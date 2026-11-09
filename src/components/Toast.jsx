import { useApp } from '../store/AppContext';

export default function Toast() {
  const { toast } = useApp();
  return (
    <div id="toast" className={toast ? 'show' : ''} role="status" aria-live="polite">
      {toast}
    </div>
  );
}
