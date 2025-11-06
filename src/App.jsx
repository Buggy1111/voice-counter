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
  const recognitionRef = useRef(null)
  const timerRef = useRef(null)

  // Initialize speech recognition
  const initRecognition = () => {
    if (!recognitionRef.current && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'cs-CZ'

      recognitionRef.current.onresult = (event) => {
        const last = event.results.length - 1
        const command = event.results[last][0].transcript.toLowerCase().trim()
        setLastCommand(command)

        console.log('Rozpoznáno:', command)

        // Příkazy pro zvýšení počtu
        if (command.includes('můžeš') ||
            command.includes('další') ||
            command.includes('už') ||
            command.includes('mužeš') || // varianta překlep
            command.includes('muzes')) {  // bez háčků
          setCount(prev => {
            const newCount = prev + 1
            playBeep() // Audio feedback
            // Optional: also speak the number
            // speakNumber(newCount)
            return newCount
          })
        }

        // Příkaz pro ukončení
        if (command.includes('hotovo')) {
          stopCounting()
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
        // Recognition ended - could auto-restart here if needed
        console.log('Recognition ended')
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

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

    // Test microphone access first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop()) // Stop the test stream
      console.log('Microphone access granted')
    } catch (err) {
      console.error('Microphone access denied:', err)
      setError('Mikrofon není dostupný. Zkontrolujte oprávnění v nastavení Windows.')
      return
    }

    setIsListening(true)
    setStartTime(Date.now())
    setIsFinished(false)

    // Initialize recognition on first start (user gesture required)
    initRecognition()

    // Start recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start()
        console.log('Speech recognition started')
      } catch (e) {
        console.error('Failed to start recognition:', e)
        setError('Nelze spustit rozpoznávání hlasu. Zkuste to znovu.')
        setIsListening(false)
      }
    }
  }

  const stopCounting = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
    setIsFinished(true)
  }

  const reset = () => {
    setCount(0)
    setElapsedTime(0)
    setIsFinished(false)
    setLastCommand('')
    setError('')
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
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
          <div className="error" style={{ marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {/* Instructions */}
        <div className="instructions">
          <h3>Příkazy</h3>
          <ul>
            <li><strong>"můžeš"</strong> nebo <strong>"další"</strong> nebo <strong>"už"</strong> → přidá +1</li>
            <li><strong>"hotovo"</strong> → zastaví počítání</li>
          </ul>
        </div>

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
