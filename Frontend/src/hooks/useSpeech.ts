import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Voz para el modo cocina paso a paso.
 *
 * DOBLE PROVEEDOR, misma API pública (las páginas NO cambian):
 *   - WEB (dev / navegador): Web Speech API (speechSynthesis + SpeechRecognition).
 *   - NATIVO (Capacitor / iOS WKWebView): plugins de la comunidad —
 *       @capacitor-community/text-to-speech    → AVSpeechSynthesizer (suena aun en silencio)
 *       @capacitor-community/speech-recognition → SFSpeechRecognizer (comandos de voz)
 *
 * ⚠️ NO importamos los paquetes de Capacitor (todavía no están instalados). Se acceden por
 * el global `window.Capacitor.Plugins.*` que el WebView nativo inyecta → este archivo compila
 * y funciona en web HOY, y al añadir Capacitor + los plugins se activa la ruta nativa SIN tocar
 * las páginas. Cuando se envuelva con Capacitor:
 *   1) npm i @capacitor-community/text-to-speech @capacitor-community/speech-recognition
 *   2) npx cap sync
 *   3) Info.plist: NSMicrophoneUsageDescription + NSSpeechRecognitionUsageDescription
 *   4) Verificar la ruta nativa en dispositivo (marcada con "NATIVO" abajo).
 *
 * Estrategia (web): el micrófono queda SIEMPRE encendido (sin pausas → sin parpadeo). El eco
 * (que el micro capte la propia voz de la app) se filtra en el componente: solo acepta frases
 * cortas como comando; los pasos leídos son frases largas.
 */

// ── Detección de Capacitor sin importar el paquete (se lee del global del WebView nativo) ──
function cap(): any {
  return typeof window !== 'undefined' ? (window as any).Capacitor : undefined
}
function isNativePlatform(): boolean {
  try { return !!cap()?.isNativePlatform?.() } catch { return false }
}
function nativePlugin(name: string): any {
  try { return cap()?.Plugins?.[name] ?? null } catch { return null }
}

export function useSpeech(lang: 'es' | 'en' = 'es') {
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceReady, setVoiceReady] = useState(false)
  const [lastHeard, setLastHeard] = useState('')
  const [micError, setMicError] = useState(false)
  const [recStatus, setRecStatus] = useState('')   // diagnóstico en vivo

  const langPrefix = lang === 'en' ? 'en' : 'es'
  const srLang = lang === 'en' ? 'en-US' : 'es-ES'

  // ── Proveedores nativos (solo en iOS/Capacitor con los plugins instalados) ──
  const native = isNativePlatform()
  const nativeTTS = native ? nativePlugin('TextToSpeech') : null
  const nativeSTT = native ? nativePlugin('SpeechRecognition') : null

  // ── Web APIs (fallback / dev) ──
  const webSynthSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const SR = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null
  const webRecSupported = !!SR

  // Capacidad efectiva = nativo O web.
  const synthSupported = !!nativeTTS || webSynthSupported
  const recognitionSupported = !!nativeSTT || webRecSupported

  const recognitionRef = useRef<any>(null)
  const wantListenRef = useRef(false)
  const onCommandRef = useRef<((cmd: string) => void) | null>(null)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nativeSTTListenerRef = useRef<any>(null)

  // Nativo: no depende de las voces del navegador → listo de una.
  useEffect(() => { if (nativeTTS) setVoiceReady(true) }, [nativeTTS])

  // ── (WEB) Elige la MEJOR voz disponible en el idioma activo (si no, suena robótico) ──
  const pickVoice = useCallback(() => {
    if (!webSynthSupported) return
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return
    const inLang = voices.filter((v) => v.lang?.toLowerCase().startsWith(langPrefix))
    const score = (v: SpeechSynthesisVoice) => {
      const name = v.name.toLowerCase()
      const vl = v.lang?.toLowerCase() ?? ''
      let s = 0
      if (name.includes('google')) s += 100
      if (name.includes('natural') || name.includes('neural')) s += 90
      if (langPrefix === 'es') {
        if (/sabina|helena|laura|paulina|dalia|elvira|jorge|pablo/.test(name)) s += 40
        if (vl.startsWith('es-mx')) s += 8
        else if (vl.startsWith('es-us') || vl.startsWith('es-419')) s += 7
        else if (vl.startsWith('es-es')) s += 6
        else if (vl.startsWith('es')) s += 5
      } else {
        if (/aria|jenny|guy|zira|david|samantha|libby|sonia/.test(name)) s += 40
        if (vl.startsWith('en-us')) s += 8
        else if (vl.startsWith('en-gb')) s += 6
        else if (vl.startsWith('en')) s += 5
      }
      if (v.localService) s += 1
      return s
    }
    const best = (inLang.length ? inLang : voices).slice().sort((a, b) => score(b) - score(a))[0] ?? null
    voiceRef.current = best
    setVoiceReady(!!best)
  }, [webSynthSupported, langPrefix])

  useEffect(() => {
    if (!webSynthSupported) return
    pickVoice()
    window.speechSynthesis.onvoiceschanged = pickVoice
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [webSynthSupported, pickVoice])

  // ── (WEB) Reconocimiento SIEMPRE activo (auto-reinicio si Chrome lo corta) ──
  const startRec = useCallback(() => {
    if (!webRecSupported || !wantListenRef.current) return
    if (recognitionRef.current) return

    const rec = new SR()
    rec.lang = srLang
    rec.continuous = true
    rec.interimResults = false   // solo finales: menos ruido/eco, más estable

    rec.onstart = () => { setListening(true); setRecStatus('on') }
    rec.onaudiostart = () => setRecStatus('audio')      // el micro está capturando audio
    rec.onsoundstart = () => setRecStatus('sound')      // detecta sonido
    rec.onspeechstart = () => setRecStatus('speech')    // detecta voz humana

    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (!r?.isFinal) continue
        const transcript = String(r[0]?.transcript ?? '').toLowerCase().trim()
        if (!transcript) continue
        setLastHeard(transcript)
        onCommandRef.current?.(transcript)
      }
    }

    rec.onerror = (e: any) => {
      setRecStatus('err:' + (e?.error ?? '?'))
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        wantListenRef.current = false
        setMicError(true)
        setListening(false)
      }
      // 'no-speech' / 'aborted' / 'network' → onend reinicia si seguimos activos.
    }

    rec.onend = () => {
      recognitionRef.current = null
      if (wantListenRef.current) {
        restartTimerRef.current = setTimeout(() => startRec(), 300)
      } else {
        setListening(false)
      }
    }

    recognitionRef.current = rec
    try { rec.start() } catch { /* ya corriendo */ }
  }, [webRecSupported, SR, srLang])

  const stopRec = useCallback(() => {
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop() } catch { /* noop */ }
      try { recognitionRef.current.abort?.() } catch { /* noop */ }
      recognitionRef.current = null
    }
    setListening(false)
  }, [])

  // ── (NATIVO) Reconocimiento vía @capacitor-community/speech-recognition ──
  // Verificar en dispositivo: en iOS `start()` con partialResults emite por listener; el
  // comportamiento continuo puede necesitar ajuste (reinicio/listeningState) según el plugin.
  const startNativeRec = useCallback(async () => {
    if (!nativeSTT || !wantListenRef.current) return
    try {
      await nativeSTT.requestPermissions?.()
      if (!nativeSTTListenerRef.current) {
        nativeSTTListenerRef.current = await nativeSTT.addListener('partialResults', (data: any) => {
          const transcript = String((data?.matches ?? [])[0] ?? '').toLowerCase().trim()
          if (!transcript) return
          setLastHeard(transcript)
          onCommandRef.current?.(transcript)
        })
      }
      setListening(true); setRecStatus('native:on')
      await nativeSTT.start({ language: srLang, partialResults: true, popup: false })
    } catch (e: any) {
      setRecStatus('native:err:' + (e?.message ?? '?'))
      wantListenRef.current = false
      setMicError(true)
      setListening(false)
    }
  }, [nativeSTT, srLang])

  const stopNativeRec = useCallback(async () => {
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
    try { await nativeSTT?.stop?.() } catch { /* noop */ }
    try { await nativeSTTListenerRef.current?.remove?.() } catch { /* noop */ }
    nativeSTTListenerRef.current = null
    setListening(false)
  }, [nativeSTT])

  // ── Síntesis de voz (TTS) ──
  const finishSpeaking = useCallback(() => {
    if (speakTimeoutRef.current) { clearTimeout(speakTimeoutRef.current); speakTimeoutRef.current = null }
    setSpeaking(false)
  }, [])

  const speak = useCallback((text: string) => {
    if (!text?.trim()) return

    // NATIVO: AVSpeechSynthesizer (voces del sistema; suena aunque el iPhone esté en silencio).
    if (nativeTTS) {
      try { nativeTTS.stop() } catch { /* noop */ }
      setSpeaking(true)
      Promise.resolve(nativeTTS.speak({ text, lang: srLang, rate: 1.0 }))
        .then(finishSpeaking)
        .catch(finishSpeaking)
      // Red de seguridad por si la promesa no resuelve.
      if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current)
      const estMs = Math.min(20000, 1500 + (text.length / 12) * 1000)
      speakTimeoutRef.current = setTimeout(() => finishSpeaking(), estMs)
      return
    }

    // WEB: speechSynthesis.
    if (!webSynthSupported) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (voiceRef.current) { u.voice = voiceRef.current; u.lang = voiceRef.current.lang }
    else u.lang = srLang
    u.rate = 1; u.pitch = 1; u.volume = 1

    u.onend = () => finishSpeaking()
    u.onerror = () => finishSpeaking()

    setSpeaking(true)
    window.speechSynthesis.speak(u)

    // Red de seguridad: si Chrome no dispara onend, libera el estado igual.
    if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current)
    const estMs = Math.min(20000, 1500 + (text.length / 12) * 1000)
    speakTimeoutRef.current = setTimeout(() => finishSpeaking(), estMs)
  }, [nativeTTS, webSynthSupported, srLang, finishSpeaking])

  const cancelSpeak = useCallback(() => {
    if (nativeTTS) { try { nativeTTS.stop() } catch { /* noop */ } }
    else if (webSynthSupported) window.speechSynthesis.cancel()
    finishSpeaking()
  }, [nativeTTS, webSynthSupported, finishSpeaking])

  // ── API pública (idéntica para web y nativo) ──
  const startListening = useCallback((onCommand: (cmd: string) => void) => {
    if (!recognitionSupported) return
    onCommandRef.current = onCommand
    wantListenRef.current = true
    setMicError(false)
    setLastHeard('')
    if (nativeSTT) startNativeRec()
    else startRec()
  }, [recognitionSupported, nativeSTT, startNativeRec, startRec])

  const stopListening = useCallback(() => {
    wantListenRef.current = false
    if (nativeSTT) stopNativeRec()
    else stopRec()
  }, [nativeSTT, stopNativeRec, stopRec])

  useEffect(() => {
    return () => {
      wantListenRef.current = false
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      if (speakTimeoutRef.current) clearTimeout(speakTimeoutRef.current)
      stopRec()
      if (nativeSTT) {
        try { nativeSTT.stop?.() } catch { /* noop */ }
        try { nativeSTTListenerRef.current?.remove?.() } catch { /* noop */ }
        nativeSTTListenerRef.current = null
      }
      if (nativeTTS) { try { nativeTTS.stop() } catch { /* noop */ } }
      else if (webSynthSupported) window.speechSynthesis.cancel()
    }
  }, [webSynthSupported, stopRec, nativeSTT, nativeTTS])

  return {
    speak, cancelSpeak, speaking, synthSupported, voiceReady,
    startListening, stopListening, listening, recognitionSupported,
    lastHeard, micError, recStatus,
  }
}
