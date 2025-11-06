import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isFinished, setIsFinished] = useState(false)
  const [lastCommand, setLastCommand] = useState('')
  const [error, setError] = useState('')
  const [lastDetectionTime, setLastDetectionTime] = useState(0)
  const recognitionRef = useRef(null)
  const timerRef = useRef(null)
  const isListeningRef = useRef(false)
  const isFinishedRef = useRef(false)
  const wakeLockRef = useRef(null)

  // Initialize speech recognition
  const initRecognition = () => {
    if (!recognitionRef.current && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true  // ✅ REAL-TIME detekce
      recognitionRef.current.lang = 'cs-CZ'
      recognitionRef.current.maxAlternatives = 1

      recognitionRef.current.onresult = (event) => {
        // Zpracovat všechny nové výsledky (interim i final)
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const transcript = result[0].transcript.toLowerCase().trim()
          const confidence = result[0].confidence
          const isFinal = result.isFinal

          // Zobrazit poslední rozpoznaný text
          setLastCommand(`[${isFinal ? 'FINAL' : 'INTERIM'}] ${transcript}`)

          console.log(`Speech: "${transcript}" (final: ${isFinal}, conf: ${confidence || 'N/A'})`)

          // REAL-TIME DETEKCE klíčového slova
          const triggerWords = ['můžeš', 'mužeš', 'muzes']
          const hasKeyword = triggerWords.some(word => transcript.includes(word))

          // ZPRACOVÁVAT JEN FINAL RESULTS - prevence duplicit
          if (hasKeyword && isFinal) {
            // DEBOUNCING: Prevence duplicitních detekcí
            const now = Date.now()
            const DEBOUNCE_MS = 800 // 800ms window

            setLastDetectionTime(prevTime => {
              if (now - prevTime >= DEBOUNCE_MS) {
                // Confidence check (jen pro final results)
                if (isFinal && confidence !== undefined && confidence < 0.6) {
                  console.log(`⚠️ Low confidence (${confidence}), ignoring`)
                } else {
                  // PŘIDAT +1
                  setCount(prev => {
                    const newCount = prev + 1
                    playBeep()
                    console.log(`✅ Count increased to ${newCount}`)
                    return newCount
                  })
                }
                return now
              } else {
                console.log('⏱️ Debouncing - ignoring duplicate')
                return prevTime
              }
            })
          }

          // Příkaz pro ukončení (čekat na final result)
          if (transcript.includes('hotovo') && isFinal) {
            console.log('🏁 Stopping counting')
            stopCounting()
          }
        }
      }

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error, event)
        if (event.error === 'not-allowed') {
          setError('Mikrofon nebyl povolen. Klikněte na ikonu vedle URL a povolte mikrofon.')
          setIsListening(false)
        } else if (event.error === 'network') {
          setError('Speech API není dostupné. Web Speech API funguje nejlépe na mobilních zařízeních (Android Chrome). Na PC může být omezené.')
          setIsListening(false)
        } else if (event.error === 'aborted') {
          // Ignore aborted errors - they happen on stop
        } else if (event.error === 'audio-capture') {
          setError('Nelze zachytit zvuk z mikrofonu. Zkontrolujte, zda mikrofon funguje.')
          setIsListening(false)
        } else if (event.error === 'service-not-allowed') {
          setError('Speech služba není povolena. Zkuste použít HTTPS nebo mobilní zařízení.')
          setIsListening(false)
        } else {
          setError(`Chyba rozpoznávání: ${event.error}`)
          setIsListening(false)
        }
      }

      recognitionRef.current.onend = () => {
        console.log('Recognition ended')

        // Auto-restart if still listening (critical for mobile devices)
        if (isListeningRef.current && !isFinishedRef.current) {
          console.log('Auto-restarting recognition...')
          try {
            recognitionRef.current.start()
          } catch (e) {
            // Ignore "already started" error
            if (e.message && !e.message.includes('already started')) {
              console.error('Failed to restart recognition:', e)
            }
          }
        }
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
      }
    }
  }, [])

  // Wake Lock - keep screen awake and app running even when phone is locked
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
        console.log('✅ Wake Lock activated - phone will stay awake')

        // Re-request wake lock when page becomes visible again
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock released')
        })
      } else {
        console.log('⚠️ Wake Lock API not supported on this device')
      }
    } catch (err) {
      console.error('Failed to activate Wake Lock:', err)
    }
  }

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
        console.log('Wake Lock released')
      }
    } catch (err) {
      console.error('Failed to release Wake Lock:', err)
    }
  }

  // Re-acquire wake lock when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isListening && !isFinished) {
        console.log('Page visible - re-acquiring Wake Lock')
        await requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isListening, isFinished])

  // Timer
  useEffect(() => {
    if (isListening && !isFinished) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTime)
      }, 100)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isListening, isFinished, startTime])

  // Audio beep feedback
  const playBeep = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800 // High pitch beep
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
    } catch (e) {
      console.log('Audio beep failed:', e)
    }
  }

  const speakNumber = (number) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(number.toString())
      utterance.lang = 'cs-CZ'
      utterance.rate = 1.2
      window.speechSynthesis.speak(utterance)
    }
  }

  const startCounting = async () => {
    setError('')

    // Test microphone access with enhanced constraints for noisy environment
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,    // Potlačení ozvěny
          noiseSuppression: true,    // Potlačení šumu
          autoGainControl: true,     // Automatická regulace hlasitosti
          channelCount: 1,           // Mono je lepší pro rozpoznávání
        }
      })
      stream.getTracks().forEach(track => track.stop()) // Stop the test stream
      console.log('Microphone access granted with enhanced settings')
    } catch (err) {
      console.error('Microphone access denied:', err)
      setError('Mikrofon není dostupný. Zkontrolujte oprávnění v nastavení.')
      return
    }

    setIsListening(true)
    isListeningRef.current = true
    setStartTime(Date.now())
    setIsFinished(false)
    isFinishedRef.current = false

    // Initialize recognition on first start (user gesture required)
    initRecognition()

    // Request Wake Lock to keep phone awake
    await requestWakeLock()

    // Start recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start()
        console.log('Speech recognition started')
      } catch (e) {
        console.error('Failed to start recognition:', e)
        setError('Nelze spustit rozpoznávání hlasu. Zkuste to znovu.')
        setIsListening(false)
        isListeningRef.current = false
        await releaseWakeLock()
      }
    }
  }

  const stopCounting = async () => {
    isListeningRef.current = false   // Nastavit PŘED stop()
    isFinishedRef.current = true     // Nastavit PŘED stop()

    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
    setIsFinished(true)

    // Release Wake Lock
    await releaseWakeLock()
  }

  const reset = async () => {
    setCount(0)
    setElapsedTime(0)
    setIsFinished(false)
    setLastCommand('')
    setError('')
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    // Release Wake Lock if active
    await releaseWakeLock()
  }

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const milliseconds = Math.floor((ms % 1000) / 10)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
  }

  const averagePerMinute = () => {
    if (elapsedTime === 0) return 0
    return ((count / (elapsedTime / 1000)) * 60).toFixed(1)
  }

  return (
    <div className="app">
      <div className="container">
        <h1 className="title">Hlasové počítadlo</h1>

        {/* Timer */}
        <div className="timer">
          {formatTime(elapsedTime)}
        </div>

        {/* Main Counter */}
        <div className={`counter ${isFinished ? 'finished' : ''}`}>
          {count}
        </div>

        {/* Status */}
        <div className="status">
          {isListening && !isFinished && (
            <div className="listening">
              <span className="pulse"></span>
              Poslouchám...
            </div>
          )}
          {isFinished && (
            <div className="finished-status">
              Hotovo
            </div>
          )}
        </div>

        {/* Last Command */}
        {lastCommand && (
          <div className="last-command">
            Poslední příkaz: <strong>{lastCommand}</strong>
          </div>
        )}

        {/* Stats */}
        {elapsedTime > 0 && (
          <div className="stats">
            <div className="stat">
              <div className="stat-value">{count}</div>
              <div className="stat-label">Celkem kusů</div>
            </div>
            <div className="stat">
              <div className="stat-value">{averagePerMinute()}</div>
              <div className="stat-label">Kusů/min</div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="controls">
          {!isListening && !isFinished && (
            <button onClick={startCounting} className="btn btn-primary">
              Start
            </button>
          )}
          {isListening && !isFinished && (
            <button onClick={stopCounting} className="btn btn-danger">
              Stop
            </button>
          )}
          {(count > 0 || isFinished) && (
            <button onClick={reset} className="btn btn-secondary">
              Reset
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="error">
            {error}
          </div>
        )}

        {/* Browser Support */}
        {!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) && (
          <div className="error">
            Váš prohlížeč nepodporuje hlasové rozpoznávání. Použijte Chrome na Android.
          </div>
        )}
      </div>
    </div>
  )
}

export default App
