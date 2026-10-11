import { Link } from 'react-router-dom';

// One title block for every screen: optional back link, serif title,
// a plain-language subtitle that says what the page is for, and actions.
export default function PageHeader({ title, subtitle, back, actions, children }) {
  return (
    <header className="page-header">
      <div style={{ minWidth: 0 }}>
        {back && (
          <Link to={back.to} className="back-link">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
