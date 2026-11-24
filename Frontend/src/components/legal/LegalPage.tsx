import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

// Shared layout for the legal pages (Terms / Privacy). Public: these same routes
// (/terms, /privacy) double as the public URLs that App Store Connect requires.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="sv-orbs"><div className="sv-orb sv-orb-1" /><div className="sv-orb sv-orb-2" /><div className="sv-orb sv-orb-3" /></div>
      <div className="sv-content flex flex-col flex-1 pb-16">
        <div className="px-4 pt-12 pb-2">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
            style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
          >
            <ArrowLeft className="w-5 h-5 sv-muted" />
          </button>
        </div>
        <div className="px-6 pt-2 pb-4">
          <h1 className="text-3xl font-black leading-tight">{title}</h1>
          <p className="sv-dim text-xs mt-1">Last updated: {updated}</p>
        </div>
        <div className="px-6 space-y-5 text-sm leading-relaxed sv-muted">
          {children}
        </div>
      </div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-base font-bold" style={{ color: 'var(--sv-text-main)' }}>{title}</h2>
      {children}
    </section>
  )
}
