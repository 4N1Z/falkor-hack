import { Mic, Square, AlertCircle } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
}

export function VoiceRecorder({ onTranscript }: VoiceRecorderProps) {
  const [isListening, setIsListening] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [isMicrophoneAvailable, setIsMicrophoneAvailable] = useState(true);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        setErrorMessage("Speech recognition is not supported in this browser");
        return;
      }

      recognitionRef.current = new SpeechRecognition();
      const recognition = recognitionRef.current;
      
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event) => {
        const current = event.resultIndex;
        const result = event.results[current];
        const transcriptText = result[0].transcript;
        setTranscript(transcriptText);
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          setIsMicrophoneAvailable(false);
        } else {
          setErrorMessage(`Error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleRecording = useCallback(() => {
    try {
      if (!recognitionRef.current) {
        setErrorMessage("Speech recognition is not supported");
        return;
      }

      if (isListening) {
        recognitionRef.current.stop();
        if (transcript) {
          onTranscript(transcript);
          setTranscript("");
        }
      } else {
        recognitionRef.current.start();
        setErrorMessage("");
      }
      setIsListening(!isListening);
    } catch (error) {
      console.error('Error toggling recording:', error);
      setErrorMessage("Failed to start/stop recording. Please try again.");
      setIsListening(false);
    }
  }, [isListening, transcript, onTranscript]);

  // Handle microphone access denied
  if (!isMicrophoneAvailable) {
    return (
      <div className="relative group">
        <button
          type="button"
          disabled
          className="p-1.5 text-yellow-500 hover:bg-white/10 rounded-md transition-colors relative disabled:opacity-50"
          title="Microphone access denied"
        >
          <AlertCircle size={14} />
        </button>
        <div className="absolute bottom-full mb-2 left-0 bg-red-500/10 border border-red-500/20 p-2 rounded-md text-xs max-w-[200px] break-words opacity-0 group-hover:opacity-100 transition-opacity">
          Microphone access denied. Please allow microphone access.
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={toggleRecording}
        className={`p-1.5 ${
          isListening ? 'text-red-500' : 
          errorMessage ? 'text-yellow-500' : 
          'text-primary'
        } hover:bg-white/10 rounded-md transition-colors relative`}
        title={errorMessage || 'Toggle voice recording'}
      >
        {isListening ? (
          <>
            <Square size={14} className="animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
          </>
        ) : errorMessage ? (
          <AlertCircle size={14} />
        ) : (
          <Mic size={14} />
        )}
      </button>

      {/* Show transcript while recording */}
      {isListening && transcript && (
        <div className="absolute bottom-full mb-2 left-0 bg-primary/70 backdrop-blur-sm p-2 rounded-md text-xs max-w-[320px] break-words">
          {transcript}
        </div>
      )}

      {/* Show error message */}
      {errorMessage && (
        <div className="absolute bottom-full mb-2 left-0 bg-red-500/10 border border-red-500/20 p-2 rounded-md text-xs max-w-[200px] break-words opacity-0 group-hover:opacity-100 transition-opacity">
          {errorMessage}
        </div>
      )}
    </div>
  );
}