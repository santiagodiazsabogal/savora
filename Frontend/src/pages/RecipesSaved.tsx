import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Heart, Clock, ChefHat, MessageCircle, Trash2, Folder, FolderOpen,
  Plus, Pencil, X, Check, MoreVertical, UtensilsCrossed, CookingPot,
  Soup, Salad, ArrowUpDown,
} from 'lucide-react'
import Container from '../components/ui/Container'
import LoadingScreen from '../components/ui/LoadingScreen'
import {
  getUserRecipes, getUserFolders, createFolder,
  renameFolder, deleteFolder, deleteRecipe, moveRecipeToFolder,
} from '../services/api'

interface Recipe {
  id: number
  title: string
  description?: string | null
  difficulty?: string
  cookTime?: number
  isFavorite: boolean
  folderId: number | null
  conversationId: number | null
}

interface Folder {
  id: number
  name: string
  recipeCount: number
}

type SortBy = 'recent' | 'name' | 'time'

// Estilos de thumbnail (variados por receta para dar vida, ya que las recetas IA no
// tienen foto). Se elige de forma estable por el id de la receta.
const THUMBS = [
  { from: 'rgba(255,94,26,0.22)', to: 'rgba(255,139,84,0.06)', icon: ChefHat, color: 'var(--sv-primary)' },
  { from: 'rgba(232,137,12,0.22)', to: 'rgba(245,180,90,0.06)', icon: CookingPot, color: '#C2740A' },
  { from: 'rgba(16,185,129,0.20)', to: 'rgba(52,211,153,0.05)', icon: Salad, color: '#059669' },
  { from: 'rgba(219,68,55,0.18)', to: 'rgba(248,113,113,0.05)', icon: Soup, color: '#DC2626' },
  { from: 'rgba(37,99,235,0.18)', to: 'rgba(96,165,250,0.05)', icon: UtensilsCrossed, color: '#2563EB' },
]
const thumbFor = (id: number) => THUMBS[id % THUMBS.length]

export default function RecipesSaved() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [initialLoading, setInitialLoading] = useState(true)

  const [activeFolder, setActiveFolder] = useState<number | 'all' | 'none'>('all')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [sortOpen, setSortOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteRecipe, setConfirmDeleteRecipe] = useState<number | null>(null)
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<number | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [recipesData, foldersData] = await Promise.all([getUserRecipes(), getUserFolders()])
      setRecipes(recipesData.filter((r: Recipe) => r.isFavorite))
      setFolders(foldersData)
    } catch (err: any) {
      if (err.message === '401') { localStorage.removeItem('token'); navigate('/login') }
    } finally {
      setInitialLoading(false)
    }
  }

  const noFolderCount = recipes.filter(r => r.folderId === null).length

  const visibleRecipes = recipes
    .filter(r => {
      if (activeFolder === 'all') return true
      if (activeFolder === 'none') return r.folderId === null
      return r.folderId === activeFolder
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title)
      if (sortBy === 'time') return (a.cookTime ?? 999) - (b.cookTime ?? 999)
      return 0 // 'recent' → ya viene ordenado por createdAt desc del backend
    })

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    try {
      const folder = await createFolder(newFolderName.trim())
      setFolders(prev => [...prev, { ...folder, recipeCount: 0 }])
      setNewFolderName(''); setShowNewFolderInput(false)
    } catch (err: any) { alert(err.message) }
    finally { setCreatingFolder(false) }
  }

  async function handleRenameFolder(folderId: number) {
    if (!editFolderName.trim()) return
    try {
      await renameFolder(folderId, editFolderName.trim())
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: editFolderName.trim() } : f))
      setEditingFolderId(null)
    } catch (err: any) { alert(err.message) }
  }

  async function handleDeleteFolder(folderId: number) {
    try {
      await deleteFolder(folderId)
      setFolders(prev => prev.filter(f => f.id !== folderId))
      setRecipes(prev => prev.map(r => r.folderId === folderId ? { ...r, folderId: null } : r))
      if (activeFolder === folderId) setActiveFolder('all')
      setConfirmDeleteFolder(null)
    } catch (err: any) { alert(err.message) }
  }

  async function handleDeleteRecipe(recipeId: number) {
    setDeletingId(recipeId)
    try {
      await deleteRecipe(recipeId)
      const recipe = recipes.find(r => r.id === recipeId)
      setRecipes(prev => prev.filter(r => r.id !== recipeId))
      setFolders(prev => prev.map(f =>
        recipe?.folderId === f.id ? { ...f, recipeCount: Math.max(0, f.recipeCount - 1) } : f
      ))
      setConfirmDeleteRecipe(null)
    } catch (err: any) { alert(err.message) }
    finally { setDeletingId(null) }
  }

  async function handleMoveRecipe(recipeId: number, folderId: number | null) {
    try {
      await moveRecipeToFolder(recipeId, folderId)
      const prevRecipe = recipes.find(r => r.id === recipeId)
      setRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, folderId } : r))
      setFolders(prev => prev.map(f => {
        let count = f.recipeCount
        if (prevRecipe?.folderId === f.id) count = Math.max(0, count - 1)
        if (folderId === f.id) count++
        return { ...f, recipeCount: count }
      }))
    } catch (err: any) { alert(err.message) }
  }

  if (initialLoading) return <LoadingScreen />

  const SORTS: { key: SortBy; label: string }[] = [
    { key: 'recent', label: t('saved_recipes.sort_recent') },
    { key: 'name', label: t('saved_recipes.sort_name') },
    { key: 'time', label: t('saved_recipes.sort_time') },
  ]

  return (
    <Container backButton backTo="/dashboard">
      <div className="space-y-6 pb-10">

        {/* HEADER */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #F472A6, #F0824F)', boxShadow: '0 8px 20px rgba(240,114,166,0.32)' }}
            >
              <Heart className="w-6 h-6 text-white" fill="currentColor" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black leading-tight truncate">{t('saved_recipes.title')}</h1>
              <p className="sv-dim text-sm">{t('saved_recipes.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/recipe-start')}
            className="sv-btn sv-btn-primary px-4 py-2.5 text-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t('saved_recipes.new_recipe')}
          </button>
        </div>

        {recipes.length === 0 ? (
          <EmptyState onGenerate={() => navigate('/recipe-start')} t={t} />
        ) : (
          <>
            {/* FILTROS (fila con scroll horizontal) */}
            <div className="sv-scroll-x flex gap-2 pb-1 -mx-1 px-1">
              <FilterChip label={t('saved_recipes.all', { count: recipes.length })} active={activeFolder === 'all'} onClick={() => setActiveFolder('all')} />
              {folders.map(folder => (
                <FilterChip key={folder.id} icon={<Folder className="w-3.5 h-3.5" />} label={`${folder.name} (${folder.recipeCount})`} active={activeFolder === folder.id} onClick={() => setActiveFolder(folder.id)} />
              ))}
              {noFolderCount > 0 && (
                <FilterChip label={t('saved_recipes.no_folder', { count: noFolderCount })} active={activeFolder === 'none'} onClick={() => setActiveFolder('none')} />
              )}
            </div>

            {/* SECCIÓN CARPETAS */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">{t('saved_recipes.folders_title')}</h2>
                <button
                  onClick={() => setShowNewFolderInput(v => !v)}
                  className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full transition active:scale-95"
                  style={{ color: 'var(--sv-primary)', background: 'rgba(255,94,26,0.10)', border: '1px solid rgba(255,94,26,0.28)' }}
                >
                  <Plus className="w-4 h-4" /> {t('saved_recipes.new_folder')}
                </button>
              </div>

              {showNewFolderInput && (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                    placeholder={t('saved_recipes.folder_placeholder')}
                    className="sv-input flex-1 text-base"
                    style={{ paddingLeft: 16 }}
                  />
                  <button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()} className="sv-btn sv-btn-primary px-4 py-3">
                    <Check className="w-5 h-5" />
                  </button>
                  <button onClick={() => { setShowNewFolderInput(false); setNewFolderName('') }} className="sv-btn sv-btn-glass px-4 py-3">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}

              {folders.length === 0 && noFolderCount === 0 ? null : (
                <div className="grid grid-cols-2 gap-3">
                  {folders.map(folder => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      active={activeFolder === folder.id}
                      editing={editingFolderId === folder.id}
                      editName={editFolderName}
                      onEditName={setEditFolderName}
                      onSelect={() => setActiveFolder(f => f === folder.id ? 'all' : folder.id)}
                      onStartEdit={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name) }}
                      onSaveEdit={() => handleRenameFolder(folder.id)}
                      onCancelEdit={() => setEditingFolderId(null)}
                      onDelete={() => setConfirmDeleteFolder(folder.id)}
                    />
                  ))}
                  {noFolderCount > 0 && (
                    <NoFolderCard
                      count={noFolderCount}
                      active={activeFolder === 'none'}
                      label={t('saved_recipes.no_folder_short')}
                      onSelect={() => setActiveFolder(f => f === 'none' ? 'all' : 'none')}
                    />
                  )}
                </div>
              )}
            </section>

            {/* SECCIÓN RECETAS */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">{t('saved_recipes.saved_title')}</h2>
                <div className="relative">
                  <button
                    onClick={() => setSortOpen(v => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition active:scale-95"
                    style={{ background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    {SORTS.find(s => s.key === sortBy)?.label}
                  </button>
                  {sortOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                      <div className="sv-glass-solid absolute right-0 top-11 w-44 z-20 overflow-hidden rounded-2xl">
                        {SORTS.map(s => (
                          <button
                            key={s.key}
                            onClick={() => { setSortBy(s.key); setSortOpen(false) }}
                            className="sv-menu-item w-full flex items-center justify-between px-4 py-2.5 text-sm transition"
                          >
                            {s.label}
                            {sortBy === s.key && <Check className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {visibleRecipes.length === 0 ? (
                <div className="text-center py-14 sv-dim">
                  <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-base font-medium">{t('saved_recipes.empty_folder')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleRecipes.map(recipe => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      folders={folders}
                      onOpen={() => navigate(`/recipes/${recipe.id}`)}
                      onDelete={() => setConfirmDeleteRecipe(recipe.id)}
                      onMove={handleMoveRecipe}
                      onChat={recipe.conversationId ? () => navigate(`/chat/${recipe.conversationId}`) : undefined}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {confirmDeleteFolder !== null && (
          <ConfirmDialog message={t('saved_recipes.confirm_delete_folder')} onConfirm={() => handleDeleteFolder(confirmDeleteFolder)} onCancel={() => setConfirmDeleteFolder(null)} t={t} />
        )}
        {confirmDeleteRecipe !== null && (
          <ConfirmDialog message={t('saved_recipes.confirm_delete_recipe')} onConfirm={() => handleDeleteRecipe(confirmDeleteRecipe)} onCancel={() => setConfirmDeleteRecipe(null)} loading={deletingId === confirmDeleteRecipe} destructive t={t} />
        )}
      </div>
    </Container>
  )
}

/* ── Tarjeta de carpeta ────────────────────────────────────────── */
function FolderCard({ folder, active, editing, editName, onEditName, onSelect, onStartEdit, onSaveEdit, onCancelEdit, onDelete }: {
  folder: Folder; active: boolean; editing: boolean; editName: string
  onEditName: (v: string) => void; onSelect: () => void; onStartEdit: () => void
  onSaveEdit: () => void; onCancelEdit: () => void; onDelete: () => void
}) {
  if (editing) {
    return (
      <div className="sv-glass-solid rounded-2xl p-3 flex items-center gap-2" style={{ border: '1px solid var(--sv-primary)' }}>
        <input autoFocus value={editName} onChange={e => onEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSaveEdit()}
          className="sv-input flex-1 text-sm min-w-0" style={{ paddingLeft: 12, paddingTop: 6, paddingBottom: 6 }} />
        <button onClick={onSaveEdit} style={{ color: 'var(--sv-primary)' }}><Check className="w-5 h-5" /></button>
        <button onClick={onCancelEdit} className="sv-dim"><X className="w-5 h-5" /></button>
      </div>
    )
  }
  return (
    <div
      onClick={onSelect}
      className="sv-glass-solid rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer transition active:scale-[0.98] group"
      style={{ border: active ? '1px solid var(--sv-primary)' : '1px solid var(--sv-border-light)', boxShadow: active ? '0 4px 16px var(--sv-primary-glow)' : undefined }}
    >
      <Folder className="w-7 h-7 shrink-0" style={{ color: '#F0A93B', fill: '#F0A93B33' }} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm leading-tight line-clamp-2">{folder.name}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {/* Acciones (aparecen en la carpeta activa) */}
        {active && (
          <>
            <button onClick={e => { e.stopPropagation(); onStartEdit() }} className="p-1 sv-muted hover:opacity-70"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-1 sv-muted hover:opacity-70"><Trash2 className="w-3.5 h-3.5" /></button>
          </>
        )}
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'rgba(255,94,26,0.14)', color: 'var(--sv-primary)' }}>
          {folder.recipeCount}
        </span>
      </div>
    </div>
  )
}

function NoFolderCard({ count, active, label, onSelect }: { count: number; active: boolean; label: string; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="sv-glass-solid rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer transition active:scale-[0.98]"
      style={{ border: active ? '1px solid var(--sv-primary)' : '1px solid var(--sv-border-light)', boxShadow: active ? '0 4px 16px var(--sv-primary-glow)' : undefined }}
    >
      <FolderOpen className="w-7 h-7 shrink-0 sv-dim" />
      <p className="flex-1 min-w-0 font-bold text-sm leading-tight line-clamp-2 sv-muted">{label}</p>
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--sv-bg-input)', color: 'var(--sv-text-muted)' }}>
        {count}
      </span>
    </div>
  )
}

/* ── Tarjeta de receta ─────────────────────────────────────────── */
function RecipeCard({ recipe, folders, onOpen, onDelete, onMove, onChat, t }: {
  recipe: Recipe; folders: Folder[]; onOpen: () => void; onDelete: () => void
  onMove: (id: number, folderId: number | null) => void; onChat?: () => void; t: any
}) {
  const [menu, setMenu] = useState<null | 'main' | 'folders'>(null)
  const thumb = thumbFor(recipe.id)
  const ThumbIcon = thumb.icon
  const folderName = folders.find(f => f.id === recipe.folderId)?.name

  const closeMenu = () => setMenu(null)

  return (
    <article
      onClick={onOpen}
      className="sv-glass-solid rounded-2xl overflow-hidden flex cursor-pointer transition active:scale-[0.99] relative"
      style={{ border: '1px solid var(--sv-border-light)' }}
    >
      {/* Thumbnail (placeholder con gradiente + icono) */}
      <div
        className="w-24 sm:w-28 shrink-0 flex items-center justify-center self-stretch"
        style={{ background: `linear-gradient(135deg, ${thumb.from}, ${thumb.to})` }}
      >
        <ThumbIcon className="w-9 h-9" style={{ color: thumb.color, opacity: 0.85 }} strokeWidth={1.8} />
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-black text-base leading-snug line-clamp-2">{recipe.title}</h3>
          <button
            onClick={e => { e.stopPropagation(); setMenu(m => m ? null : 'main') }}
            className="shrink-0 -mr-1 -mt-0.5 p-1.5 rounded-lg sv-dim transition active:scale-90"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 mt-1.5">
          {recipe.cookTime != null && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--sv-primary)' }}>
              <Clock className="w-3.5 h-3.5" /> {recipe.cookTime} min
            </span>
          )}
          {recipe.difficulty && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--sv-primary)' }}>
              <ChefHat className="w-3.5 h-3.5" /> {t(`recipes.difficulty.${recipe.difficulty}`, recipe.difficulty)}
            </span>
          )}
        </div>

        {recipe.description && (
          <p className="sv-dim text-xs leading-snug mt-1.5 line-clamp-2">{recipe.description}</p>
        )}

        {folderName && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium" style={{ background: 'var(--sv-bg-input)', color: 'var(--sv-text-muted)' }}>
            <Folder className="w-3 h-3" style={{ color: '#F0A93B' }} /> {folderName}
          </div>
        )}
      </div>

      {/* Menú de acciones */}
      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); closeMenu() }} />
          <div
            className="sv-glass-solid absolute right-3 top-11 w-52 z-40 overflow-hidden rounded-2xl"
            onClick={e => e.stopPropagation()}
          >
            {menu === 'main' ? (
              <>
                {onChat && (
                  <button onClick={() => { onChat(); closeMenu() }} className="sv-menu-item w-full flex items-center gap-2.5 px-4 py-3 text-sm transition">
                    <MessageCircle className="w-4 h-4 sv-muted" /> {t('saved_recipes.continue_chat')}
                  </button>
                )}
                <button onClick={() => setMenu('folders')} className="sv-menu-item w-full flex items-center gap-2.5 px-4 py-3 text-sm transition">
                  <FolderOpen className="w-4 h-4 sv-muted" /> {t('saved_recipes.move_action')}
                </button>
                <button onClick={() => { onDelete(); closeMenu() }} className="sv-menu-item w-full flex items-center gap-2.5 px-4 py-3 text-sm transition" style={{ color: '#EF4444' }}>
                  <Trash2 className="w-4 h-4" /> {t('saved_recipes.delete_action')}
                </button>
              </>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <button onClick={() => { onMove(recipe.id, null); closeMenu() }} className="sv-menu-item w-full flex items-center justify-between px-4 py-3 text-sm transition">
                  {t('saved_recipes.no_folder_option')}
                  {recipe.folderId === null && <Check className="w-4 h-4" style={{ color: 'var(--sv-primary)' }} />}
                </button>
                {folders.map(folder => (
                  <button key={folder.id} onClick={() => { onMove(recipe.id, folder.id); closeMenu() }} className="sv-menu-item w-full flex items-center justify-between px-4 py-3 text-sm transition">
                    <span className="flex items-center gap-2 min-w-0"><Folder className="w-3.5 h-3.5 shrink-0" style={{ color: '#F0A93B' }} /> <span className="truncate">{folder.name}</span></span>
                    {recipe.folderId === folder.id && <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--sv-primary)' }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </article>
  )
}

function FilterChip({ label, icon, active, onClick }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition active:scale-95 shrink-0 whitespace-nowrap"
      style={active
        ? { background: 'var(--sv-primary)', color: '#fff', boxShadow: '0 4px 14px var(--sv-primary-glow)' }
        : { background: 'var(--sv-bg-surface)', border: '1px solid var(--sv-border-light)', color: 'var(--sv-text-muted)' }}>
      {icon}{label}
    </button>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel, loading = false, destructive = false, t }: {
  message: string; onConfirm: () => void; onCancel: () => void
  loading?: boolean; destructive?: boolean; t: any
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="sv-glass w-full max-w-sm p-6 space-y-5">
        <p className="text-base font-medium text-center">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="sv-btn sv-btn-glass flex-1 py-3">{t('common.cancel')}</button>
          <button onClick={onConfirm} disabled={loading} className={`sv-btn flex-1 py-3 ${destructive ? 'sv-btn-danger' : 'sv-btn-primary'}`}>
            {loading ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onGenerate, t }: { onGenerate: () => void; t: any }) {
  return (
    <div className="text-center py-24 sv-dim">
      <Heart className="w-14 h-14 mx-auto mb-4 opacity-20" />
      <p className="text-xl font-semibold sv-muted">{t('saved_recipes.empty_title')}</p>
      <p className="text-base mt-1">{t('saved_recipes.empty_subtitle')}</p>
      <button onClick={onGenerate} className="sv-btn sv-btn-primary mt-6 px-8 py-4 text-base">
        {t('saved_recipes.generate_button')}
      </button>
    </div>
  )
}
