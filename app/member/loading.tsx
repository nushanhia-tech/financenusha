export default function Loading() {
  return <div className="loading-state" role="status" aria-label="Loading data"><div className="skeleton skeleton-title"/><div className="metric-grid">{Array.from({length:4},(_,i)=><div key={i} className="skeleton skeleton-metric"/>)}</div><div className="skeleton skeleton-panel"/></div>;
}
