import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Resetea el scroll al tope en cada cambio de ruta. React Router no lo hace por defecto,
// así que sin esto caías a la mitad de páginas largas (TimeSelect, MealType, etc.) cuando
// venías scrolleado de la pantalla anterior.
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    // El scroller ahora es #root (ver index.css), no la ventana.
    document.getElementById('root')?.scrollTo({ top: 0, left: 0 })
    window.scrollTo(0, 0) // fallback por si acaso
  }, [pathname])
  return null
}
