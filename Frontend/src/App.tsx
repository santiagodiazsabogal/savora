import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

// Eager: puntos de entrada (Login logged-out, Dashboard logged-in) + wrappers de layout.
// Quedan en el chunk principal → primer paint instantáneo sin descargar un chunk extra.
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import PlanGate from './components/PlanGate'
import BottomTabBar from './components/BottomTabBar'
import ScrollFade from './components/ScrollFade'
import ScrollToTop from './components/ScrollToTop'
import AnimatedBackground from './components/ui/AnimatedBackground'
import SplashScreen from './components/ui/SplashScreen'

// Lazy: el resto de páginas → cada una en su propio chunk, descargado bajo demanda.
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const Waitlist = lazy(() => import('./pages/Waitlist'))
const SetupProfile = lazy(() => import('./pages/SetupProfile'))
const Recipes = lazy(() => import('./pages/Recipes'))
const Chat = lazy(() => import('./pages/Chat'))
const RecipesSaved = lazy(() => import('./pages/RecipesSaved'))
const RecipeStart = lazy(() => import('./pages/RecipeStart'))
const TimeSelect = lazy(() => import('./pages/TimeSelect'))
const MealTypeSelect = lazy(() => import('./pages/MealTypeSelect'))
const PantryCheck = lazy(() => import('./pages/PantryCheck'))
const RecipeSuggestions = lazy(() => import('./pages/RecipeSuggestions'))
const RecipeDetail = lazy(() => import('./pages/RecipeDetail'))
const CookingWizard = lazy(() => import('./pages/CookingWizard'))
const Profile = lazy(() => import('./pages/Profile'))
const Achievements = lazy(() => import('./pages/Achievements'))
const PublicProfile = lazy(() => import('./pages/PublicProfile'))
const Battle = lazy(() => import('./pages/Battle'))
const Market = lazy(() => import('./pages/Market'))
const Kitchen = lazy(() => import('./pages/Kitchen'))
const WeeklyPlanner = lazy(() => import('./pages/WeeklyPlanner'))
const CoursesCatalog = lazy(() => import('./pages/CoursesCatalog'))
const CookingRoadmap = lazy(() => import('./pages/CookingRoadmap'))
const CourseSyllabus = lazy(() => import('./pages/CourseSyllabus'))
const LessonSteps = lazy(() => import('./pages/LessonSteps'))
const CourseResult = lazy(() => import('./pages/CourseResult'))
const Progress = lazy(() => import('./pages/Progress'))
const Admin = lazy(() => import('./pages/Admin'))
const Social = lazy(() => import('./pages/Social'))
const Clans = lazy(() => import('./pages/Clans'))
const CreateClan = lazy(() => import('./pages/CreateClan'))
const ClanDetail = lazy(() => import('./pages/ClanDetail'))
const ClanChat = lazy(() => import('./pages/ClanChat'))

function RootRedirect() {
  const token = localStorage.getItem('token')
  return token ? <Navigate to="/dashboard" /> : <Navigate to="/login" />
}

// Fallback mientras se descarga el chunk de una ruta. Ligero (spinner sobre el fondo
// animado) para no flashear la pantalla de carga completa en transiciones de ms.
function RouteFallback() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--sv-primary)' }} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SplashScreen />
      <BrowserRouter basename={(import.meta as any).env?.BASE_URL ?? "/"}>
        <ScrollToTop />
        <AnimatedBackground />
        <div className="relative overflow-x-clip" style={{ zIndex: 1 }}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/waitlist" element={<Waitlist />} />

              <Route path="/dashboard" element={
                <ProtectedRoute><Dashboard /></ProtectedRoute>
              } />
              <Route path="/social" element={
                <ProtectedRoute><Social /></ProtectedRoute>
              } />
              <Route path="/setup-profile" element={
                <ProtectedRoute><SetupProfile /></ProtectedRoute>
              } />
              <Route path="/recipe-start" element={
                <ProtectedRoute><RecipeStart /></ProtectedRoute>
              } />
              <Route path="/time-select" element={
                <ProtectedRoute><TimeSelect /></ProtectedRoute>
              } />
              <Route path="/meal-type" element={
                <ProtectedRoute><MealTypeSelect /></ProtectedRoute>
              } />
              <Route path="/pantry-check" element={
                <ProtectedRoute><PantryCheck /></ProtectedRoute>
              } />
              <Route path="/recipe-suggestions" element={
                <ProtectedRoute><RecipeSuggestions /></ProtectedRoute>
              } />
              <Route path="/recipes" element={
                <ProtectedRoute><Recipes /></ProtectedRoute>
              } />
              <Route path="/recipes/:id" element={
                <ProtectedRoute><RecipeDetail /></ProtectedRoute>
              } />
              <Route path="/recipes/:id/cook" element={
                <ProtectedRoute><CookingWizard /></ProtectedRoute>
              } />
              <Route path="/battle" element={
                <ProtectedRoute><PlanGate require="paid"><Battle /></PlanGate></ProtectedRoute>
              } />
              <Route path="/market" element={
                <ProtectedRoute><Market /></ProtectedRoute>
              } />
              <Route path="/kitchen" element={
                <ProtectedRoute><Kitchen /></ProtectedRoute>
              } />
              <Route path="/planner" element={
                <ProtectedRoute><PlanGate require="paid"><WeeklyPlanner /></PlanGate></ProtectedRoute>
              } />
              {/* Cursos = roadmaps POR CATEGORÍA (todos los planes; el tope lo aplica el backend).
                  /courses = elegir categoría · /courses/:category = su roadmap · anidado = juego. */}
              <Route path="/courses" element={
                <ProtectedRoute><CoursesCatalog /></ProtectedRoute>
              } />
              <Route path="/courses/:category" element={
                <ProtectedRoute><CookingRoadmap /></ProtectedRoute>
              } />
              <Route path="/courses/:category/:idMeal" element={
                <ProtectedRoute><CourseSyllabus /></ProtectedRoute>
              } />
              <Route path="/courses/:category/:idMeal/lessons/:numero" element={
                <ProtectedRoute><LessonSteps /></ProtectedRoute>
              } />
              <Route path="/courses/:category/:idMeal/result" element={
                <ProtectedRoute><CourseResult /></ProtectedRoute>
              } />
              <Route path="/progress" element={
                <ProtectedRoute><Progress /></ProtectedRoute>
              } />
              <Route path="/clans" element={
                <ProtectedRoute><PlanGate require="paid"><Clans /></PlanGate></ProtectedRoute>
              } />
              <Route path="/clans/create" element={
                <ProtectedRoute><PlanGate require="paid"><CreateClan /></PlanGate></ProtectedRoute>
              } />
              <Route path="/clans/:id" element={
                <ProtectedRoute><PlanGate require="paid"><ClanDetail /></PlanGate></ProtectedRoute>
              } />
              <Route path="/clans/:id/chat" element={
                <ProtectedRoute><PlanGate require="paid"><ClanChat /></PlanGate></ProtectedRoute>
              } />
              <Route path="/recipes-saved" element={
                <ProtectedRoute><RecipesSaved /></ProtectedRoute>
              } />
              <Route path="/chat/:conversationId" element={
                <ProtectedRoute><Chat /></ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute><Profile /></ProtectedRoute>
              } />
              <Route path="/achievements" element={
                <ProtectedRoute><Achievements /></ProtectedRoute>
              } />
              <Route path="/u/:username" element={
                <ProtectedRoute><PublicProfile /></ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute><Admin /></ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </div>
        {/* Fuera del contenedor con transform → fixed relativo al viewport
            (siempre visible al hacer scroll). */}
        <ScrollFade />                {/* viñeta inferior en páginas con scroll */}
        <BottomTabBar />              {/* pastilla solo en Inicio/Social */}
      </BrowserRouter>
    </AuthProvider>
  )
}
