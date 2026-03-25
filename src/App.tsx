/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, Component } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Table as TableIcon, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Search, 
  Filter, 
  Download, 
  Trash2, 
  Edit2,
  ChevronRight,
  ChevronLeft,
  PieChart as PieChartIcon,
  Moon,
  Sun,
  Calendar as CalendarIcon,
  LogOut,
  LogIn
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { tr } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Firebase Imports
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  setDoc,
  getDoc,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from './firebase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Error Handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Error Boundary
class ErrorBoundary extends Component<any, any> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Bir şeyler yanlış gitti.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error) {
          errorMessage = `Hata: ${parsedError.error} (${parsedError.operationType} on ${parsedError.path})`;
        }
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-200 dark:border-slate-800">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingDown className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Hata Oluştu</h2>
            <p className="text-gray-600 dark:text-slate-400 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// Types
interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
}

const CATEGORIES = [
  'Maaş', 'Kira', 'Market', 'Ulaşım', 'Eğlence', 'Sağlık', 'Fatura', 'Diğer'
];

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

// Mock Data
const INITIAL_DATA: Transaction[] = [
  { id: '1', date: '2024-03-01', description: 'Maaş Ödemesi', category: 'Maaş', amount: 45000, type: 'income' },
  { id: '2', date: '2024-03-05', description: 'Ev Kirası', category: 'Kira', amount: 15000, type: 'expense' },
  { id: '3', date: '2024-03-10', description: 'Market Alışverişi', category: 'Market', amount: 2500, type: 'expense' },
  { id: '4', date: '2024-03-12', description: 'Elektrik Faturası', category: 'Fatura', amount: 850, type: 'expense' },
  { id: '5', date: '2024-03-15', description: 'Freelance Proje', category: 'Maaş', amount: 12000, type: 'income' },
  { id: '6', date: '2024-03-20', description: 'İnternet Faturası', category: 'Fatura', amount: 350, type: 'expense' },
];

export default function App() {
  return (
    <ErrorBoundary>
      <FinancialApp />
    </ErrorBoundary>
  );
}

function FinancialApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'budget'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  // Firebase Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (user) {
        // Create user profile if not exists
        const userDoc = doc(db, 'users', user.uid);
        const snapshot = await getDoc(userDoc);
        if (!snapshot.exists()) {
          await setDoc(userDoc, {
            email: user.email,
            displayName: user.displayName,
            role: 'user'
          });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setBudgets({});
      return;
    }

    const qTransactions = query(
      collection(db, 'transactions'),
      where('uid', '==', user.uid)
    );

    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setTransactions(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    const qBudgets = query(
      collection(db, 'budgets'),
      where('uid', '==', user.uid)
    );

    const unsubBudgets = onSnapshot(qBudgets, (snapshot) => {
      const data: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const b = doc.data();
        data[b.category] = b.amount;
      });
      setBudgets(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'budgets'));

    return () => {
      unsubTransactions();
      unsubBudgets();
    };
  }, [user]);

  // Dark Mode Persistence
  useEffect(() => {
    localStorage.setItem('darkMode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Form State
  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    category: 'Diğer',
    amount: 0,
    type: 'expense'
  });

  // Calculations
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || t.type === filterType;
      return matchesSearch && matchesType;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchTerm, filterType]);

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  const chartData = useMemo(() => {
    const data: Record<string, { income: number; expense: number }> = {};
    transactions.forEach(t => {
      const month = format(parseISO(t.date), 'MMM', { locale: tr });
      if (!data[month]) data[month] = { income: 0, expense: 0 };
      if (t.type === 'income') data[month].income += t.amount;
      else data[month].expense += t.amount;
    });
    return Object.entries(data).map(([name, values]) => ({ name, ...values }));
  }, [transactions]);

  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      data[t.category] = (data[t.category] || 0) + t.amount;
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  // Auth Handlers
  const handleLogin = async () => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed", error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("Giriş penceresi kapatıldı. Lütfen tekrar deneyin ve pencerenin kapanmadığından emin olun.");
      } else if (error.code === 'auth/blocked-at-popup-manager') {
        setLoginError("Tarayıcınız açılır pencereleri engelliyor olabilir. Lütfen izin verip tekrar deneyin.");
      } else {
        setLoginError("Giriş yapılırken bir hata oluştu: " + (error.message || "Bilinmeyen hata"));
      }
    }
  };

  const handleLogout = () => signOut(auth);

  // Handlers
  const handleAddOrEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (editingTransaction) {
        const docRef = doc(db, 'transactions', editingTransaction.id);
        await updateDoc(docRef, { ...formData, uid: user.uid });
      } else {
        await addDoc(collection(db, 'transactions'), { ...formData, uid: user.uid });
      }
      setIsModalOpen(false);
      setEditingTransaction(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        description: '',
        category: 'Diğer',
        amount: 0,
        type: 'expense'
      });
    } catch (error) {
      handleFirestoreError(error, editingTransaction ? OperationType.UPDATE : OperationType.CREATE, 'transactions');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bu işlemi silmek istediğinizden emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'transactions', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'transactions');
      }
    }
  };

  const updateBudget = async (category: string, amount: number) => {
    if (!user) return;
    try {
      // Find budget doc for this category
      const q = query(collection(db, 'budgets'), where('uid', '==', user.uid), where('category', '==', category));
      const snapshot = await getDocFromServer(doc(db, 'budgets', category + '_' + user.uid)); // Using a deterministic ID for simplicity or query
      
      // For simplicity, let's use a deterministic ID: category_uid
      await setDoc(doc(db, 'budgets', category + '_' + user.uid), {
        category,
        amount,
        uid: user.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'budgets');
    }
  };

  const openEditModal = (t: Transaction) => {
    setEditingTransaction(t);
    setFormData({
      date: t.date,
      description: t.description,
      category: t.category,
      amount: t.amount,
      type: t.type
    });
    setIsModalOpen(true);
  };

  const exportToCSV = () => {
    const headers = ['Tarih', 'Açıklama', 'Kategori', 'Tutar', 'Tip'];
    const rows = transactions.map(t => [
      t.date,
      t.description,
      t.category,
      t.amount,
      t.type === 'income' ? 'Gelir' : 'Gider'
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `finans_takip_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={cn(
      "min-h-screen flex transition-colors duration-300",
      isDarkMode ? "bg-slate-950 text-slate-100" : "bg-gray-50 text-gray-900"
    )}>
      {/* Sidebar */}
      <aside className={cn(
        "w-64 border-r flex flex-col transition-colors duration-300",
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
      )}>
        <div className={cn(
          "p-6 border-b",
          isDarkMode ? "border-slate-800" : "border-gray-100"
        )}>
          <div className="flex items-center gap-3 text-blue-500 font-bold text-xl">
            <Wallet className="w-8 h-8" />
            <span>FinansTakip</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'dashboard' 
                ? (isDarkMode ? "bg-blue-500/10 text-blue-400 font-medium" : "bg-blue-50 text-blue-600 font-medium") 
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-500 hover:bg-gray-50")
            )}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Panel</span>
          </button>
          <button 
            onClick={() => setActiveTab('transactions')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'transactions' 
                ? (isDarkMode ? "bg-blue-500/10 text-blue-400 font-medium" : "bg-blue-50 text-blue-600 font-medium") 
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-500 hover:bg-gray-50")
            )}
          >
            <TableIcon className="w-5 h-5" />
            <span>İşlemler</span>
          </button>
          <button 
            onClick={() => setActiveTab('budget')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'budget' 
                ? (isDarkMode ? "bg-blue-500/10 text-blue-400 font-medium" : "bg-blue-50 text-blue-600 font-medium") 
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-500 hover:bg-gray-50")
            )}
          >
            <PieChartIcon className="w-5 h-5" />
            <span>Bütçe</span>
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-slate-800">
          <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-500/20">
            <p className="text-blue-100 text-sm mb-1">Toplam Bakiye</p>
            <p className="text-2xl font-bold">₺{stats.balance.toLocaleString('tr-TR')}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className={cn(
          "px-8 py-4 flex items-center justify-between sticky top-0 z-10 border-b transition-colors duration-300",
          isDarkMode ? "bg-slate-900/80 backdrop-blur-md border-slate-800" : "bg-white/80 backdrop-blur-md border-gray-200"
        )}>
          <h1 className="text-xl font-bold">
            {activeTab === 'dashboard' ? 'Genel Bakış' : activeTab === 'transactions' ? 'İşlem Listesi' : 'Bütçe Yönetimi'}
          </h1>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3 pr-4 border-r border-gray-200 dark:border-slate-800">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">{user.displayName}</p>
                  <button 
                    onClick={handleLogout}
                    className="text-xs text-red-500 hover:underline flex items-center gap-1 ml-auto"
                  >
                    <LogOut className="w-3 h-3" />
                    Çıkış Yap
                  </button>
                </div>
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                  alt="Avatar" 
                  className="w-10 h-10 rounded-full border-2 border-blue-500/20"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
              >
                <LogIn className="w-4 h-4" />
                Giriş Yap
              </button>
            )}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                isDarkMode ? "bg-slate-800 text-yellow-400 hover:bg-slate-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {activeTab === 'transactions' && (
              <button 
                onClick={exportToCSV}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  isDarkMode ? "bg-slate-800 text-slate-400 hover:bg-slate-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                )}
                title="CSV Olarak Dışa Aktar"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="İşlem ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn(
                  "pl-10 pr-4 py-2 border-transparent focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-lg text-sm transition-all w-64 outline-none",
                  isDarkMode ? "bg-slate-800 text-slate-100" : "bg-gray-100 text-gray-900 focus:bg-white"
                )}
              />
            </div>
            <button 
              onClick={() => {
                setEditingTransaction(null);
                setIsModalOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Yeni İşlem
            </button>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {!isAuthReady ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : !user ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Wallet className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Hoş Geldiniz</h2>
              <p className="text-gray-500 dark:text-slate-400 mb-8 max-w-md mx-auto">
                Finansal durumunuzu takip etmek ve bütçenizi yönetmek için lütfen giriş yapın.
                <br />
                <span className="text-xs mt-2 block opacity-70">
                  Not: Giriş penceresi açılmazsa lütfen tarayıcınızın açılır pencere (popup) engelleyicisini kontrol edin.
                </span>
              </p>
              
              {loginError && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm max-w-md mx-auto">
                  {loginError}
                </div>
              )}

              <button 
                onClick={handleLogin}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-xl shadow-blue-500/20 transition-all active:scale-95 flex items-center gap-2 mx-auto"
              >
                <LogIn className="w-5 h-5" />
                Google ile Giriş Yap
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className={cn(
                    "p-6 rounded-2xl border shadow-sm transition-colors",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                  )}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-green-500/10 text-green-500 rounded-lg">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">+12%</span>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-sm">Toplam Gelir</p>
                    <p className="text-2xl font-bold">₺{stats.income.toLocaleString('tr-TR')}</p>
                  </div>
                  
                  <div className={cn(
                    "p-6 rounded-2xl border shadow-sm transition-colors",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                  )}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-red-500/10 text-red-500 rounded-lg">
                        <TrendingDown className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-medium text-red-500 bg-red-500/10 px-2 py-1 rounded-full">+5%</span>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-sm">Toplam Gider</p>
                    <p className="text-2xl font-bold">₺{stats.expense.toLocaleString('tr-TR')}</p>
                  </div>

                  <div className={cn(
                    "p-6 rounded-2xl border shadow-sm transition-colors",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                  )}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                        <Wallet className="w-6 h-6" />
                      </div>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-sm">Net Durum</p>
                    <p className={cn(
                      "text-2xl font-bold",
                      stats.balance >= 0 ? (isDarkMode ? "text-slate-100" : "text-gray-900") : "text-red-500"
                    )}>
                      ₺{stats.balance.toLocaleString('tr-TR')}
                    </p>
                  </div>
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className={cn(
                    "p-6 rounded-2xl border shadow-sm transition-colors",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                  )}>
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-500" />
                      Gelir & Gider Analizi
                    </h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#1e293b" : "#f3f4f6"} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                          <Tooltip 
                            contentStyle={{
                              borderRadius: '12px', 
                              border: 'none', 
                              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                              backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                              color: isDarkMode ? '#f1f5f9' : '#1f2937'
                            }}
                          />
                          <Bar dataKey="income" name="Gelir" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="expense" name="Gider" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className={cn(
                    "p-6 rounded-2xl border shadow-sm transition-colors",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                  )}>
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5 text-purple-500" />
                      Kategori Dağılımı (Gider)
                    </h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{
                              borderRadius: '12px', 
                              border: 'none', 
                              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                              backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                              color: isDarkMode ? '#f1f5f9' : '#1f2937'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Recent Transactions */}
                <div className={cn(
                  "rounded-2xl border shadow-sm overflow-hidden transition-colors",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                )}>
                  <div className={cn(
                    "p-6 border-b flex items-center justify-between",
                    isDarkMode ? "border-slate-800" : "border-gray-100"
                  )}>
                    <h3 className="font-bold">Son İşlemler</h3>
                    <button 
                      onClick={() => setActiveTab('transactions')}
                      className="text-blue-500 text-sm font-medium hover:underline"
                    >
                      Tümünü Gör
                    </button>
                  </div>
                  <div className={cn(
                    "divide-y",
                    isDarkMode ? "divide-slate-800" : "divide-gray-100"
                  )}>
                    {transactions.slice(0, 5).map(t => (
                      <div key={t.id} className={cn(
                        "p-4 flex items-center justify-between transition-colors",
                        isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-50"
                      )}>
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "p-2 rounded-xl",
                            t.type === 'income' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {t.type === 'income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-medium">{t.description}</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">{t.category} • {format(parseISO(t.date), 'd MMMM yyyy', { locale: tr })}</p>
                          </div>
                        </div>
                        <p className={cn(
                          "font-bold",
                          t.type === 'income' ? "text-green-500" : "text-red-500"
                        )}>
                          {t.type === 'income' ? '+' : '-'}₺{t.amount.toLocaleString('tr-TR')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'transactions' && (
              <motion.div 
                key="transactions"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2 mb-4">
                  <button 
                    onClick={() => setFilterType('all')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all", 
                      filterType === 'all' 
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                        : (isDarkMode ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-white text-gray-600 border border-gray-200")
                    )}
                  >
                    Tümü
                  </button>
                  <button 
                    onClick={() => setFilterType('income')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all", 
                      filterType === 'income' 
                        ? "bg-green-600 text-white shadow-lg shadow-green-500/20" 
                        : (isDarkMode ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-white text-gray-600 border border-gray-200")
                    )}
                  >
                    Gelirler
                  </button>
                  <button 
                    onClick={() => setFilterType('expense')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all", 
                      filterType === 'expense' 
                        ? "bg-red-600 text-white shadow-lg shadow-red-500/20" 
                        : (isDarkMode ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-white text-gray-600 border border-gray-200")
                    )}
                  >
                    Giderler
                  </button>
                </div>

                <div className={cn(
                  "rounded-2xl border shadow-sm overflow-hidden transition-colors",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                )}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={cn(
                          "border-b transition-colors",
                          isDarkMode ? "bg-slate-800/50 border-slate-800" : "bg-gray-50 border-gray-200"
                        )}>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Tarih</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Açıklama</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Kategori</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Tutar</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-center">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className={cn(
                        "divide-y",
                        isDarkMode ? "divide-slate-800" : "divide-gray-100"
                      )}>
                        {filteredTransactions.map(t => (
                          <tr key={t.id} className={cn(
                            "transition-colors group",
                            isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-50"
                          )}>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">
                              {format(parseISO(t.date), 'dd.MM.yyyy')}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-2 h-2 rounded-full",
                                  t.type === 'income' ? "bg-green-500" : "bg-red-500"
                                )} />
                                <span className="text-sm font-medium">{t.description}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2 py-1 rounded-md text-xs font-medium",
                                isDarkMode ? "bg-slate-800 text-slate-300" : "bg-gray-100 text-gray-600"
                              )}>
                                {t.category}
                              </span>
                            </td>
                            <td className={cn(
                              "px-6 py-4 text-sm font-bold text-right",
                              t.type === 'income' ? "text-green-500" : "text-red-500"
                            )}>
                              {t.type === 'income' ? '+' : '-'}₺{t.amount.toLocaleString('tr-TR')}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => openEditModal(t)}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-all",
                                    isDarkMode ? "text-slate-400 hover:text-blue-400 hover:bg-blue-400/10" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                                  )}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDelete(t.id)}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-all",
                                    isDarkMode ? "text-slate-400 hover:text-red-400 hover:bg-red-400/10" : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                                  )}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {filteredTransactions.length === 0 && (
                    <div className="p-12 text-center">
                      <div className={cn(
                        "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
                        isDarkMode ? "bg-slate-800" : "bg-gray-50"
                      )}>
                        <Search className="w-8 h-8 text-gray-300 dark:text-slate-600" />
                      </div>
                      <p className="text-gray-500 dark:text-slate-400">Aradığınız kriterlere uygun işlem bulunamadı.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'budget' && (
              <motion.div 
                key="budget"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8"
              >
                <div className={cn(
                  "p-6 rounded-2xl border shadow-sm transition-colors",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                )}>
                  <h3 className="text-lg font-bold mb-6">Kategori Bazlı Bütçeler</h3>
                  <div className="space-y-6">
                    {CATEGORIES.filter(c => c !== 'Maaş').map(category => {
                      const spent = transactions
                        .filter(t => t.category === category && t.type === 'expense')
                        .reduce((sum, t) => sum + t.amount, 0);
                      const budget = budgets[category] || 0;
                      const percentage = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                      
                      return (
                        <div key={category} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{category}</span>
                            <span className="text-gray-500 dark:text-slate-400">
                              ₺{spent.toLocaleString('tr-TR')} / ₺{budget.toLocaleString('tr-TR')}
                            </span>
                          </div>
                          <div className={cn(
                            "h-2 rounded-full overflow-hidden",
                            isDarkMode ? "bg-slate-800" : "bg-gray-100"
                          )}>
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              className={cn(
                                "h-full transition-colors duration-500",
                                percentage > 90 ? "bg-red-500" : percentage > 70 ? "bg-yellow-500" : "bg-blue-500"
                              )}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={cn(
                  "p-6 rounded-2xl border shadow-sm transition-colors",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                )}>
                  <h3 className="text-lg font-bold mb-6">Bütçe Ayarları</h3>
                  <div className="space-y-4">
                    {CATEGORIES.filter(c => c !== 'Maaş').map(category => (
                      <div key={category} className="flex items-center justify-between gap-4">
                        <span className="text-sm text-gray-600 dark:text-slate-400">{category}</span>
                        <div className="relative flex-1 max-w-[150px]">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₺</span>
                          <input 
                            type="number"
                            value={budgets[category] || 0}
                            onChange={(e) => updateBudget(category, parseFloat(e.target.value) || 0)}
                            className={cn(
                              "w-full pl-7 pr-3 py-1.5 border rounded-lg text-sm outline-none transition-all",
                              isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                            )}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          )}
        </div>
      </main>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={cn(
                "rounded-2xl w-full max-w-md shadow-2xl overflow-hidden transition-colors",
                isDarkMode ? "bg-slate-900" : "bg-white"
              )}
            >
              <div className={cn(
                "p-6 border-b flex items-center justify-between",
                isDarkMode ? "border-slate-800" : "border-gray-100"
              )}>
                <h2 className="text-xl font-bold">
                  {editingTransaction ? 'İşlemi Düzenle' : 'Yeni İşlem Ekle'}
                </h2>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    isDarkMode ? "hover:bg-slate-800" : "hover:bg-gray-100"
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleAddOrEdit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'income' })}
                    className={cn(
                      "py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2",
                      formData.type === 'income' 
                        ? (isDarkMode ? "border-green-500 bg-green-500/10 text-green-400" : "border-green-500 bg-green-50 text-green-700") 
                        : (isDarkMode ? "border-slate-800 text-slate-500 hover:border-slate-700" : "border-gray-100 text-gray-500 hover:border-gray-200")
                    )}
                  >
                    <TrendingUp className="w-4 h-4" />
                    Gelir
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'expense' })}
                    className={cn(
                      "py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2",
                      formData.type === 'expense' 
                        ? (isDarkMode ? "border-red-500 bg-red-500/10 text-red-400" : "border-red-500 bg-red-50 text-red-700") 
                        : (isDarkMode ? "border-slate-800 text-slate-500 hover:border-slate-700" : "border-gray-100 text-gray-500 hover:border-gray-200")
                    )}
                  >
                    <TrendingDown className="w-4 h-4" />
                    Gider
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Tarih</label>
                  <input 
                    type="date" 
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                      isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Açıklama</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Örn: Market alışverişi"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                      isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Kategori</label>
                    <select 
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                      )}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Tutar (₺)</label>
                    <input 
                      type="number" 
                      required
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                      )}
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className={cn(
                      "flex-1 py-3 border font-medium rounded-xl transition-colors",
                      isDarkMode ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    İptal
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                  >
                    {editingTransaction ? 'Güncelle' : 'Kaydet'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
