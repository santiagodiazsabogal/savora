import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import RecipeCard from '../components/recipes/RecipeCard'
import LoadingScreen from '../components/ui/LoadingScreen'
import { getRecipeById, getUserFolders } from '../services/api'

interface RecipeData {
  title: string
  description?: string | null
  ingredients: string[]
  tools: string[]
  steps: string[]
  stepTips?: (string | null)[]
  difficulty: string
  cookTime: number
  tip?: string | null
  nutrition?: { servings: number; calories: number; protein: number; carbs: number; fat: number } | null
}

interface Folder {
  id: number
  name: string
}

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [recipe, setRecipe] = useState<RecipeData | null>(null)
  const [recipeId, setRecipeId] = useState<number | null>(null)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [folderId, setFolderId] = useState<number | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let active = true

    async function load() {
      try {
        const [data, foldersData] = await Promise.all([
          getRecipeById(Number(id)),
          getUserFolders().catch(() => [] as Folder[]),
        ])
        if (!active) return
        setRecipe({
          title: data.title,
          description: data.description ?? null,
          ingredients: data.ingredients ?? [],
          tools: data.tools ?? [],
          steps: data.steps ?? [],
          stepTips: data.stepTips ?? [],
          difficulty: data.difficulty,
          cookTime: data.cookTime,
          tip: data.tip ?? null,
          nutrition: data.nutrition ?? null,
        })
        setRecipeId(data.id)
        setConversationId(data.conversationId ?? null)
        setIsFavorite(data.isFavorite ?? false)
        setFolderId(data.folderId ?? null)
        setFolders(foldersData)
      } catch (err) {
        if (!active) return
        if (err instanceof Error && err.message === '401') {
          localStorage.removeItem('token')
          navigate('/login')
          return
        }
        setError(t('recipes.error_load'))
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [id, navigate])

  if (loading) return <LoadingScreen />

  return (
    <div className="sv-screen sv-page flex flex-col">
      <div className="px-5 pt-14 pb-3">
        <button
          onClick={() => navigate('/dashboard')}
          className="w-10 h-10 flex items-center justify-center rounded-2xl transition active:scale-95"
          style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)' }}
        >
          <ArrowLeft className="w-5 h-5 sv-muted" />
        </button>
      </div>

      <div className="flex-1 px-5 pb-12">
        {error ? (
          <div className="rounded-2xl px-4 py-3 text-sm text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            {error}
          </div>
        ) : recipe ? (
          <RecipeCard
            recipe={recipe}
            conversationId={conversationId}
            recipeId={recipeId ?? undefined}
            isFavorite={isFavorite}
            folderId={folderId}
            folders={folders}
          />
        ) : null}
      </div>
    </div>
  )
}