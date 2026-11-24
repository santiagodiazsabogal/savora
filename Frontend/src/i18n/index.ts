import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './en.json'

// App de un solo idioma: INGLÉS (decisión de diseño + compatibilidad). El idioma queda
// fijado a 'en'; no usamos LanguageDetector ni cargamos otros idiomas → todo `t()` sale en
// inglés y, como `i18n.language` siempre es 'en', los endpoints de IA reciben language='en'.
// Para reactivar el bilingüe en el futuro: volver a añadir el detector + el recurso `es`.
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en'],
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
