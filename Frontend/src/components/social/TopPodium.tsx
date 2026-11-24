import { useNavigate } from 'react-router-dom'
import { Heart, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SocialPost } from '../../services/api'

const MEDALS = ['🥇', '🥈', '🥉']

function TopTile({ post, rank }: { post: SocialPost; rank: number }) {
  const navigate = useNavigate()
  const clickable = post.type === 'RECIPE' && !!post.recipeId
  return (
    <button
      onClick={() => { if (clickable) navigate(`/recipes/${post.recipeId}`) }}
      className={`relative shrink-0 w-28 rounded-2xl overflow-hidden sv-glass text-left ${clickable ? 'sv-glass-hover' : 'cursor-default'}`}
    >
      <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
        <img src={post.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
      <span className="absolute top-1.5 left-1.5 text-lg drop-shadow">{MEDALS[rank] || ''}</span>
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1" style={{ color: '#F43F5E' }}>
          <Heart className="w-3 h-3" fill="#F43F5E" />
          <span className="text-xs font-bold tabular-nums">{post.likeCount}</span>
        </div>
        {post.type === 'RECIPE' && post.recipeTitle && (
          <p className="text-[11px] font-semibold leading-tight mt-0.5 line-clamp-2">{post.recipeTitle}</p>
        )}
      </div>
    </button>
  )
}

interface Props {
  photos: SocialPost[]
  recipes: SocialPost[]
}

// Top 3 del día: fotos más likeadas y recetas más likeadas.
export default function TopPodium({ photos, recipes }: Props) {
  const { t } = useTranslation()
  if (photos.length === 0 && recipes.length === 0) return null

  return (
    <div className="space-y-4">
      {photos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Trophy className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            <h2 className="text-sm font-bold">{t('social.top_photos')}</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {photos.map((p, i) => <TopTile key={p.id} post={p} rank={i} />)}
          </div>
        </div>
      )}

      {recipes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Trophy className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />
            <h2 className="text-sm font-bold">{t('social.top_recipes')}</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {recipes.map((p, i) => <TopTile key={p.id} post={p} rank={i} />)}
          </div>
        </div>
      )}
    </div>
  )
}
