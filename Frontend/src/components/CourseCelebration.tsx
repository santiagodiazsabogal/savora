import { Trophy } from 'lucide-react'
import { BadgeIcon } from '../utils/badgeIcon'

export interface CourseResult {
  xpGanado: number
  nuevoNivel?: number
  subioDeNivel?: boolean
  especializacion?: string | null
  nuevasInsignias?: string[]
  alreadyCompleted?: boolean
}

export default function CourseCelebration({ result, onClose, t }: { result: CourseResult; onClose: () => void; t: any }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(7,5,10,0.85)', backdropFilter: 'blur(8px)', animation: 'svPageFadeIn 0.4s ease-out' }}>
      <div className="sv-glass p-7 w-full text-center" style={{ maxWidth: 360, animation: 'svSlideUpFade 0.5s var(--sv-ease-spring) both' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(245,158,11,0.18)' }}>
          <Trophy className="w-10 h-10" style={{ color: 'var(--sv-warning)' }} />
        </div>
        <h2 className="text-2xl font-black">{t('coursesAi.celebration.course_title')}</h2>
        <p className="text-3xl font-black mt-2 sv-text-gradient-primary">{t('coursesAi.celebration.xp_earned', { xp: result.xpGanado })}</p>

        {result.subioDeNivel && result.nuevoNivel != null && (
          <div className="mt-4 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,94,26,0.12)', border: '1px solid rgba(255,94,26,0.3)' }}>
            <p className="font-bold" style={{ color: 'var(--sv-primary)' }}>{t('coursesAi.celebration.level_up', { level: result.nuevoNivel })}</p>
            {result.especializacion && (
              <p className="text-xs sv-muted mt-0.5">{t('coursesAi.celebration.specialization', { area: result.especializacion })}</p>
            )}
          </div>
        )}

        {result.nuevasInsignias && result.nuevasInsignias.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold sv-dim uppercase tracking-wide mb-2">{t('coursesAi.celebration.new_badges')}</p>
            <div className="flex justify-center gap-3 flex-wrap">
              {result.nuevasInsignias.map((id) => (
                <span key={id} className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)' }}>
                  <BadgeIcon id={id} className="w-6 h-6" style={{ color: 'var(--sv-warning)' }} />
                </span>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} className="sv-btn sv-btn-primary w-full py-3 mt-6">{t('coursesAi.celebration.continue')}</button>
      </div>
    </div>
  )
}
