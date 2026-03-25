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
  LogIn,
  FileText,
  CreditCard,
  BarChart3
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
  firmName?: string;
}

interface Invoice {
  id: string;
  uid: string;
  orderNo?: number;
  date: string;
  firmName: string;
  type: 'income' | 'expense';
  invoiceNo: string;
  vatBase: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
}

interface Payment {
  id: string;
  uid: string;
  orderNo?: number;
  date: string;
  firmName: string;
  type: 'collection' | 'payment';
  paymentMethod: string;
  amount: number;
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'budget' | 'invoices' | 'payments' | 'reports'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  // Invoice Filtering State
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('');
  const [invoiceDateRange, setInvoiceDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [invoiceFirmFilter, setInvoiceFirmFilter] = useState('all');

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

    const qInvoices = query(collection(db, 'invoices'), where('uid', '==', user.uid), orderBy('date', 'desc'));
    const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invoices'));

    const qPayments = query(collection(db, 'payments'), where('uid', '==', user.uid), orderBy('date', 'desc'));
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Payment)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'payments'));

    return () => {
      unsubTransactions();
      unsubBudgets();
      unsubInvoices();
      unsubPayments();
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

  const [invoiceFormData, setInvoiceFormData] = useState<Omit<Invoice, 'id' | 'uid'>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    firmName: '',
    type: 'income',
    invoiceNo: '',
    vatBase: 0,
    vatRate: 18,
    vatAmount: 0,
    totalAmount: 0,
    orderNo: 0
  });

  const [paymentFormData, setPaymentFormData] = useState<Omit<Payment, 'id' | 'uid'>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    firmName: '',
    type: 'collection',
    paymentMethod: 'Nakit',
    amount: 0,
    orderNo: 0
  });

  // Calculations
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (t.firmName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || t.type === filterType;
      return matchesSearch && matchesType;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchTerm, filterType]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch = inv.firmName.toLowerCase().includes(invoiceSearchTerm.toLowerCase()) ||
                           inv.invoiceNo.toLowerCase().includes(invoiceSearchTerm.toLowerCase());
      const matchesFirm = invoiceFirmFilter === 'all' || inv.firmName === invoiceFirmFilter;
      const matchesDate = (!invoiceDateRange.start || inv.date >= invoiceDateRange.start) &&
                         (!invoiceDateRange.end || inv.date <= invoiceDateRange.end);
      return matchesSearch && matchesFirm && matchesDate;
    });
  }, [invoices, invoiceSearchTerm, invoiceFirmFilter, invoiceDateRange]);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const matchesSearch = p.firmName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [payments, searchTerm]);

  const debtStatus = useMemo(() => {
    const status: Record<string, { totalInvoiced: number; totalPaid: number; balance: number; type: 'customer' | 'supplier' }> = {};
    
    invoices.forEach(inv => {
      if (!status[inv.firmName]) {
        status[inv.firmName] = { totalInvoiced: 0, totalPaid: 0, balance: 0, type: inv.type === 'income' ? 'customer' : 'supplier' };
      }
      status[inv.firmName].totalInvoiced += inv.totalAmount;
    });

    payments.forEach(p => {
      if (!status[p.firmName]) {
        status[p.firmName] = { totalInvoiced: 0, totalPaid: 0, balance: 0, type: p.type === 'collection' ? 'customer' : 'supplier' };
      }
      status[p.firmName].totalPaid += p.amount;
    });

    Object.keys(status).forEach(firm => {
      status[firm].balance = status[firm].totalInvoiced - status[firm].totalPaid;
    });

    return status;
  }, [invoices, payments]);

  const firms = useMemo(() => {
    const allFirms = new Set([...invoices.map(i => i.firmName), ...payments.map(p => p.firmName)]);
    return Array.from(allFirms).sort();
  }, [invoices, payments]);

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

  const handleInvoiceAddOrEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      if (editingInvoice) {
        const docRef = doc(db, 'invoices', editingInvoice.id);
        await updateDoc(docRef, { ...invoiceFormData, uid: user.uid });
      } else {
        await addDoc(collection(db, 'invoices'), {
          ...invoiceFormData,
          uid: user.uid
        });
      }
      setIsInvoiceModalOpen(false);
      setEditingInvoice(null);
      setInvoiceFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        firmName: '',
        type: 'income',
        invoiceNo: '',
        vatBase: 0,
        vatRate: 18,
        vatAmount: 0,
        totalAmount: 0,
        orderNo: 0
      });
    } catch (error) {
      handleFirestoreError(error, editingInvoice ? OperationType.UPDATE : OperationType.CREATE, 'invoices');
    }
  };

  const handlePaymentAddOrEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      if (editingPayment) {
        const docRef = doc(db, 'payments', editingPayment.id);
        await updateDoc(docRef, { ...paymentFormData, uid: user.uid });
      } else {
        await addDoc(collection(db, 'payments'), {
          ...paymentFormData,
          uid: user.uid
        });
      }
      setIsPaymentModalOpen(false);
      setEditingPayment(null);
      setPaymentFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        firmName: '',
        type: 'collection',
        paymentMethod: 'Nakit',
        amount: 0,
        orderNo: 0
      });
    } catch (error) {
      handleFirestoreError(error, editingPayment ? OperationType.UPDATE : OperationType.CREATE, 'payments');
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

  const handleInvoiceDelete = async (id: string) => {
    if (window.confirm('Bu faturayı silmek istediğinizden emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'invoices', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'invoices');
      }
    }
  };

  const handlePaymentDelete = async (id: string) => {
    if (window.confirm('Bu ödemeyi silmek istediğinizden emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'payments', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'payments');
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
            onClick={() => setActiveTab('invoices')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'invoices' 
                ? (isDarkMode ? "bg-blue-500/10 text-blue-400 font-medium" : "bg-blue-50 text-blue-600 font-medium") 
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-500 hover:bg-gray-50")
            )}
          >
            <FileText className="w-5 h-5" />
            <span>Faturalarım</span>
          </button>
          <button 
            onClick={() => setActiveTab('payments')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'payments' 
                ? (isDarkMode ? "bg-blue-500/10 text-blue-400 font-medium" : "bg-blue-50 text-blue-600 font-medium") 
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-500 hover:bg-gray-50")
            )}
          >
            <CreditCard className="w-5 h-5" />
            <span>Tahsilat / Ödeme</span>
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
          <button 
            onClick={() => setActiveTab('reports')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'reports' 
                ? (isDarkMode ? "bg-blue-500/10 text-blue-400 font-medium" : "bg-blue-50 text-blue-600 font-medium") 
                : (isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-500 hover:bg-gray-50")
            )}
          >
            <BarChart3 className="w-5 h-5" />
            <span>Raporlar</span>
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
            {activeTab === 'dashboard' ? 'Genel Bakış' : 
             activeTab === 'transactions' ? 'İşlem Listesi' : 
             activeTab === 'invoices' ? 'Faturalarım' :
             activeTab === 'payments' ? 'Tahsilat ve Ödemeler' :
             activeTab === 'reports' ? 'Finansal Raporlar' :
             'Bütçe Yönetimi'}
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
                if (activeTab === 'invoices') {
                  setEditingInvoice(null);
                  setIsInvoiceModalOpen(true);
                } else if (activeTab === 'payments') {
                  setEditingPayment(null);
                  setIsPaymentModalOpen(true);
                } else {
                  setEditingTransaction(null);
                  setIsModalOpen(true);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'invoices' ? 'Yeni Fatura' : activeTab === 'payments' ? 'Yeni Ödeme/Tahsilat' : 'Yeni İşlem'}
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
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Firma</th>
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
                            <td className="px-6 py-4 text-sm font-medium">
                              {t.firmName || '-'}
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
                    {CATEGORIES.map(category => {
                      const spent = transactions
                        .filter(t => t.category === category && t.type === 'expense')
                        .reduce((sum, t) => sum + t.amount, 0);
                      const earned = transactions
                        .filter(t => t.category === category && t.type === 'income')
                        .reduce((sum, t) => sum + t.amount, 0);
                      const budget = budgets[category] || 0;
                      const percentage = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                      
                      return (
                        <div key={category} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium">{category}</span>
                              {earned > 0 && (
                                <span className="text-[10px] font-bold text-green-500 uppercase tracking-wider">
                                  Toplam Gelir: ₺{earned.toLocaleString('tr-TR')}
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase block mb-1">Harcama Durumu</span>
                              <span className="text-sm font-medium text-gray-600 dark:text-slate-300">
                                ₺{spent.toLocaleString('tr-TR')} <span className="text-gray-400">/</span> ₺{budget.toLocaleString('tr-TR')}
                              </span>
                            </div>
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

            {activeTab === 'invoices' && (
              <motion.div 
                key="invoices"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="text"
                      placeholder="Firma veya fatura no ara..."
                      value={invoiceSearchTerm}
                      onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                      className={cn(
                        "w-full pl-10 pr-4 py-2 rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none transition-all",
                        isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-gray-200"
                      )}
                    />
                  </div>
                  <select
                    value={invoiceFirmFilter}
                    onChange={(e) => setInvoiceFirmFilter(e.target.value)}
                    className={cn(
                      "px-4 py-2 rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none transition-all",
                      isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-gray-200"
                    )}
                  >
                    <option value="all">Tüm Firmalar</option>
                    {firms.map(firm => <option key={firm} value={firm}>{firm}</option>)}
                  </select>
                </div>

                <div className={cn(
                  "rounded-2xl border shadow-sm overflow-hidden",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                )}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={cn(
                          "border-b text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-slate-400",
                          isDarkMode ? "bg-slate-800/50 border-slate-800" : "bg-gray-50 border-gray-100"
                        )}>
                          <th className="px-6 py-4">Sıra No</th>
                          <th className="px-6 py-4">Tarih</th>
                          <th className="px-6 py-4">Firma Adı</th>
                          <th className="px-6 py-4">Durum</th>
                          <th className="px-6 py-4">Fatura No</th>
                          <th className="px-6 py-4">KDV Matrahı</th>
                          <th className="px-6 py-4">KDV Oranı</th>
                          <th className="px-6 py-4">KDV Tutarı</th>
                          <th className="px-6 py-4">Toplam Tutar</th>
                          <th className="px-6 py-4 text-right">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className={cn(
                        "divide-y",
                        isDarkMode ? "divide-slate-800" : "divide-gray-100"
                      )}>
                        {filteredInvoices.map((inv, index) => (
                          <tr key={inv.id} className={cn(
                            "text-sm transition-colors",
                            isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-50"
                          )}>
                            <td className="px-6 py-4 font-medium">{index + 1}</td>
                            <td className="px-6 py-4">{format(parseISO(inv.date), 'dd.MM.yyyy')}</td>
                            <td className="px-6 py-4 font-semibold">{inv.firmName}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2 py-1 rounded-full text-xs font-medium",
                                inv.type === 'income' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                              )}>
                                {inv.type === 'income' ? 'Gelir' : 'Gider'}
                              </span>
                            </td>
                            <td className="px-6 py-4">{inv.invoiceNo}</td>
                            <td className="px-6 py-4">₺{inv.vatBase.toLocaleString('tr-TR')}</td>
                            <td className="px-6 py-4">%{inv.vatRate}</td>
                            <td className="px-6 py-4">₺{inv.vatAmount.toLocaleString('tr-TR')}</td>
                            <td className="px-6 py-4 font-bold">₺{inv.totalAmount.toLocaleString('tr-TR')}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => {
                                    setEditingInvoice(inv);
                                    setInvoiceFormData({ ...inv });
                                    setIsInvoiceModalOpen(true);
                                  }}
                                  className="p-2 hover:bg-blue-500/10 text-blue-500 rounded-lg transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleInvoiceDelete(inv.id)}
                                  className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
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
                </div>
              </motion.div>
            )}

            {activeTab === 'payments' && (
              <motion.div 
                key="payments"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className={cn(
                    "p-6 rounded-2xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                  )}>
                    <p className="text-sm text-gray-500 mb-1">Toplam Tahsilat</p>
                    <p className="text-2xl font-bold text-green-500">
                      ₺{payments.filter(p => p.type === 'collection').reduce((sum, p) => sum + p.amount, 0).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div className={cn(
                    "p-6 rounded-2xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                  )}>
                    <p className="text-sm text-gray-500 mb-1">Toplam Ödeme</p>
                    <p className="text-2xl font-bold text-red-500">
                      ₺{payments.filter(p => p.type === 'payment').reduce((sum, p) => sum + p.amount, 0).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div className={cn(
                    "p-6 rounded-2xl border shadow-sm",
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                  )}>
                    <p className="text-sm text-gray-500 mb-1">Genel Bakiye</p>
                    <p className="text-2xl font-bold">
                      ₺{(payments.filter(p => p.type === 'collection').reduce((sum, p) => sum + p.amount, 0) - 
                        payments.filter(p => p.type === 'payment').reduce((sum, p) => sum + p.amount, 0)).toLocaleString('tr-TR')}
                    </p>
                  </div>
                </div>

                <div className={cn(
                  "rounded-2xl border shadow-sm overflow-hidden",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                )}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={cn(
                          "border-b text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-slate-400",
                          isDarkMode ? "bg-slate-800/50 border-slate-800" : "bg-gray-50 border-gray-100"
                        )}>
                          <th className="px-6 py-4">Sıra No</th>
                          <th className="px-6 py-4">Tarih</th>
                          <th className="px-6 py-4">Firma Adı</th>
                          <th className="px-6 py-4">Durum</th>
                          <th className="px-6 py-4">Ödeme Şekli</th>
                          <th className="px-6 py-4">Tutar</th>
                          <th className="px-6 py-4">Firma Bakiyesi</th>
                          <th className="px-6 py-4 text-right">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className={cn(
                        "divide-y",
                        isDarkMode ? "divide-slate-800" : "divide-gray-100"
                      )}>
                        {filteredPayments.map((p, index) => (
                          <tr key={p.id} className={cn(
                            "text-sm transition-colors",
                            isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-50"
                          )}>
                            <td className="px-6 py-4 font-medium">{index + 1}</td>
                            <td className="px-6 py-4">{format(parseISO(p.date), 'dd.MM.yyyy')}</td>
                            <td className="px-6 py-4 font-semibold">{p.firmName}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2 py-1 rounded-full text-xs font-medium",
                                p.type === 'collection' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                              )}>
                                {p.type === 'collection' ? 'Tahsilat' : 'Ödeme'}
                              </span>
                            </td>
                            <td className="px-6 py-4">{p.paymentMethod}</td>
                            <td className="px-6 py-4 font-bold">₺{p.amount.toLocaleString('tr-TR')}</td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className={cn(
                                  "text-xs font-bold",
                                  debtStatus[p.firmName]?.balance > 0 ? "text-red-500" : 
                                  debtStatus[p.firmName]?.balance < 0 ? "text-green-500" : "text-gray-400"
                                )}>
                                  ₺{Math.abs(debtStatus[p.firmName]?.balance || 0).toLocaleString('tr-TR')}
                                </span>
                                <span className="text-[10px] text-gray-400 uppercase">
                                  {debtStatus[p.firmName]?.balance > 0 ? 'Borçlu' : 
                                   debtStatus[p.firmName]?.balance < 0 ? 'Alacaklı' : 'Kapalı'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => {
                                    setEditingPayment(p);
                                    setPaymentFormData({ ...p });
                                    setIsPaymentModalOpen(true);
                                  }}
                                  className="p-2 hover:bg-blue-500/10 text-blue-500 rounded-lg transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handlePaymentDelete(p.id)}
                                  className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
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
                </div>
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {firms.map(firm => {
                    const status = debtStatus[firm];
                    return (
                      <div key={firm} className={cn(
                        "p-6 rounded-2xl border shadow-sm",
                        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200"
                      )}>
                        <h3 className="font-bold text-lg mb-4">{firm}</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Toplam Faturalanan</span>
                            <span className="font-medium">₺{status.totalInvoiced.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Toplam Ödenen/Tahsil Edilen</span>
                            <span className="font-medium">₺{status.totalPaid.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center">
                            <span className="font-bold">Bakiye (Kalan)</span>
                            <span className={cn(
                              "font-bold text-lg",
                              status.balance > 0 ? "text-red-500" : status.balance < 0 ? "text-green-500" : ""
                            )}>
                              ₺{Math.abs(status.balance).toLocaleString('tr-TR')}
                              <span className="text-xs ml-1 font-medium">
                                {status.balance > 0 ? '(Borçlu)' : status.balance < 0 ? '(Alacaklı)' : '(Kapalı)'}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {firms.length === 0 && (
                    <div className="col-span-full p-20 text-center">
                      <div className={cn(
                        "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6",
                        isDarkMode ? "bg-slate-800" : "bg-gray-50"
                      )}>
                        <BarChart3 className="w-10 h-10 text-gray-300 dark:text-slate-600" />
                      </div>
                      <h3 className="text-lg font-bold mb-2">Henüz Rapor Verisi Yok</h3>
                      <p className="text-gray-500 dark:text-slate-400 max-w-sm mx-auto">
                        Firma bazlı borç/alacak raporlarını görebilmek için önce "Faturalarım" ve "Tahsilat / Ödeme" bölümlerinden kayıt eklemelisiniz.
                      </p>
                    </div>
                  )}
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
                  <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Firma / Müşteri Adı</label>
                  <input 
                    type="text" 
                    placeholder="Örn: ABC Ltd. Şti."
                    value={formData.firmName || ''}
                    onChange={(e) => setFormData({ ...formData, firmName: e.target.value })}
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

        {isInvoiceModalOpen && (
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
                "rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden transition-colors",
                isDarkMode ? "bg-slate-900" : "bg-white"
              )}
            >
              <div className={cn(
                "p-6 border-b flex items-center justify-between",
                isDarkMode ? "border-slate-800" : "border-gray-100"
              )}>
                <h2 className="text-xl font-bold">
                  {editingInvoice ? 'Faturayı Düzenle' : 'Yeni Fatura Ekle'}
                </h2>
                <button 
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    isDarkMode ? "hover:bg-slate-800" : "hover:bg-gray-100"
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleInvoiceAddOrEdit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setInvoiceFormData({ ...invoiceFormData, type: 'income' })}
                    className={cn(
                      "py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2",
                      invoiceFormData.type === 'income' 
                        ? (isDarkMode ? "border-green-500 bg-green-500/10 text-green-400" : "border-green-500 bg-green-50 text-green-700") 
                        : (isDarkMode ? "border-slate-800 text-slate-500 hover:border-slate-700" : "border-gray-100 text-gray-500 hover:border-gray-200")
                    )}
                  >
                    <TrendingUp className="w-4 h-4" />
                    Gelir Faturası
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceFormData({ ...invoiceFormData, type: 'expense' })}
                    className={cn(
                      "py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2",
                      invoiceFormData.type === 'expense' 
                        ? (isDarkMode ? "border-red-500 bg-red-500/10 text-red-400" : "border-red-500 bg-red-50 text-red-700") 
                        : (isDarkMode ? "border-slate-800 text-slate-500 hover:border-slate-700" : "border-gray-100 text-gray-500 hover:border-gray-200")
                    )}
                  >
                    <TrendingDown className="w-4 h-4" />
                    Gider Faturası
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Tarih</label>
                    <input 
                      type="date" 
                      required
                      value={invoiceFormData.date}
                      onChange={(e) => setInvoiceFormData({ ...invoiceFormData, date: e.target.value })}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Fatura No</label>
                    <input 
                      type="text" 
                      required
                      value={invoiceFormData.invoiceNo}
                      onChange={(e) => setInvoiceFormData({ ...invoiceFormData, invoiceNo: e.target.value })}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Firma Adı</label>
                  <input 
                    type="text" 
                    required
                    value={invoiceFormData.firmName}
                    onChange={(e) => setInvoiceFormData({ ...invoiceFormData, firmName: e.target.value })}
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                      isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">KDV Matrahı (₺)</label>
                    <input 
                      type="number" 
                      required
                      value={invoiceFormData.vatBase}
                      onChange={(e) => {
                        const base = parseFloat(e.target.value) || 0;
                        const amount = (base * invoiceFormData.vatRate) / 100;
                        setInvoiceFormData({ 
                          ...invoiceFormData, 
                          vatBase: base,
                          vatAmount: amount,
                          totalAmount: base + amount
                        });
                      }}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">KDV Oranı (%)</label>
                    <select 
                      value={invoiceFormData.vatRate}
                      onChange={(e) => {
                        const rate = parseInt(e.target.value);
                        const amount = (invoiceFormData.vatBase * rate) / 100;
                        setInvoiceFormData({ 
                          ...invoiceFormData, 
                          vatRate: rate,
                          vatAmount: amount,
                          totalAmount: invoiceFormData.vatBase + amount
                        });
                      }}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                      )}
                    >
                      <option value={0}>%0</option>
                      <option value={1}>%1</option>
                      <option value={8}>%8</option>
                      <option value={10}>%10</option>
                      <option value={18}>%18</option>
                      <option value={20}>%20</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">KDV Tutarı (₺)</label>
                    <input 
                      type="number" 
                      readOnly
                      value={invoiceFormData.vatAmount}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all opacity-70 cursor-not-allowed",
                        isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-100 border-gray-200"
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Toplam Tutar (₺)</label>
                    <input 
                      type="number" 
                      readOnly
                      value={invoiceFormData.totalAmount}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all font-bold",
                        isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-100 border-gray-200"
                      )}
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsInvoiceModalOpen(false)}
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
                    {editingInvoice ? 'Güncelle' : 'Kaydet'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {isPaymentModalOpen && (
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
                  {editingPayment ? 'Ödemeyi Düzenle' : 'Yeni Ödeme/Tahsilat'}
                </h2>
                <button 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    isDarkMode ? "hover:bg-slate-800" : "hover:bg-gray-100"
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handlePaymentAddOrEdit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setPaymentFormData({ ...paymentFormData, type: 'collection' })}
                    className={cn(
                      "py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2",
                      paymentFormData.type === 'collection' 
                        ? (isDarkMode ? "border-green-500 bg-green-500/10 text-green-400" : "border-green-500 bg-green-50 text-green-700") 
                        : (isDarkMode ? "border-slate-800 text-slate-500 hover:border-slate-700" : "border-gray-100 text-gray-500 hover:border-gray-200")
                    )}
                  >
                    <TrendingUp className="w-4 h-4" />
                    Tahsilat
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentFormData({ ...paymentFormData, type: 'payment' })}
                    className={cn(
                      "py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2",
                      paymentFormData.type === 'payment' 
                        ? (isDarkMode ? "border-red-500 bg-red-500/10 text-red-400" : "border-red-500 bg-red-50 text-red-700") 
                        : (isDarkMode ? "border-slate-800 text-slate-500 hover:border-slate-700" : "border-gray-100 text-gray-500 hover:border-gray-200")
                    )}
                  >
                    <TrendingDown className="w-4 h-4" />
                    Ödeme
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Tarih</label>
                  <input 
                    type="date" 
                    required
                    value={paymentFormData.date}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, date: e.target.value })}
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                      isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                    )}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Firma Adı</label>
                  <input 
                    type="text" 
                    required
                    value={paymentFormData.firmName}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, firmName: e.target.value })}
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                      isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Ödeme Şekli</label>
                    <select 
                      value={paymentFormData.paymentMethod}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentMethod: e.target.value as any })}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg outline-none transition-all",
                        isDarkMode ? "bg-slate-800 border-slate-700 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                      )}
                    >
                      <option value="Nakit">Nakit</option>
                      <option value="Banka">Banka</option>
                      <option value="Kredi Kartı">Kredi Kartı</option>
                      <option value="Çek">Çek</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Tutar (₺)</label>
                    <input 
                      type="number" 
                      required
                      min="0"
                      step="0.01"
                      value={paymentFormData.amount}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: parseFloat(e.target.value) })}
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
                    onClick={() => setIsPaymentModalOpen(false)}
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
                    {editingPayment ? 'Güncelle' : 'Kaydet'}
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
