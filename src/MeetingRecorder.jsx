import React, { useState, useEffect, useRef, useCallback } from 'react';
import useMediaRecorder from './useMediaRecorder';

// Format seconds to MM:SS or HH:MM:SS
const formatDuration = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Continuous voice recognition hook for live transcription
const useLiveTranscription = () => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              final += result[0].transcript + ' ';
            } else {
              interim += result[0].transcript;
            }
          }

          if (final) {
            setTranscript(prev => prev + final);
          }
          setInterimTranscript(interim);
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          if (event.error !== 'no-speech') {
            setIsTranscribing(false);
          }
        };

        recognition.onend = () => {
          // Auto-restart if still supposed to be transcribing
          if (recognitionRef.current?.shouldRestart) {
            try {
              recognition.start();
            } catch (e) {
              // Ignore if already started
            }
          }
        };

        recognitionRef.current = recognition;
        recognitionRef.current.shouldRestart = false;
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.shouldRestart = false;
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, []);

  const startTranscription = useCallback(() => {
    if (recognitionRef.current && !isTranscribing) {
      setTranscript('');
      setInterimTranscript('');
      recognitionRef.current.shouldRestart = true;
      try {
        recognitionRef.current.start();
        setIsTranscribing(true);
      } catch (e) {
        console.error('Failed to start transcription:', e);
      }
    }
  }, [isTranscribing]);

  const stopTranscription = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.shouldRestart = false;
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      setIsTranscribing(false);
      setInterimTranscript('');
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isSupported,
    isTranscribing,
    transcript,
    interimTranscript,
    fullTranscript: transcript + interimTranscript,
    startTranscription,
    stopTranscription,
    clearTranscript
  };
};

export default function MeetingRecorder({
  supabaseClient = null,
  theme = 'dark',
  onClose = null
}) {
  const [title, setTitle] = useState('');
  const [savedRecordings, setSavedRecordings] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef(null);
  const transcriptEndRef = useRef(null);

  const {
    isSupported: recorderSupported,
    isRecording,
    isPaused,
    audioBlob,
    audioUrl,
    duration,
    error: recorderError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
    downloadRecording
  } = useMediaRecorder();

  const {
    isSupported: transcriptionSupported,
    isTranscribing,
    transcript,
    interimTranscript,
    fullTranscript,
    startTranscription,
    stopTranscription,
    clearTranscript
  } = useLiveTranscription();

  const isDark = theme === 'dark';

  // Load saved recordings from localStorage on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('meeting_recordings') || '[]');
    setSavedRecordings(saved);
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [fullTranscript]);

  // Start both recording and transcription
  const handleStartRecording = async () => {
    const started = await startRecording();
    if (started && transcriptionSupported) {
      startTranscription();
    }
  };

  // Stop both recording and transcription
  const handleStopRecording = () => {
    stopRecording();
    stopTranscription();
  };

  // Pause/Resume
  const handlePauseResume = () => {
    if (isPaused) {
      resumeRecording();
      if (transcriptionSupported) startTranscription();
    } else {
      pauseRecording();
      stopTranscription();
    }
  };

  // Clear everything for new recording
  const handleNewRecording = () => {
    clearRecording();
    clearTranscript();
    setTitle('');
    setSaveMessage(null);
    setShowTranscript(false);
  };

  // Download the recording
  const handleDownload = () => {
    const filename = title || `meeting-${new Date().toISOString().slice(0, 10)}`;
    downloadRecording(filename);
  };

  // Save to Supabase
  const handleSaveToCloud = async () => {
    if (!supabaseClient || !audioBlob) {
      setSaveMessage({ type: 'error', text: 'Supabase not configured or no recording available' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const recordingTitle = title || `Meeting ${new Date().toLocaleString()}`;
      const filename = `recordings/${Date.now()}-${recordingTitle.replace(/[^a-z0-9]/gi, '_')}.webm`;

      // Upload audio file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('meeting-recordings')
        .upload(filename, audioBlob, {
          contentType: audioBlob.type,
          cacheControl: '3600'
        });

      if (uploadError) {
        // If bucket doesn't exist, save locally instead
        if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found')) {
          throw new Error('Storage bucket not configured. Recording saved locally.');
        }
        throw uploadError;
      }

      // Save metadata to database
      const { error: dbError } = await supabaseClient
        .from('meeting_recordings')
        .insert({
          title: recordingTitle,
          duration,
          transcript: transcript || null,
          audio_path: uploadData.path,
          created_at: new Date().toISOString()
        });

      if (dbError) {
        console.warn('Failed to save metadata:', dbError);
      }

      setSaveMessage({ type: 'success', text: 'Saved to cloud!' });
    } catch (err) {
      console.error('Save error:', err);
      // Fall back to localStorage
      saveToLocalStorage();
      setSaveMessage({ type: 'warning', text: err.message || 'Saved locally (cloud unavailable)' });
    } finally {
      setIsSaving(false);
    }
  };

  // Save to localStorage
  const saveToLocalStorage = () => {
    const recordingTitle = title || `Meeting ${new Date().toLocaleString()}`;
    const recording = {
      id: Date.now(),
      title: recordingTitle,
      duration,
      transcript: transcript || '',
      created_at: new Date().toISOString(),
      // Note: We can't save the actual audio to localStorage due to size limits
      // Users should download the file
      hasAudio: false
    };

    const saved = JSON.parse(localStorage.getItem('meeting_recordings') || '[]');
    saved.unshift(recording);
    // Keep only last 20 recordings
    const trimmed = saved.slice(0, 20);
    localStorage.setItem('meeting_recordings', JSON.stringify(trimmed));
    setSavedRecordings(trimmed);
  };

  // Handle local save
  const handleSaveLocal = () => {
    saveToLocalStorage();
    setSaveMessage({ type: 'success', text: 'Saved locally!' });
  };

  // Delete a saved recording
  const handleDeleteRecording = (id) => {
    const saved = savedRecordings.filter(r => r.id !== id);
    localStorage.setItem('meeting_recordings', JSON.stringify(saved));
    setSavedRecordings(saved);
  };

  if (!recorderSupported) {
    return (
      <div style={{
        padding: '24px',
        textAlign: 'center',
        color: isDark ? '#f87171' : '#dc2626'
      }}>
        Your browser doesn't support audio recording. Please use Chrome, Firefox, or Edge.
      </div>
    );
  }

  return (
    <div style={{
      background: isDark ? 'rgba(15, 15, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderRadius: '16px',
      padding: '24px',
      color: isDark ? '#e4e4e7' : '#1a1a2e',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px'
          }}>
            {isRecording ? (isPaused ? '⏸️' : '🔴') : '🎙️'}
          </span>
          Meeting Recording
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '20px',
              opacity: 0.6
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Title Input */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Meeting title (optional)"
        disabled={isRecording}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: '10px',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
          background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          color: 'inherit',
          fontSize: '15px',
          marginBottom: '20px',
          outline: 'none'
        }}
      />

      {/* Recording Status */}
      {isRecording && (
        <div style={{
          textAlign: 'center',
          padding: '30px 0',
          marginBottom: '20px'
        }}>
          <div style={{
            fontSize: '48px',
            fontWeight: 600,
            fontFamily: 'monospace',
            marginBottom: '10px',
            color: isPaused ? (isDark ? '#fbbf24' : '#d97706') : '#ef4444'
          }}>
            {formatDuration(duration)}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '14px',
            opacity: 0.8
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: isPaused ? '#fbbf24' : '#ef4444',
              animation: isPaused ? 'none' : 'pulse 1s infinite'
            }} />
            {isPaused ? 'Paused' : 'Recording...'}
          </div>
        </div>
      )}

      {/* Recording Controls */}
      <div style={{
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        marginBottom: '20px'
      }}>
        {!isRecording && !audioBlob && (
          <button
            onClick={handleStartRecording}
            style={{
              padding: '14px 28px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
            }}
          >
            🎙️ Start Recording
          </button>
        )}

        {isRecording && (
          <>
            <button
              onClick={handlePauseResume}
              style={{
                padding: '14px 24px',
                borderRadius: '12px',
                border: 'none',
                background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isPaused ? '▶️ Resume' : '⏸️ Pause'}
            </button>
            <button
              onClick={handleStopRecording}
              style={{
                padding: '14px 24px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
              }}
            >
              ⏹️ Stop
            </button>
          </>
        )}
      </div>

      {/* Live Transcript */}
      {(isRecording || fullTranscript) && transcriptionSupported && (
        <div style={{
          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <span style={{ fontSize: '13px', fontWeight: 500, opacity: 0.7 }}>
              Live Transcript {isTranscribing && '(listening...)'}
            </span>
            {transcript && (
              <span style={{ fontSize: '12px', opacity: 0.5 }}>
                {transcript.split(' ').filter(w => w).length} words
              </span>
            )}
          </div>
          <div style={{
            maxHeight: '150px',
            overflowY: 'auto',
            fontSize: '14px',
            lineHeight: 1.6
          }}>
            {fullTranscript || (
              <span style={{ opacity: 0.4, fontStyle: 'italic' }}>
                {isRecording ? 'Speak to see transcript...' : 'No transcript available'}
              </span>
            )}
            <span style={{ opacity: 0.5 }}>{interimTranscript}</span>
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {/* Playback & Actions (after recording) */}
      {audioUrl && !isRecording && (
        <div style={{
          background: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <span style={{ fontSize: '24px' }}>✅</span>
            <div>
              <div style={{ fontWeight: 500 }}>Recording Complete</div>
              <div style={{ fontSize: '13px', opacity: 0.6 }}>
                Duration: {formatDuration(duration)}
                {transcript && ` | ${transcript.split(' ').filter(w => w).length} words`}
              </div>
            </div>
          </div>

          {/* Audio Player */}
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            style={{
              width: '100%',
              marginBottom: '16px',
              borderRadius: '8px'
            }}
          />

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <button
              onClick={handleDownload}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📥 Download
            </button>

            {supabaseClient && (
              <button
                onClick={handleSaveToCloud}
                disabled={isSaving}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isSaving ? 0.7 : 1
                }}
              >
                {isSaving ? '⏳ Saving...' : '☁️ Save to Cloud'}
              </button>
            )}

            <button
              onClick={handleSaveLocal}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              💾 Save Locally
            </button>

            {transcript && (
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                📝 {showTranscript ? 'Hide' : 'View'} Transcript
              </button>
            )}

            <button
              onClick={handleNewRecording}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginLeft: 'auto'
              }}
            >
              🔄 New Recording
            </button>
          </div>

          {/* Save Message */}
          {saveMessage && (
            <div style={{
              marginTop: '12px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              background: saveMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' :
                          saveMessage.type === 'warning' ? 'rgba(251, 191, 36, 0.15)' :
                          'rgba(239, 68, 68, 0.15)',
              color: saveMessage.type === 'success' ? '#10b981' :
                     saveMessage.type === 'warning' ? '#fbbf24' : '#ef4444'
            }}>
              {saveMessage.type === 'success' ? '✓' : saveMessage.type === 'warning' ? '⚠' : '✕'} {saveMessage.text}
            </div>
          )}

          {/* Full Transcript View */}
          {showTranscript && transcript && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '8px',
              background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
              fontSize: '14px',
              lineHeight: 1.7,
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {transcript}
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {recorderError && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
          fontSize: '13px',
          marginBottom: '20px'
        }}>
          ✕ {recorderError}
        </div>
      )}

      {/* Previous Recordings */}
      {savedRecordings.length > 0 && !isRecording && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px', opacity: 0.7 }}>
            Previous Recordings ({savedRecordings.length})
          </h3>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {savedRecordings.map(rec => (
              <div
                key={rec.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{rec.title}</div>
                  <div style={{ fontSize: '12px', opacity: 0.5 }}>
                    {formatDuration(rec.duration)} | {new Date(rec.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRecording(rec.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '16px',
                    opacity: 0.6
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcription Support Note */}
      {!transcriptionSupported && (
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '12px',
          background: isDark ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.08)',
          color: isDark ? '#fbbf24' : '#d97706'
        }}>
          ⚠ Live transcription not available in this browser. Use Chrome for best results.
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
