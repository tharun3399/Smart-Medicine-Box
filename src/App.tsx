/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  useNavigate, 
  useLocation 
} from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pill, 
  Mail, 
  Lock, 
  User as UserIcon, 
  ArrowRight, 
  Loader2, 
  LogOut, 
  Plus, 
  Bell, 
  Calendar,
  ChevronRight,
  AlertCircle,
  X,
  Sparkles,
  LayoutDashboard,
  PackagePlus,
  CheckCircle2,
  Menu,
  ChevronLeft,
  Clock,
  Trash2,
  MessageCircle,
  Settings,
  Wifi
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Schemas ---
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  deviceToken: z.string().min(4, 'Device token is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

// --- Components ---

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode, error?: string, label?: string }>(
  ({ className, icon, error, label, id, ...props }, ref) => {
    return (
      <div className="space-y-1 w-full">
        {label && (
          <label
            className="block text-xs font-semibold text-slate-600 ml-1 mb-0.5"
            htmlFor={id}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={id}
            className={cn(
              "flex h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base ring-offset-white file:border-0 file:bg-transparent file:text-base file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all",
              icon && "pl-10",
              error && "border-red-500 focus-visible:ring-red-500",
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-500 font-medium ml-1">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost', isLoading?: boolean }>(
  ({ className, variant = 'primary', isLoading, children, ...props }, ref) => {
    const variants = {
      primary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm",
      secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm",
      ghost: "bg-transparent text-slate-600 hover:bg-slate-50 hover:-translate-y-0.5 active:translate-y-0",
    };

    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-xl px-5 py-3 text-base font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
          variants[variant],
          className
        )}
        {...props}
      >
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// --- Main App ---

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showGreeting, setShowGreeting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [prepTimes, setPrepTimes] = useState<string[]>(['08:00']);
  const [prepFrequency, setPrepFrequency] = useState<string>('Daily');
  const [prepDays, setPrepDays] = useState<string[]>([]);
  const [prepView, setPrepView] = useState<'menu' | 'load' | 'view' | 'manage'>('menu');
  const [isOpeningBox, setIsOpeningBox] = useState(false);
  const [openBoxStatus, setOpenBoxStatus] = useState<'idle' | 'success' | 'error' | 'question'>('idle');
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);
  const [intakeQuestionType, setIntakeQuestionType] = useState<null | 'taken' | 'not-taken'>(null);
  const [pendingDose, setPendingDose] = useState<{
    id: string;
    name: string;
    timeLabel: string;
  } | null>(null);
  const [medicineName, setMedicineName] = useState('');
  const [medicineDosage, setMedicineDosage] = useState('');
  const [medicineTotalDoses, setMedicineTotalDoses] = useState('');
  const [medicineCompartment, setMedicineCompartment] = useState('');
  const [prepSaveStatus, setPrepSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showMedicineSaved, setShowMedicineSaved] = useState(false);
  const [medicines, setMedicines] = useState<Array<{ id: string; name: string; dosage: string; frequency: string; times: string[]; compartment?: string }>>([]);
  const [medicinesLoading, setMedicinesLoading] = useState(false);
  const [medicinesError, setMedicinesError] = useState<string | null>(null);
  const [takenDoseIds, setTakenDoseIds] = useState<string[]>([]);
  const [editingMedicineId, setEditingMedicineId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem('deviceToken') || '';
    } catch {
      return '';
    }
  });
  const [devicePaired, setDevicePaired] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('devicePaired') === 'true';
    } catch {
      return false;
    }
  });
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [isPairingInProgress, setIsPairingInProgress] = useState(false);
  const [isTakeModalOpen, setIsTakeModalOpen] = useState(false);
  const [knowmedQuestion, setKnowmedQuestion] = useState('');
  const [knowmedAnswer, setKnowmedAnswer] = useState('');
  const [knowmedLoading, setKnowmedLoading] = useState(false);
  const [knowmedError, setKnowmedError] = useState<string | null>(null);
  const [knowmedMessages, setKnowmedMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([]);
  const [recentIntakes, setRecentIntakes] = useState<Array<{
    id: number;
    user_email: string | null;
    medicine_name: string;
    time_label: string;
    taken_at: string;
  }>>([]);
  const knowmedAbortRef = useRef<AbortController | null>(null);
  const [backendToken, setBackendToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem('backendToken');
    } catch {
      return null;
    }
  });

  // Backend base URL: works both on laptop and other devices in same network
  const apiBaseUrl = useMemo(() => {
    const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
    if (envBase) return envBase.replace(/\/$/, '');
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const protocol = window.location.protocol || 'http:';
      return `${protocol}//${host}:4000`;
    }
    return 'http://localhost:4000';
  }, []);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowGreeting(false);
      try {
        window.localStorage.removeItem('deviceToken');
        window.localStorage.removeItem('devicePaired');
        window.localStorage.removeItem('backendToken');
      } catch {}
      setRecentIntakes([]);
      setBackendToken(null);
      navigate('/');
    } catch (error) {
      console.error("Logout error", error);
    }
  };

  // Live-update last 20 intake readings for dashboard plot
  useEffect(() => {
    if (!user) return;
    if (!backendToken) return;

    let cancelled = false;
    let intervalId: number | undefined;

    const fetchRecentIntakes = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/intakes/recent`, {
          headers: {
            Authorization: backendToken ? `Bearer ${backendToken}` : '',
          },
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null as any);
        if (!data || !Array.isArray(data.readings)) return;
        if (cancelled) return;
        setRecentIntakes(data.readings);
      } catch (e) {
        if (!cancelled) {
          console.warn('[dashboard] Failed to load recent intakes', e);
        }
      }
    };

    fetchRecentIntakes();
    intervalId = window.setInterval(fetchRecentIntakes, 5000);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [user, apiBaseUrl, backendToken]);

  // Load medicines for the current user when needed (Prep view/manage or Take page)
  useEffect(() => {
    if (!user) return;
    if (prepView !== 'view' && prepView !== 'manage' && location.pathname !== '/take') return;

    let cancelled = false;

    const loadMedicines = async () => {
      setMedicinesLoading(true);
      setMedicinesError(null);
      try {
        const q = query(collection(db, 'medications'), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        if (cancelled) return;

        const items: Array<{ id: string; name: string; dosage: string; frequency: string; times: string[]; compartment?: string }> = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          items.push({
            id: docSnap.id,
            name: data.name ?? 'Unnamed',
            dosage: data.dosage ?? '',
            frequency: data.frequency ?? '',
            times: Array.isArray(data.times) ? data.times : [],
            compartment: data.compartment ?? '',
          });
        });

        setMedicines(items);
      } catch (err) {
        console.error('[medicines] Failed to load medicines', err);
        if (!cancelled) setMedicinesError('Failed to load medicines.');
      } finally {
        if (!cancelled) setMedicinesLoading(false);
      }
    };

    loadMedicines();

    return () => {
      cancelled = true;
    };
  }, [user, prepView, location.pathname]);

  // Load device token for the current user from Firestore
  useEffect(() => {
    const loadToken = async () => {
      if (!user) {
        setDeviceToken('');
        setDevicePaired(false);
        try {
          window.localStorage.removeItem('deviceToken');
          window.localStorage.removeItem('devicePaired');
        } catch {}
        return;
      }

      // First, try Firestore (primary source when network to Firebase works)
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const data = userDoc.data() as any | undefined;
        if (data && (data.deviceToken || data.devicePaired)) {
          const token = data.deviceToken || '';
          const paired = !!data.devicePaired;
          setDeviceToken(token);
          setDevicePaired(paired);
          try {
            window.localStorage.setItem('deviceToken', token);
            window.localStorage.setItem('devicePaired', paired ? 'true' : 'false');
          } catch {}
          return;
        }
      } catch (err) {
        console.warn('[device] Failed to load device token from Firestore, will try backend DB', err);
      }

      // Fallback: ask local backend DB by email so pairing persists even if Firestore is offline.
      // IMPORTANT: only use the backend result to *promote* the state to paired, never to
      // downgrade an already-paired user.
      if (user.email && backendToken) {
        try {
          const res = await fetch(`${apiBaseUrl}/api/device/status`, {
            headers: {
              Authorization: `Bearer ${backendToken}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (data) {
              const token = data.deviceToken || '';
              const paired = !!data.devicePaired;

              // Only update if the backend says "paired" or has a token. If it reports
              // unpaired/empty, we keep whatever we already had from localStorage.
              if (paired || token) {
                setDeviceToken(token);
                setDevicePaired(paired);
                try {
                  window.localStorage.setItem('deviceToken', token);
                  window.localStorage.setItem('devicePaired', paired ? 'true' : 'false');
                } catch {}
              }
              return;
            }
          }
        } catch (err) {
          console.warn('[device] Failed to load device status from backend DB', err);
        }
      }

      // Default: if we couldn't load anything useful, keep whatever is in local state/localStorage.
      // This avoids forcing the user to re-pair when Firestore/backend are offline or empty.
    };

    loadToken();
  }, [user, apiBaseUrl, backendToken]);

  // Force unpaired users to the pairing screen until their device is paired
  useEffect(() => {
    if (!user) return;
    if (
      !devicePaired &&
      location.pathname !== '/pair' &&
      location.pathname !== '/device-wifi-setup'
    ) {
      navigate('/pair');
    }
  }, [user, devicePaired, location.pathname, navigate]);

  const onAuthSuccess = () => {
    setShowGreeting(true);
    navigate('/dashboard');
  };

  const onSignupSuccess = () => {
    navigate('/pair');
  };

  const handleDemoLogin = () => {
    setUser({
      uid: 'demo-user',
      email: 'demo@example.com',
      displayName: 'Demo User',
    } as any);
    onAuthSuccess();
  };

  // Expose to window so the LoginForm can call it
  useEffect(() => {
    (window as any).handleDemoLogin = handleDemoLogin;
    return () => { delete (window as any).handleDemoLogin; };
  }, []);

  const handleIntakeQuestionYes = async () => {
    // User confirmed inside the app popup (not a browser dialog)
    if (intakeQuestionType === 'taken' && pendingDose) {
      const { id, name, timeLabel } = pendingDose;

      setTakenDoseIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

      // Inform backend so phone-call reminders stop for this dose today
      try {
        if (!backendToken) {
          console.warn('[reminders] Skipping backend dose-taken notification because backendToken is missing');
        } else {
          await fetch(`${apiBaseUrl}/api/reminders/dose-taken`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${backendToken}`,
            },
            body: JSON.stringify({
              medicineName: name,
              time: timeLabel,
            }),
          });
        }
      } catch (err) {
        console.warn('[reminders] Failed to notify backend about taken dose', err);
      }

      setIntakeMessage('Medicine taken and recorded.');
      setOpenBoxStatus('success');
    } else if (intakeQuestionType === 'not-taken') {
      // Dose was not taken; user chose to close the box / dismiss the popup.
      setIntakeMessage('Box closed. You can open it again when you are ready to take this dose.');
      setOpenBoxStatus('idle');
    }

    // In all cases, close the popup question and return to the Take Medicine page.
    setIntakeQuestionType(null);
    setPendingDose(null);
    setIsTakeModalOpen(false);
  };

  const handleIntakeQuestionNo = () => {
    // User does not want to close / move on; simply dismiss the question
    // but keep them on the Take Medicine page without marking anything.
    setIntakeQuestionType(null);
    setPendingDose(null);
    setOpenBoxStatus('idle');
    setIntakeMessage(null);
    setIsTakeModalOpen(false);
  };

  const handleConfirmIntake = async () => {
    // Use the ESP's IP on your Wi‑Fi network (replace with your actual STA IP)
    const ESP_BASE_URL = 'http://10.36.109.123';

    if (!deviceToken) {
      alert('Your device is not paired yet. Please ensure a DEVICE TOKEN is saved for your account.');
      return;
    }

    console.log('[box] Sending open-box command to ESP8266 at', ESP_BASE_URL);

    setIsOpeningBox(true);
    setOpenBoxStatus('idle');
    setIntakeMessage(null);
    setIntakeQuestionType(null);
    setPendingDose(null);
    try {
      // Determine the next untaken dose and its compartment (if any)
      const doses = computeUpcomingDoses();
      const nextUntaken = doses.find((d) => !takenDoseIds.includes(d.id));

      if (nextUntaken) {
        setPendingDose({
          id: nextUntaken.id,
          name: nextUntaken.name,
          timeLabel: nextUntaken.timeLabel,
        });
      }

      const rawCompartment = nextUntaken?.compartment && nextUntaken.compartment.trim() !== ''
        ? nextUntaken.compartment.trim()
        : '1'; // fallback to compartment 1 if not configured

      // Guard against invalid compartments (frontend should already restrict to 1-3)
      if (!['1', '2', '3'].includes(rawCompartment)) {
        console.error('[box] Invalid compartment for dose:', rawCompartment, '– expected 1, 2, or 3.');
        setIntakeMessage('Invalid compartment configured for this medicine. Please edit it and choose compartment 1, 2, or 3.');
        setOpenBoxStatus('error');
        setIsOpeningBox(false);
        return;
      }

      const compartmentForDose = rawCompartment;

      const res = await fetch(`${ESP_BASE_URL}/open-box?compartment=${encodeURIComponent(compartmentForDose)}&token=${encodeURIComponent(deviceToken)}`, {
        method: 'POST',
      });

      const text = await res.text().catch(() => '');
      console.log('[box] HTTP status from ESP8266:', res.status);
      console.log('[box] Raw response body from ESP8266:', text);

      if (!res.ok) {
        console.error('[box] ESP8266 error response body:', text);
        throw new Error(`ESP8266 responded with ${res.status}`);
      }

      // Try to parse JSON and extract a human-friendly message, e.g. "Medicine taken".
      let message: string | null = null;
      let takenByIr: boolean | null = null;
      try {
        if (text) {
          const data = JSON.parse(text);
          if (typeof data?.taken === 'boolean') {
            takenByIr = data.taken;
            console.log('[box] IR taken flag from ESP8266:', takenByIr);
          }
          if (typeof data?.message === 'string') {
            message = data.message;
          } else if (typeof data?.status === 'string' && typeof data?.taken !== 'boolean') {
            // Only treat generic status text as a user-facing message when
            // there is no IR-based taken flag. Otherwise we prefer our own
            // descriptive copy instead of showing "ok".
            message = data.status;
          }
        }
      } catch (parseErr) {
        console.warn('[box] Failed to parse ESP8266 JSON response:', parseErr);
      }

      // If the IR sensor on the ESP reports that something was detected or not
      // detected during the 15s window, show a question inside the app popup
      // (no browser alert/confirm) and wait for the user to choose.
      if (takenByIr === true) {
        setIntakeMessage(
          message || 'IR sensor detected medicine removal. Close the box and move to the next medicine?'
        );
        setOpenBoxStatus('question');
        setIntakeQuestionType('taken');
        setIsOpeningBox(false);
        return;
      } else if (takenByIr === false) {
        setIntakeMessage(
          message || 'Dose not taken. Shall we close the box?'
        );
        setOpenBoxStatus('question');
        setIntakeQuestionType('not-taken');
        setIsOpeningBox(false);
        return;
      }

      setIntakeMessage(message || 'Medicine taken');
      setOpenBoxStatus('success');

      // Mark the next upcoming dose (within ±1 hour) as taken in the UI
      if (nextUntaken) {
        setTakenDoseIds((prev) => (prev.includes(nextUntaken.id) ? prev : [...prev, nextUntaken.id]));

        // Inform backend so phone-call reminders stop for this dose today
        try {
          if (!backendToken) {
            console.warn('[reminders] Skipping backend dose-taken notification because backendToken is missing');
          } else {
            await fetch(`${apiBaseUrl}/api/reminders/dose-taken`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${backendToken}`,
              },
              body: JSON.stringify({
                medicineName: nextUntaken.name,
                time: nextUntaken.timeLabel,
              }),
            });
          }
        } catch (err) {
          console.warn('[reminders] Failed to notify backend about taken dose', err);
        }
      }
    } catch (err) {
      console.error('[box] Failed to send open-box command to ESP8266', err);
      setOpenBoxStatus('error');
    } finally {
      setIsOpeningBox(false);
    }
  };

  const handleKnowmedAsk = async () => {
    const question = knowmedQuestion.trim();
    if (!question) return;

    if (!backendToken) {
      setKnowmedError('You are not authenticated with the device backend. Please sign in again.');
      return;
    }

    // Abort any in-flight request before starting a new one
    if (knowmedAbortRef.current) {
      knowmedAbortRef.current.abort();
      knowmedAbortRef.current = null;
    }

    setKnowmedLoading(true);
    setKnowmedError(null);
    setKnowmedAnswer('');
    const assistantId = `assistant-${Date.now()}`;
    setKnowmedMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: question },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setKnowmedQuestion('');
    try {
      const controller = new AbortController();
      knowmedAbortRef.current = controller;

      const res = await fetch(`${apiBaseUrl}/api/knowmed-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${backendToken ?? ''}`,
        },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        console.error('[knowmed] Streaming backend responded with', res.status, await res.text());
        throw new Error('Backend streaming error');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setKnowmedAnswer((prev) => prev + chunk);
          setKnowmedMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk }
                : m
            )
          );
        }
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        console.log('[knowmed] Streaming aborted by user');
      } else {
        console.error('[knowmed] Failed to get streaming answer', err);
        setKnowmedError('Failed to get answer from KnowMed. Ensure the backend and Ollama are running.');
      }
    } finally {
      knowmedAbortRef.current = null;
      setKnowmedLoading(false);
    }
  };

  const handleKnowmedStop = () => {
    if (knowmedAbortRef.current) {
      knowmedAbortRef.current.abort();
      knowmedAbortRef.current = null;
    }
    setKnowmedLoading(false);
  };

  const handleSaveMedication = async () => {
    if (!user) return;

    if (!medicineName.trim()) {
      alert('Please enter a medicine name.');
      return;
    }

    const compartmentRaw = medicineCompartment.trim();
    if (compartmentRaw) {
      const compartmentNum = Number(compartmentRaw);
      if (!Number.isInteger(compartmentNum) || compartmentNum < 1 || compartmentNum > 3) {
        alert('Compartment number must be 1, 2, or 3 (you currently have 3 compartments in the box).');
        return;
      }
    }

    setPrepSaveStatus('saving');

    const totalDosesNum = medicineTotalDoses ? Number(medicineTotalDoses) : 0;
    const createdAt = new Date().toISOString();
    const isEditing = !!editingMedicineId;
    const medicationId = isEditing
      ? editingMedicineId!
      : ((globalThis.crypto as any)?.randomUUID
          ? (globalThis.crypto as any).randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Payload shaped to match firestore.rules isValidMedication for top-level /medications
    const firestorePayload = {
      id: medicationId,
      userId: user.uid,
      name: medicineName.trim(),
      dosage: medicineDosage.trim(),
      compartment: compartmentRaw,
      frequency: prepFrequency,
      times: prepTimes,
      remainingDoses: totalDosesNum,
      totalDoses: totalDosesNum,
      createdAt,
    };

    try {
      // Save in Firestore in top-level medications collection
      await setDoc(doc(collection(db, 'medications'), medicationId), firestorePayload);

      // Also save locally via backend only when creating a new medicine
      if (!isEditing) {
        try {
          await fetch(`${apiBaseUrl}/api/medicines`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(backendToken ? { Authorization: `Bearer ${backendToken}` } : {}),
            },
            body: JSON.stringify({
              name: firestorePayload.name,
              dosage: firestorePayload.dosage,
              compartment: firestorePayload.compartment,
              totalDoses: firestorePayload.totalDoses,
              frequency: firestorePayload.frequency,
              days: prepDays,
              times: prepTimes,
            }),
          });
        } catch (backendErr) {
          console.warn('[medicines] Failed to sync to local backend', backendErr);
        }
      }

      // Update local list so view/manage reflect the latest values
      setMedicines((prev) => {
        const basic = {
          id: medicationId,
          name: firestorePayload.name,
          dosage: firestorePayload.dosage,
          compartment: firestorePayload.compartment,
          frequency: firestorePayload.frequency,
          times: firestorePayload.times,
        };
        if (isEditing) {
          return prev.map((m) => (m.id === medicationId ? basic : m));
        }
        return [...prev, basic];
      });

      setPrepSaveStatus('saved');
      setShowMedicineSaved(true);
      setEditingMedicineId(null);
    } catch (err) {
      console.error('[medicines] Failed to save medicine to Firestore', err);
      setPrepSaveStatus('error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const activeSection = location.pathname.substring(1) || 'dashboard';
  // Helper to compute medicines that need to be taken within ±1 hour of the current time
  const computeUpcomingDoses = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const doses: { id: string; name: string; dosage: string; timeLabel: string; minutesDiff: number; compartment?: string }[] = [];

    for (const m of medicines) {
      for (const t of m.times) {
        const [hStr, mStr] = t.split(':');
        const hh = Number(hStr);
        const mm = Number(mStr);
        if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
        const doseMinutes = hh * 60 + mm;
        const diff = doseMinutes - currentMinutes;
        if (Math.abs(diff) <= 60) {
          doses.push({
            id: `${m.id}-${t}`,
            name: m.name,
            dosage: m.dosage || 'Dose',
            timeLabel: t,
            minutesDiff: diff,
            compartment: m.compartment || '',
          });
        }
      }
    }

    doses.sort((a, b) => a.minutesDiff - b.minutesDiff);
    return doses;
  };

  const upcomingDoses = computeUpcomingDoses();
  const upcomingUntakenDoses = upcomingDoses.filter((d) => !takenDoseIds.includes(d.id));
  const hasTakenInWindow = upcomingDoses.some((d) => takenDoseIds.includes(d.id));
  const primaryDoseButtonLabel = hasTakenInWindow && upcomingUntakenDoses.length > 0
    ? 'Take Next Medicine'
    : 'Confirm Intake';

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-screen flex flex-col items-center justify-center p-6"
          >
            <div className="w-full max-w-[400px] space-y-8">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white mb-4 shadow-lg shadow-emerald-200">
                  <Pill className="h-8 w-8" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Smart Medicine Box
                </h1>
                <p className="text-slate-500">
                  {authMode === 'login' 
                    ? "Welcome back! Please enter your details." 
                    : "Create an account to start managing your health."}
                </p>
              </div>

              <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
                {authError && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-6 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3 text-red-600 text-sm"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{authError}</p>
                  </motion.div>
                )}

                {authMode === 'login' ? (
                  <LoginForm
                    apiBaseUrl={apiBaseUrl}
                    onToggle={() => setAuthMode('signup')}
                    setError={setAuthError}
                    onSuccess={onAuthSuccess}
                    setBackendToken={(token) => {
                      setBackendToken(token);
                      try {
                        if (token) {
                          window.localStorage.setItem('backendToken', token);
                        } else {
                          window.localStorage.removeItem('backendToken');
                        }
                      } catch {}
                    }}
                  />
                ) : (
                  <SignupForm
                    apiBaseUrl={apiBaseUrl}
                    onToggle={() => setAuthMode('login')}
                    setError={setAuthError}
                    onSuccess={onSignupSuccess}
                    setBackendToken={(token) => {
                      setBackendToken(token);
                      try {
                        if (token) {
                          window.localStorage.setItem('backendToken', token);
                        } else {
                          window.localStorage.removeItem('backendToken');
                        }
                      } catch {}
                    }}
                  />
                )}
              </div>

              <p className="text-center text-sm text-slate-400">
                &copy; {new Date().getFullYear()} Smart Medicine Box. All rights reserved.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen flex bg-slate-50"
          >
            <GreetingModal 
              isOpen={showGreeting} 
              onClose={() => setShowGreeting(false)} 
              name={user.displayName || 'Friend'} 
            />

            <MedicineSavedModal
              isOpen={showMedicineSaved}
              onClose={() => setShowMedicineSaved(false)}
              medicineName={medicineName.trim() || 'Medicine'}
            />

            <PairingModal
              isOpen={isPairingModalOpen}
              isLoading={isPairingInProgress}
              onClose={() => setIsPairingModalOpen(false)}
            />

            {/* Sidebar */}
            <aside 
              className={cn(
                "fixed inset-y-0 left-0 z-30 bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col",
                isSidebarOpen
                  ? "w-64 translate-x-0"
                  : "w-64 -translate-x-full lg:translate-x-0 lg:w-20"
              )}
            >
              <div className="h-20 flex items-center px-7 border-b border-slate-100">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
                    <Pill className="h-6 w-6" />
                  </div>
                  {isSidebarOpen && (
                    <span className="font-bold text-xl tracking-tight whitespace-nowrap">SmartBox</span>
                  )}
                </div>
              </div>

              <nav className="flex-1 py-6 px-3 space-y-1">
                <SidebarItem 
                  icon={<LayoutDashboard className="h-5 w-5" />} 
                  label="Dashboard" 
                  active={activeSection === 'dashboard'} 
                  collapsed={!isSidebarOpen}
                  onClick={() => navigate('/dashboard')}
                />
                <SidebarItem 
                  icon={<PackagePlus className="h-5 w-5" />} 
                  label="Medicine Prep" 
                  active={activeSection === 'prep'} 
                  collapsed={!isSidebarOpen}
                  onClick={() => navigate('/prep')}
                />
                <SidebarItem 
                  icon={<CheckCircle2 className="h-5 w-5" />} 
                  label="Take Medicine" 
                  active={activeSection === 'take'} 
                  collapsed={!isSidebarOpen}
                  onClick={() => navigate('/take')}
                />
                <SidebarItem 
                  icon={<Calendar className="h-5 w-5" />} 
                  label="View History" 
                  active={activeSection === 'history'} 
                  collapsed={!isSidebarOpen}
                  onClick={() => navigate('/history')}
                />
                <SidebarItem 
                  icon={<MessageCircle className="h-5 w-5" />} 
                  label="KnowMed" 
                  active={activeSection === 'knowmed'} 
                  collapsed={!isSidebarOpen}
                  onClick={() => navigate('/knowmed')}
                />
                <SidebarItem
                  icon={<Wifi className="h-5 w-5" />}
                  label="Wi‑Fi Setup"
                  active={activeSection === 'device-wifi-setup'}
                  collapsed={!isSidebarOpen}
                  onClick={() => navigate('/device-wifi-setup')}
                />
              </nav>

              <div className="p-4 border-t border-slate-100">
                <button 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="w-full flex items-center justify-center h-10 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {isSidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </aside>

            {/* Main Content */}
            <div className={cn(
              "flex-1 flex flex-col transition-all duration-300",
              isSidebarOpen ? "pl-0 lg:pl-64" : "pl-0 lg:pl-20"
            )}>
              <header className="h-auto min-h-[72px] border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 px-4 sm:px-7 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen((prev) => !prev)}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:hidden"
                    aria-label={isSidebarOpen ? 'Collapse navigation' : 'Expand navigation'}
                  >
                    {isSidebarOpen ? (
                      <ChevronLeft className="h-5 w-5" />
                    ) : (
                      <Menu className="h-5 w-5" />
                    )}
                  </button>
                  {(() => {
                    const sectionTitleMap: Record<string, string> = {
                      dashboard: 'Dashboard',
                      prep: 'Medicine Prep',
                      take: 'Take Medicine',
                      history: 'View History',
                      knowmed: 'Medicine Assistant',
                      'device-wifi-setup': 'Wi‑Fi Setup',
                    };
                    const title = sectionTitleMap[activeSection] || activeSection.replace('-', ' ');
                    return (
                      <div className="min-w-0">
                        <h2 className="font-bold text-lg sm:text-2xl capitalize truncate">{title}</h2>
                        {activeSection === 'knowmed' && (
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            Ask safe, general questions about your medicines.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                  </button>
                  <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <div className="text-right hidden sm:block max-w-[180px]">
                      <p className="text-sm font-semibold leading-none truncate">{user.displayName || 'User'}</p>
                      <p className="text-xs text-slate-400 mt-1 truncate">{user.email}</p>
                    </div>
                    <Button variant="ghost" className="p-2 h-auto" onClick={handleLogout}>
                      <LogOut className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </header>

              <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
                <AnimatePresence mode="wait">
                  <Routes location={location}>
                    <Route path="/dashboard" element={
                      <motion.div
                        key="dashboard-content"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="space-y-8"
                      >
                        <section className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h2 className="text-2xl font-bold text-slate-900">Your Schedule</h2>
                              <p className="text-slate-500">Don't forget your doses today.</p>
                            </div>
                            <Button className="rounded-full" onClick={() => navigate('/prep')}>
                              <Plus className="h-4 w-4 mr-2" />
                              Add Medicine
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <StatCard title="Total Medicines" value="4" icon={<Pill className="h-5 w-5" />} color="emerald" />
                            <StatCard title="Doses Today" value="8" icon={<Calendar className="h-5 w-5" />} color="blue" />
                            <StatCard title="Remaining" value="75%" icon={<Bell className="h-5 w-5" />} color="orange" />
                          </div>
                          <div className="mt-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                            <h3 className="font-semibold text-base mb-2">Last 20 Dose Readings</h3>
                            <p className="text-xs text-slate-500 mb-3">
                              Time of day for your last 20 recorded intakes (updates every few seconds).
                            </p>
                            <RecentIntakeChart readings={recentIntakes} />
                          </div>
                        </section>

                        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                          <div className="lg:col-span-2 space-y-4">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                              Upcoming Doses
                              <span className="text-xs font-normal bg-slate-100 px-2 py-0.5 rounded-full text-slate-500">Today</span>
                            </h3>
                            <div className="space-y-3">
                              <DoseItem name="Paracetamol" time="08:00 AM" dosage="500mg" status="taken" />
                              <DoseItem name="Vitamin D3" time="12:30 PM" dosage="1000 IU" status="upcoming" />
                              <DoseItem name="Omega 3" time="07:00 PM" dosage="1000mg" status="upcoming" />
                              <DoseItem name="Magnesium" time="09:30 PM" dosage="200mg" status="upcoming" />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h3 className="font-bold text-lg">Health Insights</h3>
                            <div className="bg-emerald-600 rounded-3xl p-6 text-white space-y-4 relative overflow-hidden shadow-lg shadow-emerald-200">
                              <div className="relative z-10">
                                <p className="text-emerald-100 text-sm font-medium uppercase tracking-wider">Adherence Score</p>
                                <p className="text-5xl font-bold mt-1">94%</p>
                                <p className="text-emerald-100 text-sm mt-4 leading-relaxed">
                                  You're doing great! You've only missed 2 doses in the last 30 days.
                                </p>
                              </div>
                              <div className="absolute -right-4 -bottom-4 opacity-20 transform rotate-12">
                                <Pill className="w-32 h-32" />
                              </div>
                            </div>
                          </div>
                        </section>
                      </motion.div>
                    } />

                    <Route path="/pair" element={
                      <motion.div
                        key="pair-content"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="max-w-xl mx-auto space-y-6"
                      >
                        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-5 text-center">
                          <h2 className="text-2xl font-bold text-slate-900">Pair your device</h2>
                          <div className="space-y-2 text-left">
                            <Input
                              label="Device Token"
                              placeholder="Enter the code printed on your box"
                              value={deviceToken}
                              onChange={(e) => setDeviceToken(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">
                              This code uniquely identifies your Smart Medicine Box. It is also stored with your account so it stays after refresh.
                            </p>
                          </div>
                          <p className="text-sm text-slate-500">
                            Make sure your Smart Medicine Box is powered on and connected to the same Wi‑Fi network. Then press the pairing
                            button on the box so that it sets its D0 pin HIGH, and tap the button below to complete pairing.
                          </p>

                          <div className="text-left text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-3">
                            <p className="font-semibold mb-1">First time setup?</p>
                            <p>
                              If your box is not yet connected to your home Wi‑Fi, long‑press the D4 button until its hotspot appears,
                              then go to the Wi‑Fi setup page in this app to send your Wi‑Fi name and password.
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              className="mt-2 w-full h-9 text-xs"
                              onClick={() => {
                                navigate('/device-wifi-setup');
                              }}
                            >
                              Open Wi‑Fi setup
                            </Button>
                          </div>

                          <Button
                            className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700"
                            onClick={async () => {
                              const trimmedToken = deviceToken.trim();
                              if (!trimmedToken) {
                                alert('Please enter your device token first.');
                                return;
                              }
                              try {
                                setIsPairingModalOpen(true);
                                setIsPairingInProgress(true);
                                // Directly call the ESP8266 pairing endpoint via its IP on your Wi‑Fi network
                                const ESP_BASE_URL = 'http://10.36.109.123';
                                const url = `${ESP_BASE_URL}/pair?token=${encodeURIComponent(trimmedToken)}`;
                                console.log('[pair] Sending direct pairing request to ESP8266 at', url);

                                const res = await fetch(url, {
                                  method: 'POST',
                                });

                                const text = await res.text().catch(() => '');
                                if (!res.ok) {
                                  console.error('[pair] ESP8266 pairing failed', res.status, text);
                                  alert('Pairing failed. Please ensure the box is on, connected, and pairing is enabled.');
                                  return;
                                }

                                let ok = false;
                                try {
                                  const data = text ? JSON.parse(text) : null;
                                  ok = !!data?.paired;
                                } catch {
                                  ok = false;
                                }
                                if (!ok) {
                                  alert('Device did not confirm pairing. Please check the token and try again.');
                                  return;
                                }

                                // Mark paired in Firestore so future logins can go directly to dashboard.
                                // If Firestore is unreachable (e.g. DNS / internet issues), we still treat
                                // the device as paired locally so the user can continue.
                                if (user) {
                                  try {
                                    await setDoc(
                                      doc(db, 'users', user.uid),
                                      { devicePaired: true, deviceToken: trimmedToken },
                                      { merge: true },
                                    );
                                  } catch (firestoreErr) {
                                    console.warn('[pair] Failed to persist pairing to Firestore (will continue anyway)', firestoreErr);
                                  }

                                  setDevicePaired(true);
                                  setDeviceToken(trimmedToken);
                                  try {
                                    window.localStorage.setItem('deviceToken', trimmedToken);
                                    window.localStorage.setItem('devicePaired', 'true');
                                  } catch {}

                                  // Also persist pairing status in the local backend DB so we can
                                  // skip the pairing step on future logins even if Firestore is offline.
                                  if (user.email) {
                                    try {
                                      if (!backendToken) {
                                        console.warn('[pair] Skipping backend pairing sync because backendToken is missing');
                                      } else {
                                        await fetch(`${apiBaseUrl}/api/device/mark-paired`, {
                                          method: 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                            Authorization: `Bearer ${backendToken}`,
                                          },
                                          body: JSON.stringify({
                                            deviceToken: trimmedToken,
                                          }),
                                        });
                                      }
                                    } catch (backendErr) {
                                      console.warn('[pair] Failed to sync pairing status to backend DB', backendErr);
                                    }
                                  }
                                }

                                alert('Device paired successfully!');
                                navigate('/dashboard');
                              } catch (err) {
                                console.error('[pair] Failed to pair with device via backend', err);
                                alert('Could not reach the backend or device. Check Wi‑Fi, server, and IP address and try again.');
                              } finally {
                                setIsPairingInProgress(false);
                                setTimeout(() => setIsPairingModalOpen(false), 600);
                              }
                            }}
                          >
                            Pair with device
                          </Button>
                        </div>
                      </motion.div>
                    } />

                    <Route path="/device-wifi-setup" element={<DeviceWifiSetupPage />} />

                    <Route
                      path="/history"
                      element={
                        <HistoryPage
                          apiBaseUrl={apiBaseUrl}
                          backendToken={backendToken}
                        />
                      }
                    />

                    <Route path="/prep" element={
                      <motion.div
                        key="prep-content"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="space-y-6"
                      >
                        {prepView === 'menu' && (
                          <div className="max-w-3xl mx-auto grid gap-6 sm:grid-cols-3">
                            <button
                              onClick={() => setPrepView('load')}
                              className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col items-start gap-3"
                            >
                              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <PackagePlus className="h-6 w-6" />
                              </div>
                              <h2 className="text-xl font-bold">Load Medicine</h2>
                              <p className="text-sm text-slate-500">Add new medicines to your smart box and configure schedules.</p>
                            </button>

                            <button
                              onClick={() => setPrepView('view')}
                              className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col items-start gap-3"
                            >
                              <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center">
                                <LayoutDashboard className="h-6 w-6" />
                              </div>
                              <h2 className="text-xl font-bold">View Medicines</h2>
                              <p className="text-sm text-slate-500">See the medicines you have loaded and their basic details.</p>
                            </button>

                            <button
                              onClick={() => setPrepView('manage')}
                              className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col items-start gap-3"
                            >
                              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                <Settings className="h-6 w-6" />
                              </div>
                              <h2 className="text-xl font-bold">Edit / Delete</h2>
                              <p className="text-sm text-slate-500">Update schedules or remove medicines you no longer need.</p>
                            </button>
                          </div>
                        )}

                        {prepView === 'load' && (
                          <div className="max-w-2xl mx-auto bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-2xl font-bold">{editingMedicineId ? 'Edit Medication' : 'Prepare Medication'}</h2>
                                <p className="text-slate-500">{editingMedicineId ? 'Update this medicine\'s details and schedule.' : 'Add a new medicine to your smart box and set the schedule.'}</p>
                              </div>
                              <Button variant="ghost" className="h-9 px-3" onClick={() => setPrepView('menu')}>
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Back
                              </Button>
                            </div>

                            <div className="space-y-6">
                              <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-slate-700 tracking-wide uppercase">Medicine details</h3>
                                <Input
                                  label="Medicine Name"
                                  placeholder="e.g. Paracetamol"
                                  icon={<Pill className="h-4 w-4" />}
                                  value={medicineName}
                                  onChange={(e) => setMedicineName(e.target.value)}
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                  <Input
                                    label="Dosage"
                                    placeholder="e.g. 500mg"
                                    value={medicineDosage}
                                    onChange={(e) => setMedicineDosage(e.target.value)}
                                  />
                                  <Input
                                    label="Total Doses"
                                    type="number"
                                    placeholder="30"
                                    value={medicineTotalDoses}
                                    onChange={(e) => setMedicineTotalDoses(e.target.value)}
                                  />
                                  <Input
                                    label="Compartment No."
                                    type="number"
                                    placeholder="e.g. 1"
                                    value={medicineCompartment}
                                    onChange={(e) => setMedicineCompartment(e.target.value)}
                                  />
                                </div>
                              </div>

                              <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-slate-700 tracking-wide uppercase">Schedule</h3>
                                <label className="text-xs font-semibold text-slate-500">Frequency</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {['Daily', 'Weekly', 'As needed', 'Custom'].map((f) => (
                                    <button 
                                      key={f} 
                                      onClick={() => setPrepFrequency(f)}
                                      className={cn(
                                        "px-4 py-2 rounded-xl border text-sm transition-all",
                                        prepFrequency === f ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 hover:border-emerald-500 hover:bg-emerald-50"
                                      )}
                                    >
                                      {f}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {prepFrequency === 'Weekly' && (
                                <motion.div 
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  className="space-y-3"
                                >
                                  <label className="text-xs font-semibold text-slate-500">Select days</label>
                                  <div className="flex flex-wrap gap-2">
                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                                      <button
                                        key={day}
                                        onClick={() => {
                                          if (prepDays.includes(day)) {
                                            setPrepDays(prepDays.filter(d => d !== day));
                                          } else {
                                            setPrepDays([...prepDays, day]);
                                          }
                                        }}
                                        className={cn(
                                          "w-10 h-10 rounded-full border text-xs font-bold transition-all",
                                          prepDays.includes(day)
                                            ? "bg-emerald-600 border-emerald-600 text-white"
                                            : "border-slate-200 text-slate-500 hover:border-emerald-500 hover:text-emerald-600"
                                        )}
                                      >
                                        {day}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}

                              <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-700 tracking-wide uppercase">Reminder times</h3>
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-semibold text-slate-500">Times when this medicine should be taken</label>
                                  <button 
                                    onClick={() => setPrepTimes([...prepTimes, '12:00'])}
                                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                                  >
                                    <Plus className="h-3 w-3" /> Add Time
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {prepTimes.map((time, index) => (
                                    <div key={index} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                      <Clock className="h-4 w-4 text-slate-400 ml-1" />
                                      <input 
                                        type="time" 
                                        value={time}
                                        onChange={(e) => {
                                          const newTimes = [...prepTimes];
                                          newTimes[index] = e.target.value;
                                          setPrepTimes(newTimes);
                                        }}
                                        className="bg-transparent border-none text-sm font-medium focus:ring-0 w-full"
                                      />
                                      {prepTimes.length > 1 && (
                                        <button 
                                          onClick={() => setPrepTimes(prepTimes.filter((_, i) => i !== index))}
                                          className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <Button
                                className="w-full h-12 rounded-2xl"
                                onClick={handleSaveMedication}
                                isLoading={prepSaveStatus === 'saving'}
                              >
                                {editingMedicineId ? (prepSaveStatus === 'saved' ? 'Updated' : 'Update Medication') : (prepSaveStatus === 'saved' ? 'Saved' : 'Save Medication')}
                              </Button>
                              {prepSaveStatus === 'error' && (
                                <p className="text-sm text-red-600 font-medium mt-2">
                                  Failed to save medicine. Please try again.
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {prepView === 'view' && (
                          <div className="max-w-3xl mx-auto bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-2xl font-bold">Your Medicines</h2>
                                <p className="text-slate-500">Medicines you have added to your schedule.</p>
                              </div>
                              <Button variant="ghost" className="h-9 px-3" onClick={() => setPrepView('menu')}>
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Back
                              </Button>
                            </div>
                            {medicinesLoading && (
                              <p className="text-sm text-slate-500">Loading medicines…</p>
                            )}
                            {medicinesError && (
                              <p className="text-sm text-red-600">{medicinesError}</p>
                            )}
                            {!medicinesLoading && !medicinesError && medicines.length === 0 && (
                              <p className="text-sm text-slate-500">No medicines added yet.</p>
                            )}
                            {!medicinesLoading && !medicinesError && medicines.length > 0 && (
                              <div className="space-y-3">
                                {medicines.map((m) => (
                                  <React.Fragment key={m.id}>
                                    <DoseItem
                                      name={m.name}
                                      dosage={m.dosage || 'Dose'}
                                      time={m.times[0] ? m.times[0] : m.frequency || '—'}
                                      status="upcoming"
                                    />
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {prepView === 'manage' && (
                          <div className="max-w-3xl mx-auto bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <h2 className="text-2xl font-bold">Manage Medicines</h2>
                                <p className="text-slate-500">Edit schedules or delete medicines you have loaded.</p>
                              </div>
                              <Button variant="ghost" className="h-9 px-3" onClick={() => setPrepView('menu')}>
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                Back
                              </Button>
                            </div>

                            {medicinesLoading && (
                              <p className="text-sm text-slate-500">Loading medicines…</p>
                            )}
                            {medicinesError && (
                              <p className="text-sm text-red-600">{medicinesError}</p>
                            )}
                            {!medicinesLoading && !medicinesError && medicines.length === 0 && (
                              <p className="text-sm text-slate-500">No medicines to manage yet.</p>
                            )}
                            {!medicinesLoading && !medicinesError && medicines.length > 0 && (
                              <div className="space-y-3">
                                {medicines.map((m) => (
                                  <div
                                    key={m.id}
                                    className="flex items-center justify-between py-3 px-4 rounded-2xl border border-slate-100 bg-slate-50"
                                  >
                                    <div>
                                      <p className="font-semibold text-sm">{m.name}</p>
                                      <p className="text-xs text-slate-500">
                                        {m.dosage || 'Dose'}
                                        {m.compartment ? ` • Compartment ${m.compartment}` : ''}
                                        {' • '}{m.frequency || 'Custom'} •{' '}
                                        {m.times && m.times.length ? m.times.join(', ') : 'No times set'}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="secondary"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => {
                                          setEditingMedicineId(m.id);
                                          setMedicineName(m.name);
                                          setMedicineDosage(m.dosage || '');
                                          setMedicineCompartment(m.compartment || '');
                                          setPrepFrequency(m.frequency || 'Daily');
                                          setPrepTimes(m.times && m.times.length ? m.times : ['08:00']);
                                          setPrepSaveStatus('idle');
                                          setPrepView('load');
                                        }}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        className="h-8 px-3 text-xs text-red-600 hover:text-red-700"
                                        onClick={async () => {
                                          if (!window.confirm('Delete this medicine permanently?')) return;
                                          try {
                                            await deleteDoc(doc(db, 'medications', m.id));
                                            setMedicines((prev) => prev.filter((x) => x.id !== m.id));
                                          } catch (err) {
                                            console.error('[medicines] Failed to delete', err);
                                            alert('Failed to delete medicine. Please try again.');
                                          }
                                        }}
                                      >
                                        Delete
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    } />

                    <Route path="/take" element={
                      <motion.div
                        key="take-content"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="space-y-6"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-6">
                            <div className="w-24 h-24 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center animate-pulse">
                              <Pill className="h-12 w-12" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold">Take your medicine</h3>
                              {upcomingUntakenDoses.length > 0 ? (
                                <p className="text-slate-500">
                                  Next up: {upcomingUntakenDoses[0].name} at {upcomingUntakenDoses[0].timeLabel}
                                  {upcomingUntakenDoses[0].compartment && (
                                    <span className="block text-xs text-slate-500 mt-1">
                                      Compartment {upcomingUntakenDoses[0].compartment}
                                    </span>
                                  )}
                                </p>
                              ) : (
                                <p className="text-slate-500">You have no medicines scheduled within ±1 hour, or all are taken.</p>
                              )}
                            </div>
                            <Button
                              className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700"
                              onClick={() => setIsTakeModalOpen(true)}
                              isLoading={isOpeningBox}
                            >
                              {isOpeningBox ? 'Opening…' : 'Take Medicine'}
                            </Button>
                            {openBoxStatus === 'success' && (
                              <p className="text-sm text-emerald-600 font-medium">
                                {intakeMessage || 'Command sent to box successfully.'}
                              </p>
                            )}
                            {openBoxStatus === 'error' && (
                              <p className="text-sm text-red-600 font-medium">
                                Failed to contact the box. Check Wi‑Fi / IP and try again.
                              </p>
                            )}
                          </div>

                          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                            <h3 className="font-bold text-lg">Doses within ±1 hour</h3>
                            <div className="space-y-4">
                              {upcomingDoses.length === 0 && (
                                <p className="text-sm text-slate-500">No medicines scheduled within ±1 hour.</p>
                              )}
                              {upcomingDoses.length > 0 && upcomingDoses.map((dose) => (
                                <div key={dose.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                                  <div>
                                    <p className="font-semibold text-sm">{dose.name}</p>
                                    <p className="text-xs text-slate-400">
                                      At {dose.timeLabel}
                                      {dose.compartment && (
                                        <span className="ml-1">• Compartment {dose.compartment}</span>
                                      )}
                                    </p>
                                  </div>
                                  <span
                                    className={cn(
                                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                                      takenDoseIds.includes(dose.id)
                                        ? "bg-emerald-50 text-emerald-600"
                                        : "bg-blue-50 text-blue-600"
                                    )}
                                  >
                                    {takenDoseIds.includes(dose.id) ? 'Taken' : 'Upcoming'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {isTakeModalOpen && (
                          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
                            <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold">Confirm your dose</h3>
                                <button
                                  onClick={() => setIsTakeModalOpen(false)}
                                  className="text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  ✕
                                </button>
                              </div>

                              {upcomingUntakenDoses.length > 0 ? (
                                <>
                                  <p className="text-sm text-slate-600">
                                    You are about to take:
                                  </p>
                                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1 text-left">
                                    <p className="font-semibold text-slate-900">
                                      {upcomingUntakenDoses[0].name}
                                    </p>
                                    <p className="text-sm text-slate-600">
                                      Take <span className="font-semibold">1 pill</span>
                                      {upcomingUntakenDoses[0].dosage && (
                                        <span> 
                                          {' '}(
                                          <span className="font-semibold">{upcomingUntakenDoses[0].dosage}</span>
                                          )
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Scheduled for {upcomingUntakenDoses[0].timeLabel}
                                      {upcomingUntakenDoses[0].compartment && (
                                        <span className="ml-1">• Compartment {upcomingUntakenDoses[0].compartment}</span>
                                      )}
                                    </p>
                                  </div>

                                  <Button
                                    className="w-full mt-2"
                                    onClick={() => {
                                      handleConfirmIntake();
                                    }}
                                    isLoading={isOpeningBox}
                                  >
                                    {isOpeningBox ? 'Opening Box…' : 'Open Box'}
                                  </Button>
                                  {openBoxStatus === 'question' && intakeQuestionType === 'not-taken' && (
                                    <div className="w-full mt-3 text-sm text-slate-700 space-y-2 text-center">
                                      <p>{intakeMessage || 'Dose not taken. Shall we close the box?'}</p>
                                      <div className="flex justify-center gap-3 mt-2">
                                        <Button
                                          className="h-9 px-4 rounded-2xl text-xs"
                                          onClick={handleIntakeQuestionYes}
                                        >
                                          Yes, close
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          className="h-9 px-4 rounded-2xl text-xs"
                                          onClick={handleIntakeQuestionNo}
                                        >
                                          No
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                  {openBoxStatus === 'question' && intakeQuestionType === 'taken' && (
                                    <div className="w-full mt-3 text-sm text-slate-700 space-y-2 text-center">
                                      <p>
                                        {intakeMessage ||
                                          'IR sensor detected medicine removal. Close the box and move to the next medicine?'}
                                      </p>
                                      <div className="flex justify-center gap-3 mt-2">
                                        <Button
                                          className="h-9 px-4 rounded-2xl text-xs"
                                          onClick={handleIntakeQuestionYes}
                                        >
                                          Yes, continue
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          className="h-9 px-4 rounded-2xl text-xs"
                                          onClick={handleIntakeQuestionNo}
                                        >
                                          No
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                  {openBoxStatus === 'success' && (
                                    <p className="w-full text-sm text-emerald-700 font-medium mt-2 text-center">
                                      Dose recorded. You can press <span className="font-semibold">Open Box</span> again when you are ready for the next medicine.
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <p className="text-sm text-slate-600">
                                    There are no medicines scheduled within the next hour. All doses in this window are taken.
                                  </p>
                                  <Button className="w-full" onClick={() => setIsTakeModalOpen(false)}>
                                    Close
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    } />

                    <Route path="/knowmed" element={
                      <motion.div
                        key="knowmed-content"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-6"
                      >
                        {/* Center / main: chat */}
                        <div className="bg-white/90 backdrop-blur rounded-[28px] border border-slate-100 shadow-sm p-5 flex flex-col h-[460px] sm:h-[560px]">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Chat</p>
                              <p className="text-sm text-slate-500">Ask a question about any medicine.</p>
                            </div>
                          </div>

                          <div className="flex-1 min-h-0 mb-3 rounded-2xl border border-slate-100 bg-slate-50/70 overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                              {knowmedMessages.length === 0 && (
                                <div className="text-xs text-slate-500 bg-white/80 border border-dashed border-slate-200 rounded-2xl p-3">
                                  Try asking:
                                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                                    <li>"What is paracetamol used for?"</li>
                                    <li>"What are common side effects of metformin?"</li>
                                    <li>"Can you explain these instructions in simple words?"</li>
                                  </ul>
                                </div>
                              )}
                              {knowmedMessages.map((msg) => (
                                <div
                                  key={msg.id}
                                  className={cn(
                                    "flex w-full",
                                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "max-w-[80%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap shadow-sm",
                                      msg.role === 'user'
                                        ? 'bg-emerald-600 text-white rounded-br-sm'
                                        : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
                                    )}
                                  >
                                    {msg.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="h-px bg-slate-100" />
                            <div className="p-2 flex items-end gap-2 bg-white/60">
                              <textarea
                                value={knowmedQuestion}
                                onChange={(e) => setKnowmedQuestion(e.target.value)}
                                rows={2}
                                className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                placeholder="Type your question about a medicine…"
                              />
                              <div className="flex flex-col gap-2">
                                <Button
                                  variant="secondary"
                                  className="h-9 px-3 rounded-2xl text-xs"
                                  onClick={handleKnowmedStop}
                                  disabled={!knowmedLoading}
                                >
                                  Stop
                                </Button>
                                <Button
                                  className="h-9 px-4 rounded-2xl text-xs flex items-center gap-1"
                                  onClick={handleKnowmedAsk}
                                  isLoading={knowmedLoading}
                                  disabled={!knowmedQuestion.trim() || knowmedLoading}
                                >
                                  <span>Ask</span>
                                  <ArrowRight className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          {knowmedError && (
                            <p className="mt-1 text-xs text-red-600 font-medium">{knowmedError}</p>
                          )}
                        </div>

                        {/* Side: assistant summary / info */}
                        <div className="bg-white/90 backdrop-blur rounded-[28px] border border-slate-100 shadow-sm p-6 flex flex-col gap-5 lg:max-h-[560px]">
                          <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                              <MessageCircle className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-base font-semibold text-slate-900">KnowMed assistant</h3>
                              <p className="text-xs text-slate-500">
                                Quick overview of what this assistant can and cannot do.
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 text-[11px]">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 space-y-1">
                              <p className="font-semibold uppercase tracking-wide text-slate-600">Good for</p>
                              <ul className="space-y-0.5 list-disc list-inside text-slate-600">
                                <li>What a medicine is used for</li>
                                <li>Common side effects</li>
                                <li>Understanding instructions</li>
                              </ul>
                            </div>
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 space-y-1 text-amber-900">
                              <p className="font-semibold uppercase tracking-wide">Not for</p>
                              <ul className="space-y-0.5 list-disc list-inside">
                                <li>Emergencies or urgent care</li>
                                <li>Diagnosis or prescriptions</li>
                                <li>Changing doses without a doctor</li>
                              </ul>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-dashed border-slate-100 text-[11px] text-slate-500 leading-relaxed">
                            Always confirm decisions with your doctor or pharmacist.
                          </div>
                        </div>
                      </motion.div>
                    } />

                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </AnimatePresence>
              </main>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Intake History (View History) Page ---

function HistoryPage({ apiBaseUrl, backendToken }: { apiBaseUrl: string; backendToken: string | null }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [readings, setReadings] = useState<Array<{
    id: number;
    user_email: string | null;
    medicine_name: string;
    time_label: string;
    taken_at: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!backendToken) {
        // Without a backend token we cannot load per-user history.
        setReadings([]);
        setError('You are not authenticated with the device backend. Please sign in again.');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedDate) params.set('date', selectedDate);
        const res = await fetch(`${apiBaseUrl}/api/intakes/by-date?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${backendToken}`,
          },
        });
        if (!res.ok) {
          throw new Error('Failed to load history');
        }
        const data = await res.json();
        if (cancelled) return;
        if (!data || !Array.isArray(data.readings)) {
          setReadings([]);
        } else {
          setReadings(data.readings);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[history] Failed to load intake history', e);
          setError('Failed to load intake history for this day.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, backendToken, selectedDate]);

  const formatTime = (iso: string, fallback: string) => {
    if (!iso) return fallback;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value || new Date().toISOString().slice(0, 10));
  };

  return (
    <motion.div
      key="history-content"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              <span>View intake history</span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Choose a date to see which medicines were recorded as taken on that day.
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Select day
            </label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="bg-transparent border-none text-sm focus:outline-none focus:ring-0"
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mt-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading history…</span>
          </div>
        )}
        {error && !loading && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}

        {!loading && !error && readings.length === 0 && (
          <p className="text-sm text-slate-500 mt-2">
            No intake records found for this day.
          </p>
        )}

        {!loading && !error && readings.length > 0 && (
          <div className="mt-4 space-y-3">
            {readings.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-3 px-4 rounded-2xl border border-slate-100 bg-slate-50"
              >
                <div>
                  <p className="font-semibold text-sm text-slate-900">{r.medicine_name}</p>
                  <p className="text-xs text-slate-500">
                    Taken at {formatTime(r.taken_at, r.time_label)}
                    {r.time_label && (
                      <span className="ml-1 text-[11px] text-slate-400">({r.time_label})</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Taken</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// --- Device Wi‑Fi Setup Page ---

function DeviceWifiSetupPage() {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const espBaseUrl = 'http://192.168.4.1'; // Default IP when ESP8266 is in AP mode

  const handleConnect = async () => {
    const trimmedSsid = ssid.trim();
    const trimmedPassword = password.trim();
    if (!trimmedSsid || !trimmedPassword) {
      alert('Please enter both Wi‑Fi name (SSID) and password.');
      return;
    }

    setStatus('loading');
    setMessage(null);
    try {
      const body = new URLSearchParams({ ssid: trimmedSsid, password: trimmedPassword }).toString();
      const res = await fetch(`${espBaseUrl}/wifi-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || !data.ok) {
        setStatus('error');
        setMessage(data.error || 'Failed to connect ESP8266 to Wi‑Fi. Check SSID/password and try again.');
        return;
      }

      setStatus('success');
      const ipInfo = data.ip ? ` Device IP: ${data.ip}.` : '';
      setMessage(
        `ESP8266 connected to your Wi‑Fi network.${ipInfo} Now reconnect this device to that Wi‑Fi and return to the pairing page.`,
      );
    } catch (err) {
      console.error('[wifi-setup] Failed to send Wi‑Fi config to ESP8266', err);
      setStatus('error');
      setMessage('Could not reach ESP8266 at 192.168.4.1. Make sure you are connected to its hotspot.');
    }
  };

  return (
    <motion.div
      key="wifi-setup-content"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="max-w-xl mx-auto space-y-6"
    >
      <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-5">
        <h2 className="text-2xl font-bold text-slate-900 text-center">Configure box Wi‑Fi</h2>
        <p className="text-sm text-slate-600">
          1. Long‑press the D4 button on your Smart Medicine Box until its hotspot appears (SmartMedBox‑Setup‑…).<br />
          2. On this phone or laptop, connect to that hotspot.<br />
          3. Then enter your home Wi‑Fi details below and connect the box.
        </p>

        <div className="space-y-3">
          <Input
            label="Home Wi‑Fi name (SSID)"
            placeholder="MyHomeWiFi"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
          />
          <Input
            label="Wi‑Fi password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button
          className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700"
          isLoading={status === 'loading'}
          onClick={handleConnect}
        >
          Connect ESP8266 to this network
        </Button>

        {message && (
          <div
            className={cn(
              'mt-3 text-sm rounded-2xl px-4 py-3',
              status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100',
            )}
          >
            {message}
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          className="w-full h-10 mt-2"
          onClick={() => navigate('/pair')}
        >
          Back to pairing
        </Button>
      </div>
    </motion.div>
  );
}

// --- Auth Forms ---

function LoginForm({ apiBaseUrl, onToggle, setError, onSuccess, setBackendToken }: { apiBaseUrl: string; onToggle: () => void; setError: (err: string | null) => void; onSuccess: () => void; setBackendToken: (token: string | null) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      // Also log in to the local backend to obtain a JWT token for authenticated API calls.
      try {
        const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: data.email, password: data.password }),
        });
        if (res.ok) {
          const body = await res.json().catch(() => null as any);
          if (body && typeof body.token === 'string') {
            setBackendToken(body.token);
          }
        } else {
          console.warn('[auth] Backend login failed with status', res.status);
        }
      } catch (e) {
        console.warn('[auth] Failed to contact backend for login token', e);
      }
      onSuccess();
    } catch (error: any) {
      setError(error.message || "An error occurred during login.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Input
        label="Email"
        placeholder="name@example.com"
        icon={<Mail className="h-4 w-4" />}
        error={errors.email?.message}
        autoComplete="email"
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        icon={<Lock className="h-4 w-4" />}
        error={errors.password?.message}
        autoComplete="current-password"
        {...register('password')}
      />
      <Button type="submit" className="w-full h-12 text-base" isLoading={isLoading}>
        Sign In
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      <Button 
        type="button" 
        variant="secondary" 
        className="w-full h-12 text-base" 
        onClick={(e) => {
          e.preventDefault();
          (window as any).handleDemoLogin?.();
        }}
      >
        Demo Login
      </Button>
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-100"></span>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400">Or continue with</span>
        </div>
      </div>
      <p className="text-center text-sm text-slate-500">
        Don't have an account?{" "}
        <button type="button" onClick={onToggle} className="text-emerald-600 font-semibold hover:underline">
          Create one
        </button>
      </p>
    </form>
  );
}

function SignupForm({ apiBaseUrl, onToggle, setError, onSuccess, setBackendToken }: { apiBaseUrl: string; onToggle: () => void; setError: (err: string | null) => void; onSuccess: () => void; setBackendToken: (token: string | null) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema)
  });

  const onSubmit = async (data: SignupFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;
      
      await updateProfile(user, { displayName: data.name });
      
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: data.email,
        displayName: data.name,
        deviceToken: data.deviceToken,
        createdAt: new Date().toISOString()
      });

      // Also create the user in the local auth backend (SQLite) for hardware/box access
      // and capture the returned JWT token for authenticated API calls.
      try {
        const res = await fetch(`${apiBaseUrl}/api/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: data.email,
            password: data.password,
            name: data.name,
            deviceToken: data.deviceToken,
          }),
        });
        if (res.ok) {
          const body = await res.json().catch(() => null as any);
          if (body && typeof body.token === 'string') {
            setBackendToken(body.token);
          }
        }
      } catch (backendError) {
        console.warn('Failed to sync user to local auth backend', backendError);
      }
      onSuccess();
    } catch (error: any) {
      setError(error.message || "An error occurred during sign up.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Input
        label="Full Name"
        placeholder="John Doe"
        icon={<UserIcon className="h-4 w-4" />}
        error={errors.name?.message}
        autoComplete="name"
        {...register('name')}
      />
      <Input
        label="Email"
        placeholder="name@example.com"
        icon={<Mail className="h-4 w-4" />}
        error={errors.email?.message}
        autoComplete="email"
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        icon={<Lock className="h-4 w-4" />}
        error={errors.password?.message}
        autoComplete="new-password"
        {...register('password')}
      />
      <Input
        label="Device Token"
        placeholder="Enter the code printed on your box"
        error={errors.deviceToken?.message}
        {...register('deviceToken')}
      />
      <Button type="submit" className="w-full h-12 text-base" isLoading={isLoading}>
        Create Account
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <button type="button" onClick={onToggle} className="text-emerald-600 font-semibold hover:underline">
          Sign In
        </button>
      </p>
    </form>
  );
}

// --- UI Helpers ---

function StatCard({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: 'emerald' | 'blue' | 'orange' }) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="bg-white p-7 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-5", colors[color])}>
        {icon}
      </div>
      <p className="text-slate-500 text-base font-medium">{title}</p>
      <p className="text-4xl font-bold mt-1">{value}</p>
    </div>
  );
}

function RecentIntakeChart({
  readings,
}: {
  readings: Array<{
    id: number;
    user_email: string | null;
    medicine_name: string;
    time_label: string;
    taken_at: string;
  }>;
}) {
  if (!readings || readings.length === 0) {
    return <p className="text-xs text-slate-500">No intake readings yet. Take some doses to see your pattern.</p>;
  }

  // Sort oldest -> newest so the line moves left-to-right in time
  const sorted = [...readings].sort((a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime());

  const width = 560;
  const height = 160;
  const paddingX = 24;
  const paddingY = 18;

  const maxPoints = sorted.length;

  const points = sorted.map((r, index) => {
    const d = new Date(r.taken_at);
    const minutesOfDay = d.getHours() * 60 + d.getMinutes(); // 0-1440
    const x =
      maxPoints === 1
        ? width / 2
        : paddingX + (index / (maxPoints - 1)) * (width - 2 * paddingX);
    const y =
      height -
      paddingY -
      (minutesOfDay / (24 * 60)) * (height - 2 * paddingY); // invert so midnight is bottom
    return { x, y, label: r.medicine_name, timeLabel: r.time_label };
  });

  const pathD =
    points.length > 0
      ? 'M ' + points.map((p) => `${p.x} ${p.y}`).join(' L ')
      : '';

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-40 text-emerald-500"
        aria-label="Last 20 intake readings"
      >
        {/* Axes */}
        <line
          x1={paddingX}
          y1={height - paddingY}
          x2={width - paddingX}
          y2={height - paddingY}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
        <line
          x1={paddingX}
          y1={paddingY}
          x2={paddingX}
          y2={height - paddingY}
          stroke="#e5e7eb"
          strokeWidth={1}
        />

        {/* Horizontal reference lines for morning/afternoon/evening */}
        {[6, 12, 18].map((hour) => {
          const minutes = hour * 60;
          const y =
            height -
            paddingY -
            (minutes / (24 * 60)) * (height - 2 * paddingY);
          return (
            <g key={hour}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth={1}
                strokeDasharray="2,4"
              />
              <text
                x={paddingX - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[9px]"
              >
                {hour}:00
              </text>
            </g>
          );
        })}

        {/* Line connecting points */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Points */}
        {points.map((p, idx) => (
          <g key={idx}>
            <circle
              cx={p.x}
              cy={p.y}
              r={3}
              fill="white"
              stroke="currentColor"
              strokeWidth={1.5}
            />
          </g>
        ))}

        {/* X-axis labels: index from newest at right to oldest at left */}
        {points.map((p, idx) => (
          <text
            key={`label-${idx}`}
            x={p.x}
            y={height - paddingY + 10}
            textAnchor="middle"
            className="fill-slate-400 text-[8px]"
          >
            {idx + 1}
          </text>
        ))}
      </svg>
      <p className="mt-1 text-[10px] text-slate-400">
        Y-axis: time of day for each intake. X-axis: oldest (1) to newest ({points.length}).
      </p>
    </div>
  );
}

function DoseItem({ name, time, dosage, status }: { name: string, time: string, dosage: string, status: 'taken' | 'upcoming' | 'missed' }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between group hover:border-emerald-200 transition-colors cursor-pointer">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-14 h-14 rounded-xl flex items-center justify-center",
          status === 'taken' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
        )}>
          <Pill className="h-7 w-7" />
        </div>
        <div>
          <h4 className="font-bold text-slate-900 text-base">{name}</h4>
          <p className="text-base text-slate-500">{dosage} • {time}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {status === 'taken' ? (
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Taken</span>
        ) : (
          <Button variant="ghost" className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100">
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, collapsed, onClick }: { icon: React.ReactNode, label: string, active: boolean, collapsed: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-200 group relative",
        active 
          ? "bg-emerald-50 text-emerald-600" 
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <div className={cn("shrink-0", active ? "text-emerald-600" : "group-hover:text-slate-900")}>
        {icon}
      </div>
      {!collapsed && (
        <span className="font-semibold text-base whitespace-nowrap">{label}</span>
      )}
      {collapsed && active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-600 rounded-r-full" />
      )}
    </button>
  );
}

function GreetingModal({ isOpen, onClose, name }: { isOpen: boolean, onClose: () => void, name: string }) {
  const quotes = [
    "Health is not valued till sickness comes.",
    "The greatest wealth is health.",
    "He who has health has hope; and he who has hope has everything.",
    "A healthy outside starts from the inside.",
    "To keep the body in good health is a duty... otherwise we shall not be able to keep our mind strong and clear."
  ];
  
  const [quote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[32px] p-8 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
            
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-6 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-50 text-emerald-600 mb-2">
                <Sparkles className="h-10 w-10" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-slate-900">Welcome, {name}!</h2>
                <p className="text-slate-500 font-medium italic px-4">
                  "{quote}"
                </p>
              </div>

              <div className="pt-4">
                <Button onClick={onClose} className="w-full h-12 rounded-2xl text-base">
                  Let's Get Started
                </Button>
              </div>
            </div>

            {/* Decorative background elements */}
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-50 rounded-full blur-3xl opacity-50" />
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-50" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function MedicineSavedModal({ isOpen, onClose, medicineName }: { isOpen: boolean, onClose: () => void, medicineName: string }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Medicine saved</h2>
              <p className="text-sm text-slate-500">
                {medicineName} has been added to your schedule.
              </p>
              <Button className="mt-2 w-full h-10 rounded-2xl" onClick={onClose}>
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function PairingModal({ isOpen, isLoading, onClose }: { isOpen: boolean; isLoading: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-sm bg-white rounded-[28px] p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center gap-4"
          >
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <div className="relative flex items-center justify-center">
                <div className="w-7 h-7 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">Pairing with your device…</h2>
              <p className="text-xs text-slate-500">
                Make sure the pairing button is pressed so D0 is HIGH. This may take a few seconds while we contact your Smart Medicine Box.
              </p>
            </div>
            {!isLoading && (
              <Button className="mt-2 w-full h-10 rounded-2xl" onClick={onClose}>
                Close
              </Button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
