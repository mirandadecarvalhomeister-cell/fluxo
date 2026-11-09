export default function Empty({ title, text, children }) {
  return (
    <div className="card empty">
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      {children}
    </div>
  );
}
