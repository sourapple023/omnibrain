```react
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

/**
 * OMNI OS 2026 - GitHub Ready Edition
 * Features:
 * - Persistent User Memory (Firestore)
 * - Exponential Backoff API Retries
 * - Responsive Terminal UI
 * - Anonymous Auth & Session Management
 */

// --- CONFIGURATION & ENV ---
// In a standard GitHub repo, these would be in a .env file
const API_KEY = ""; 
const MODEL_NAME = "gemini-2.5-flash-preview-09-2025";
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'omni-2026-prod';

// Safe check for Firebase config
const getFirebaseConfig = () => {
  try {
    return JSON.parse(__firebase_config);
  } catch (e) {
    console.error("Firebase config missing or invalid.");
    return {};
  }
};

const app = initializeApp(getFirebaseConfig());
const auth = getAuth(app);
const db = getFirestore(app);

// --- UTILS ---
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

export default function App() {
  const [messages, setMessages] = useState([
    { text: "System Initialized. OMNI v2.0 ready for input.", type: 'omni', time: new Date() }
  ]);
  const [inputText, setInputText] = useState("");
  const [user, setUser] = useState(null);
  const [memory, setMemory] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // --- AUTHENTICATION (RULE 3) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Critical Auth Error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- DATA SYNC ---
  useEffect(() => {
    if (!user) return;

    // Load User Memory
    const memoryRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'memory');
    getDoc(memoryRef).then(docSnap => {
      if (docSnap.exists()) setMemory(docSnap.data().facts || []);
    });

    // Simple Public Log Sync (Rule 2: No complex queries)
    const logsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'logs');
    const unsubscribe = onSnapshot(logsRef, () => {}, (err) => console.error("Sync Error:", err));
    
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- GEMINI ENGINE WITH EXPONENTIAL BACKOFF ---
  const callGeminiWithRetry = async (queryText, retryCount = 0) => {
    const systemPrompt = `You are OMNI OS. User Memory: ${memory.join(", ")}. Be direct, technical, and use markdown.`;
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: queryText }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text;

    } catch (err) {
      if (retryCount < 5) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        await sleep(waitTime);
        return callGeminiWithRetry(queryText, retryCount + 1);
      }
      throw err;
    }
  };

  const executeAction = async (input) => {
    const text = input.trim();
    if (!text) return;

    setMessages(prev => [...prev, { text, type: 'user', time: new Date() }]);
    setInputText("");
    
    const [cmd, ...argsArray] = text.split(" ");
    const args = argsArray.join(" ");

    if (cmd.toLowerCase() === 'learn' && args) {
      const updated = [...memory, args].slice(-20);
      setMemory(updated);
      if (user) {
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'memory'), { facts: updated });
      }
      setMessages(prev => [...prev, { text: `Memory logged: ${args}`, type: 'omni', time: new Date() }]);
      return;
    }

    if (cmd.toLowerCase() === 'clear') {
      setMessages([{ text: "Terminal cleared.", type: 'omni', time: new Date() }]);
      return;
    }

    setIsTyping(true);
    try {
      const aiResponse = await callGeminiWithRetry(text);
      setMessages(prev => [...prev, { text: aiResponse, type: 'omni', time: new Date() }]);
      
      if (user) {
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'logs'), {
          uid: user.uid,
          prompt: text,
          timestamp: serverTimestamp()
        });
      }
    } catch (e) {
      setMessages(prev => [...prev, { text: "Connection failed. Please check network protocols.", type: 'omni', time: new Date() }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200 font-mono">
      {/* Top Bar */}
      <nav className="flex items-center justify-between px-6 py-3 bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
          <span className="font-bold tracking-widest text-blue-400">OMNI_OS // 2026</span>
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-tighter">
          {user ? `Session_Active: ${user.uid.slice(0,12)}` : "Authenticating..."}
        </div>
      </nav>

      {/* Output Console */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
        <div className="max-w-4xl mx-auto">
          {messages.map((m, i) => (
            <div key={i} className={`mb-6 flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`group relative max-w-[85%] p-4 rounded-lg border ${
                m.type === 'user' 
                  ? 'bg-blue-900/20 border-blue-500/30 text-blue-100' 
                  : 'bg-slate-900/40 border-slate-800 text-slate-300'
              }`}>
                <span className="absolute -top-3 left-3 text-[9px] bg-[#020617] px-1 text-slate-500 uppercase">
                  {m.type === 'user' ? 'Local_User' : 'OMNI_Kernel'}
                </span>
                <div className="text-sm leading-relaxed prose prose-invert max-w-none">
                  {m.text}
                </div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-1 py-2 text-blue-500">
              <span className="animate-bounce">.</span>
              <span className="animate-bounce [animation-delay:0.2s]">.</span>
              <span className="animate-bounce [animation-delay:0.4s]">.</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Input Terminal */}
      <footer className="p-6 bg-[#0f172a]/50 border-t border-slate-800">
        <div className="max-w-4xl mx-auto relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 font-bold tracking-widest pointer-events-none">
            &gt;
          </div>
          <input
            autoFocus
            className="w-full bg-slate-950/50 border border-slate-700 rounded-lg pl-10 pr-4 py-4 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-700"
            placeholder="awaiting_input..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeAction(inputText)}
          />
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}

```
