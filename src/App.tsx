/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CharacterArchetype, 
  InteractionMode, 
  Message, 
  AgentAction,
  AIModel
} from './types';
import { 
  generateResponse, 
  generateSpeech, 
  transcribeAudio 
} from './services/geminiService';
import Avatar from './components/Avatar';
import { 
  Mic, 
  MicOff, 
  Send, 
  Users, 
  User, 
  GraduationCap, 
  MessageCircle, 
  Terminal,
  Volume2,
  VolumeX,
  Trash2,
  Info,
  Settings,
  Sparkles,
  Key
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const OWNER_NAME = "Harish"; // Default owner name

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [archetype, setArchetype] = useState<CharacterArchetype>(CharacterArchetype.FRIEND);
  const [mode, setMode] = useState<InteractionMode>(InteractionMode.PRIVATE);
  const [isTalking, setIsTalking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [currentUser, setCurrentUser] = useState(OWNER_NAME);
  const [micPermissionStatus, setMicPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [volume, setVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(() => {
    const saved = localStorage.getItem('aura_volume');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [selectedModel, setSelectedModel] = useState<AIModel>(AIModel.GEMINI_3_1_PRO);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Check initial permission status
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
        setMicPermissionStatus(result.state as any);
        result.onchange = () => {
          setMicPermissionStatus(result.state as any);
        };
      });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('aura_volume', outputVolume.toString());
  }, [outputVolume]);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text: string, sender: string = currentUser) => {
    if (!text.trim()) return;

    // Ensure audio context is ready on user interaction
    const ctx = getAudioContext();

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      senderName: sender,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTalking(true);

    try {
      const response = await generateResponse(
        text,
        messages,
        archetype,
        mode,
        OWNER_NAME,
        sender,
        selectedModel
      );

      const modelMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response.text,
        senderName: 'Vertex',
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, modelMsg]);

      // Handle Agent Actions
      if (response.functionCalls) {
        const newActions = response.functionCalls.map(call => ({
          name: call.name,
          args: call.args,
          status: 'completed' as const
        }));
        setActions(prev => [...prev, ...newActions]);
      }

      // Handle TTS
      if (!isMuted) {
        const audioResponse = await generateSpeech(response.text);
        if (audioResponse) {
          const { data, mimeType } = audioResponse;
          
          try {
            // Ensure context is resumed before playback
            if (ctx.state === 'suspended') {
              await ctx.resume();
            }

            const binaryString = window.atob(data.replace(/\s/g, ''));
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            // Create a copy of the buffer because decodeAudioData detaches it
            const bufferCopy = bytes.buffer.slice(0);

            // Try decoding with Web Audio API first (most robust)
            ctx.decodeAudioData(bufferCopy, (buffer) => {
              const source = ctx.createBufferSource();
              const gainNode = ctx.createGain();
              gainNode.gain.value = outputVolume;
              
              source.buffer = buffer;
              source.connect(gainNode);
              gainNode.connect(ctx.destination);
              
              source.onended = () => setIsTalking(false);
              source.start(0);
            }, (err) => {
              // If decodeAudioData fails, it might be raw PCM or a format it doesn't recognize
              console.warn("Web Audio decoding failed, attempting raw PCM decoding. Error:", err);
              
              try {
                // Check if it's a known container format
                const isWav = bytes.length > 4 && 
                             bytes[0] === 0x52 && bytes[1] === 0x49 && 
                             bytes[2] === 0x46 && bytes[3] === 0x46; // 'RIFF'
                
                const isMp3 = bytes.length > 3 &&
                             ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || // ID3
                              (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)); // Sync frame

                // If it has a header but failed decoding, it might be corrupt or unsupported codec
                if (isWav || isMp3) {
                  console.warn("Data has container header (WAV/MP3) but native decoding failed.");
                }

                // bytes.buffer is still intact because we passed bufferCopy to decodeAudioData
                // Gemini TTS often returns raw PCM (16-bit, 24kHz, mono)
                // Ensure we have an even number of bytes for Int16Array
                const pcmByteLength = bytes.length - (bytes.length % 2);
                const pcmData = new Int16Array(bytes.buffer, 0, pcmByteLength / 2);
                
                // Try 24kHz first (standard for Gemini TTS)
                const audioBuffer = ctx.createBuffer(1, pcmData.length, 24000);
                const channelData = audioBuffer.getChannelData(0);
                
                for (let i = 0; i < pcmData.length; i++) {
                  // Normalize 16-bit PCM to [-1.0, 1.0]
                  channelData[i] = pcmData[i] / 32768.0;
                }
                
                const source = ctx.createBufferSource();
                const gainNode = ctx.createGain();
                gainNode.gain.value = outputVolume;
                
                source.buffer = audioBuffer;
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                
                source.onended = () => setIsTalking(false);
                source.start(0);
              } catch (pcmErr) {
                console.error("Raw PCM decoding failed, falling back to Blob URL:", pcmErr);
                // Fallback to Blob URL and <audio> tag
                const blob = new Blob([bytes], { type: mimeType || 'audio/wav' });
                const audioUrl = URL.createObjectURL(blob);
                
                if (audioRef.current) {
                  if (audioRef.current.src.startsWith('blob:')) {
                    URL.revokeObjectURL(audioRef.current.src);
                  }
                  audioRef.current.volume = outputVolume;
                  audioRef.current.src = audioUrl;
                  audioRef.current.load();
                  audioRef.current.play().catch(pErr => {
                    console.error("Fallback audio playback failed:", pErr);
                    setIsTalking(false);
                  });
                  audioRef.current.onended = () => {
                    setIsTalking(false);
                    URL.revokeObjectURL(audioUrl);
                  };
                }
              }
            });
          } catch (err) {
            console.error("Audio system initialization failed:", err);
            setIsTalking(false);
          }
        } else {
          setIsTalking(false);
        }
      } else {
        setIsTalking(false);
      }

    } catch (error) {
      console.error("Error generating response:", error);
      setIsTalking(false);
    }
  };

  const startRecording = async () => {
    try {
      const ctx = getAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionStatus('granted');
      
      // Setup volume visualization
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setVolume(average / 128); // Normalize to 0-1
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Check for supported types
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') 
        ? 'audio/ogg;codecs=opus' 
        : 'audio/webm;codecs=opus';
        
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        setVolume(0);

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const result = reader.result as string;
          const base64Audio = result.split(',')[1];
          const transcription = await transcribeAudio(base64Audio, mimeType.split(';')[0]);
          if (transcription) {
            handleSend(transcription);
          }
        };
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error: any) {
      console.error("Error accessing microphone:", error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setMicPermissionStatus('denied');
      }
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const clearHistory = () => {
    setMessages([]);
    setActions([]);
    setShowClearConfirm(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans overflow-hidden">
      <audio ref={audioRef} className="hidden" />

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1a1a1a] border border-white/10 p-8 rounded-3xl max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-2">Clear History?</h3>
              <p className="text-white/60 text-sm mb-6">This will permanently delete all messages and agent action logs. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={clearHistory}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 transition-colors text-sm font-medium"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Header */}
      <header className="p-6 border-b border-white/10 flex justify-between items-center backdrop-blur-md bg-black/20 z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">VERTEX</h1>
            <p className="text-xs text-white/40 uppercase tracking-widest">3D AI Companion</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Model Selector */}
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
            <Settings className="w-3.5 h-3.5 text-white/20 ml-2" />
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as AIModel)}
              className="bg-transparent text-xs font-medium outline-none pr-2 py-1.5 cursor-pointer text-white/60 hover:text-white transition-colors"
            >
              <option value={AIModel.GEMINI_3_1_PRO}>Gemini 3.1 Pro</option>
              <option value={AIModel.GEMINI_3_FLASH}>Gemini 3 Flash</option>
              <option value={AIModel.GEMINI_2_5_FLASH}>Gemini 2.5 Flash</option>
            </select>
          </div>

          {/* Archetype Toggle */}
          <div className="bg-white/5 p-1 rounded-xl flex gap-1 border border-white/5">
            <div className="relative group">
              <button 
                onClick={() => setArchetype(CharacterArchetype.FRIEND)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${archetype === CharacterArchetype.FRIEND ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
              >
                <User className="w-4 h-4" /> Friend
              </button>
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 p-3 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                <p className="text-[10px] text-white/60 leading-relaxed">
                  <span className="text-indigo-400 font-bold block mb-1">FRIEND MODE</span>
                  Casual, supportive, and uses emojis. Focuses on social interaction and emotional support.
                </p>
              </div>
            </div>
            <div className="relative group">
              <button 
                onClick={() => setArchetype(CharacterArchetype.TEACHER)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${archetype === CharacterArchetype.TEACHER ? 'bg-emerald-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
              >
                <GraduationCap className="w-4 h-4" /> Teacher
              </button>
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 p-3 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                <p className="text-[10px] text-white/60 leading-relaxed">
                  <span className="text-emerald-400 font-bold block mb-1">TEACHER MODE</span>
                  Professional, academic, and detailed. Focuses on deep learning and explaining complex concepts.
                </p>
              </div>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="bg-white/5 p-1 rounded-xl flex gap-1 border border-white/5">
            <button 
              onClick={() => setMode(InteractionMode.PRIVATE)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${mode === InteractionMode.PRIVATE ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
            >
              <User className="w-4 h-4" /> Private
            </button>
            <button 
              onClick={() => setMode(InteractionMode.GROUP)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${mode === InteractionMode.GROUP ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
            >
              <Users className="w-4 h-4" /> Group
            </button>
          </div>

          <button 
            onClick={() => setShowClearConfirm(true)}
            className="p-2.5 rounded-xl bg-white/5 text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/5"
            title="Clear Chat"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Avatar & Actions */}
        <div className="w-1/2 flex flex-col items-center justify-center p-12 relative border-r border-white/5">
          <div className="absolute inset-0 bg-radial-gradient from-indigo-500/10 to-transparent pointer-events-none" />
          
          <div className="relative">
            <AnimatePresence>
              {isRecording && (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1 + volume * 0.5, opacity: 0.3 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="absolute inset-0 bg-indigo-500 rounded-full blur-3xl -z-10"
                />
              )}
            </AnimatePresence>
            <Avatar isTalking={isTalking} archetype={archetype} />
          </div>
          
          <div className="mt-12 text-center">
            <motion.h2 
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="text-2xl font-light tracking-tight text-white/80"
            >
              {archetype === CharacterArchetype.FRIEND ? "Hey! I'm your friend Vertex." : "Greetings. I am Vertex, your research assistant."}
            </motion.h2>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isTalking || isRecording ? 'bg-indigo-500 animate-pulse' : 'bg-white/20'}`} />
              <p className="text-white/40 text-sm">
                {isTalking ? "Speaking..." : isRecording ? "Listening..." : "Waiting for input..."}
              </p>
            </div>
          </div>

          {/* Agent Actions Log */}
          <div className="mt-auto w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white/40 text-xs uppercase tracking-widest">
                <Terminal className="w-3 h-3" /> Agent Actions
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-white/20">
                <Sparkles className="w-3 h-3" />
                {selectedModel.split('-')[1]} Powered
              </div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-hide">
              <AnimatePresence initial={false}>
                {actions.map((action, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between group hover:border-indigo-500/30 transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-mono text-indigo-400">{action.name}</span>
                      <span className="text-[10px] text-white/40">{JSON.stringify(action.args)}</span>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </motion.div>
                ))}
              </AnimatePresence>
              {actions.length === 0 && (
                <div className="text-center py-8 border border-dashed border-white/10 rounded-xl text-white/20 text-sm">
                  No actions executed yet
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Chat */}
        <div className="w-1/2 flex flex-col bg-black/40">
          {/* Group Mode User Selector */}
          {mode === InteractionMode.GROUP && (
            <div className="p-4 border-b border-white/5 flex items-center gap-4 bg-white/5">
              <span className="text-xs text-white/40 uppercase tracking-widest">Talking as:</span>
              <div className="flex gap-2">
                {[OWNER_NAME, "Sarah", "Alex"].map(u => (
                  <button
                    key={u}
                    onClick={() => setCurrentUser(u)}
                    className={`px-3 py-1 rounded-full text-xs transition-all ${currentUser === u ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/5 text-white/40 hover:text-white'}`}
                  >
                    {u} {u === OWNER_NAME && "(Owner)"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                <MessageCircle className="w-12 h-12 mb-4" />
                <p className="text-sm uppercase tracking-[0.2em]">Start a conversation</p>
              </div>
            )}
            {messages.map((m) => (
              <motion.div 
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter">{m.senderName}</span>
                  <span className="text-[10px] text-white/20">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className={`max-w-[85%] p-4 rounded-2xl ${
                  m.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-500/10' 
                    : 'bg-white/5 text-white/90 rounded-tl-none border border-white/10'
                }`}>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </motion.div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 border-t border-white/5 bg-black/40 backdrop-blur-xl">
            {micPermissionStatus === 'denied' && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <MicOff className="w-4 h-4" />
                Microphone access is denied. Please enable it in your browser settings to use voice features.
              </div>
            )}
            <div className="flex items-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/10 focus-within:border-indigo-500/50 transition-all">
              <button 
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onPointerLeave={isRecording ? stopRecording : undefined}
                className={`p-3 rounded-xl transition-all relative overflow-hidden ${isRecording ? 'bg-red-500 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
              >
                {isRecording && (
                  <motion.div 
                    className="absolute inset-0 bg-white/20"
                    animate={{ scaleY: volume }}
                    style={{ originY: 1 }}
                  />
                )}
                <div className="relative z-10">
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </div>
              </button>
              
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                placeholder={isRecording ? "Listening..." : "Type a message..."}
                className="flex-1 bg-transparent border-none outline-none text-sm py-2"
              />

              {/* Volume Control */}
              <div className="flex items-center gap-2 px-2 group/vol relative">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-3 text-white/40 hover:text-white transition-all"
                >
                  {isMuted || outputVolume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <div className="w-0 group-hover/vol:w-24 overflow-hidden transition-all duration-300 flex items-center">
                  <input 
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={outputVolume}
                    onChange={(e) => setOutputVolume(parseFloat(e.target.value))}
                    className="w-20 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>

              <button 
                onClick={() => handleSend(input)}
                disabled={!input.trim()}
                className="p-3 bg-indigo-600 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-between items-center mt-3 px-1">
              <p className="text-[10px] text-white/20 uppercase tracking-widest">
                Hold mic to speak • Press Enter to send
              </p>
              <div className="flex items-center gap-1 text-[10px] text-white/20 uppercase tracking-widest">
                <Info className="w-3 h-3" />
                {archetype} Mode
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
