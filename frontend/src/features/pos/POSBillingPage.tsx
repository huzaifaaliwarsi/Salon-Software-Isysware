import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  ServiceItem,
  PackageItem,
  StaffMember,
  PaymentAccount,
  Branch,
  Invoice,
  POSCartItem,
  POSCartComponentAssignment,
  POSPaymentEntry,
  CreatePOSInvoiceInput,
  Client,
  CustomerSource,
  Appointment,
  InventoryItem,
} from '@/types/salon';
import {
  getCatalogueSellingPrice,
  getCatalogueCode,
  getCatalogueTaxRuleId,
} from '@/utils/catalogueHelpers';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { ReceiptModal } from './ReceiptModal';
import { AppointmentQueueSheet } from './components/AppointmentQueueSheet';
import { CartOverwritePromptModal } from './components/CartOverwritePromptModal';
import { ClientFormModal } from '../clients/components/ClientFormModal';
import { toast } from '@/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';
import { allocatePackageRevenue, roundCurrency } from '@/lib/taxCalculations';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Search,
  ShoppingCart,
  Scissors,
  Package,
  Plus,
  Minus,
  Trash2,
  User,
  CreditCard,
  Banknote,
  Coins,
  Percent,
  CheckCircle2,
  AlertCircle,
  Building2,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Info,
  Calendar,
  Layers,
  ChevronDown,
  UserCheck,
  History,
  X,
  ChevronRight,
  Users,
} from 'lucide-react';

export const POSBillingPage: React.FC = () => {
  const { user, activeBranchId, allBranches, switchBranch, demoDate } = useAuth();

  // 1. Role Guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/pos" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  // Branch Scope
  const currentSelectedBranchId = isSuperAdmin
    ? (activeBranchId !== 'ALL' ? activeBranchId : allBranches[0]?.id || '')
    : (user.branchId as string);

  const [selectedBranchId, setSelectedBranchId] = useState<string>(currentSelectedBranchId);

  // Sync when activeBranchId changes
  useEffect(() => {
    if (isSuperAdmin && activeBranchId !== 'ALL') {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId, isSuperAdmin]);

  // Data collections
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [productStockMap, setProductStockMap] = useState<Record<string, number>>({});
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Catalogue UI state
  const [catalogueTab, setCatalogueTab] = useState<'SERVICES' | 'PACKAGES' | 'PRODUCTS'>('SERVICES');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Cart & Customer state
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [isWalkIn, setIsWalkIn] = useState(true);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [customerSource, setCustomerSource] = useState<CustomerSource>('WALK_IN');
  const [customerSourceDetails, setCustomerSourceDetails] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Customer search / lookup dropdown state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<Client[]>([]);
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Dues / Invoices collection modal state
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [customerOutstandingInvoices, setCustomerOutstandingInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [collectionPaymentMode, setCollectionPaymentMode] = useState<'CASH' | 'ONLINE' | 'SPLIT'>('CASH');
  const [collectionAmountInput, setCollectionAmountInput] = useState<number>(0);
  const [collectionCashTendered, setCollectionCashTendered] = useState<number>(0);
  const [collectionOnlineAccountId, setCollectionOnlineAccountId] = useState<string>('');
  const [splitCollectionCashAmount, setSplitCollectionCashAmount] = useState<number>(0);
  const [splitCollectionCashTendered, setSplitCollectionCashTendered] = useState<number>(0);
  const [splitCollectionOnlinePayments, setSplitCollectionOnlinePayments] = useState<
    Array<{ paymentAccountId: string; amount: number }>
  >([]);
  const [collectionNotes, setCollectionNotes] = useState('');
  const [isPostingCollection, setIsPostingCollection] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);

  // Discount & Tip state
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [applyBranchTax, setApplyBranchTax] = useState<boolean>(true);

  // Payment / Checkout dialog state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<'CASH' | 'ONLINE' | 'SPLIT' | 'UNPAID'>('CASH');
  const [cashTenderedInput, setCashTenderedInput] = useState<number>(0);
  const [selectedOnlineAccountId, setSelectedOnlineAccountId] = useState<string>('');
  const [onlineAmountInput, setOnlineAmountInput] = useState<number>(0);

  // Split payment state
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [splitCashTendered, setSplitCashTendered] = useState<number>(0);
  const [splitOnlinePayments, setSplitOnlinePayments] = useState<
    Array<{ paymentAccountId: string; amount: number }>
  >([]);

  // Posting & Receipt state
  const [isPosting, setIsPosting] = useState(false);
  const [postingError, setPostingError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [postedInvoice, setPostedInvoice] = useState<Invoice | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Appointment Queue & Handoff state
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [loadedAppointment, setLoadedAppointment] = useState<Appointment | null>(null);
  const [pendingAppointmentToLoad, setPendingAppointmentToLoad] = useState<Appointment | null>(null);
  const [isCartOverwritePromptOpen, setIsCartOverwritePromptOpen] = useState(false);
  const [acknowledgedPriceDiscrepancy, setAcknowledgedPriceDiscrepancy] = useState(false);

  // Load branch data
  const loadBranchData = async (bId: string) => {
    setIsLoading(true);
    try {
      const [branchList, srvList, pkgList, stfList, accList, prodList, batchList] = await Promise.all([
        salonService.getBranches(),
        salonService.getServices(bId),
        salonService.getPackages(bId),
        salonService.getStaffMembers(user, bId),
        salonService.getPaymentAccounts(bId),
        salonService.getInventoryItems(bId, user),
        salonService.getInventoryBatches(bId, undefined, user),
      ]);

      const br = branchList.find((b) => b.id === bId) || null;
      setCurrentBranch(br);
      // Filter active items for POS catalogue
      setServices(srvList.filter((s) => s.isActive));
      setPackages(pkgList.filter((p) => p.isActive));

      const retailProds = prodList.filter(
        (p) => (p.itemType === 'RETAIL_PRODUCT' || p.itemType === 'BOTH') && p.isActive
      );
      setProducts(retailProds);

      const sMap: Record<string, number> = {};
      const todayStr = demoDate || new Date().toISOString().split('T')[0];
      for (const p of retailProds) {
        const pBatches = batchList.filter((b) => {
          if (b.itemId !== p.id) return false;
          if (b.branchId && b.branchId !== bId) return false;
          if (b.status === 'QUARANTINED' || b.status === 'EXPIRED') return false;
          if (b.expiryDate && b.expiryDate < todayStr) return false;
          return (Number(b.remainingQuantity) || 0) > 0;
        });
        sMap[p.id] = pBatches.reduce((sum, b) => sum + (Number(b.remainingQuantity) || 0), 0);
      }
      setProductStockMap(sMap);

      // Only active staff can be assigned
      const activeStaff = stfList.filter((st) => st.isActive);
      setStaffList(activeStaff);
      // Only active payment accounts
      const activeAccounts = accList.filter((acc) => acc.isActive);
      setPaymentAccounts(activeAccounts);

      if (activeAccounts.length > 0) {
        setSelectedOnlineAccountId(activeAccounts[0].id);
        setCollectionOnlineAccountId(activeAccounts[0].id);
      }
    } catch (err) {
      console.error('Failed to load POS data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh queue count
  const refreshQueueCount = async (bId: string) => {
    try {
      const qDate = demoDate || new Date().toISOString().split('T')[0];
      const items = await salonService.getAppointmentQueue(bId, qDate, user);
      setQueueCount(items.length);
    } catch (err) {
      console.error('Failed to fetch queue count', err);
    }
  };

  useEffect(() => {
    if (selectedBranchId && selectedBranchId !== 'ALL') {
      loadBranchData(selectedBranchId);
      refreshQueueCount(selectedBranchId);
    }
  }, [selectedBranchId, demoDate]);

  // Check URL query parameters (?appointmentId=... or ?clientId=...)
  useEffect(() => {
    const searchStr = window.location.search || window.location.hash.split('?')[1] || '';
    if (!searchStr) return;
    const params = new URLSearchParams(searchStr);
    const appointmentIdParam = params.get('appointmentId');
    const clientIdParam = params.get('clientId');

    if (appointmentIdParam) {
      salonService.getAppointment(appointmentIdParam, user).then((appt) => {
        if (appt) {
          if (appt.billingStatus === 'BILLED') {
            toast.warning(`Appointment ${appt.appointmentNumber || appt.id} has already been billed under invoice ${appt.linkedInvoiceNumber || appt.linkedInvoiceId}.`);
          } else {
            handleOpenAppointmentInPOS(appt);
          }
        }
      });
    } else if (clientIdParam && selectedBranchId) {
      salonService.getClient(clientIdParam, user).then((cl) => {
        if (cl) handleSelectClient(cl);
      });
    }
  }, [selectedBranchId, services.length, packages.length]);

  // Customer search debounced lookup
  useEffect(() => {
    if (!customerSearchQuery.trim() || !selectedBranchId) {
      setCustomerSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingClients(true);
      try {
        const results = await salonService.searchClients(selectedBranchId, customerSearchQuery, user);
        setCustomerSearchResults(results);
      } catch (err) {
        console.error('Failed to search clients:', err);
      } finally {
        setIsSearchingClients(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearchQuery, selectedBranchId]);

  // Handle client selection from search
  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setSelectedClientId(client.id);
    setClientName(client.name);
    setClientPhone(client.phone);
    setCustomerSource(client.source || 'WALK_IN');
    setCustomerSourceDetails(client.sourceDetails || '');
    setIsWalkIn(false);
    setShowClientDropdown(false);
    setCustomerSearchQuery('');
  };

  // Reset to anonymous walk-in
  const handleSetWalkIn = () => {
    setIsWalkIn(true);
    setClientName('');
    setClientPhone('');
    setCustomerSource('WALK_IN');
    setCustomerSourceDetails('');
    setSelectedClientId(undefined);
    setSelectedClient(null);
    setShowClientDropdown(false);
  };

  // Quick Add Client modal state in POS
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientModalPrefill, setClientModalPrefill] = useState<{ name: string; phone: string }>({ name: '', phone: '' });

  const handleOpenAddClientModal = (query?: string) => {
    const q = (query !== undefined ? query : customerSearchQuery || clientName || clientPhone || '').trim();
    const isPhone = /^[\d+()\-\s]+$/.test(q) && q.replace(/\D/g, '').length >= 4;
    setClientModalPrefill({
      name: isPhone ? (clientName || '') : q,
      phone: isPhone ? q : (clientPhone || ''),
    });
    setIsClientModalOpen(true);
    setShowClientDropdown(false);
  };

  const handleClientCreated = (newClient: Client) => {
    handleSelectClient(newClient);
    setIsClientModalOpen(false);
  };

  // Open Previous Outstanding Invoices modal
  const handleOpenCollectionModal = async () => {
    if (!selectedBranchId || (!selectedClientId && !clientPhone)) return;
    setIsLoadingInvoices(true);
    setIsCollectionModalOpen(true);
    setCollectionError(null);
    try {
      const invs = await salonService.getClientOutstandingInvoices(
        selectedBranchId,
        selectedClientId || clientPhone,
        user
      );
      setCustomerOutstandingInvoices(invs);
      if (invs.length > 0) {
        setSelectedInvoiceForPayment(invs[0]);
        setCollectionAmountInput(invs[0].amountDue);
        setCollectionCashTendered(invs[0].amountDue);
      } else {
        setSelectedInvoiceForPayment(null);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch outstanding invoices.';
      setCollectionError(msg);
      toast.error(msg);
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  // Post collection payment against previous invoice
  const handlePostCollectionPayment = async () => {
    if (!selectedInvoiceForPayment || collectionAmountInput <= 0) return;
    setIsPostingCollection(true);
    setCollectionError(null);
    try {
      const pAmount = roundCurrency(collectionAmountInput);
      const payments: POSPaymentEntry[] = [];

      if (collectionPaymentMode === 'CASH') {
        const tendered = roundCurrency(collectionCashTendered || pAmount);
        const change = Math.max(0, roundCurrency(tendered - pAmount));
        payments.push({
          method: 'CASH',
          amount: pAmount,
          billAllocation: pAmount,
          tipAllocation: 0,
          cashTendered: tendered,
          changeReturned: change,
        });
      } else if (collectionPaymentMode === 'ONLINE') {
        const acc = paymentAccounts.find((a) => a.id === collectionOnlineAccountId);
        if (!acc) throw new Error('Please select an active payment account.');
        payments.push({
          method: 'ONLINE_ACCOUNT',
          paymentAccountId: acc.id,
          paymentAccountName: `${acc.name} (${acc.accountIdentifier || acc.providerName})`,
          amount: pAmount,
          billAllocation: pAmount,
          tipAllocation: 0,
        });
      } else if (collectionPaymentMode === 'SPLIT') {
        const cAmount = roundCurrency(splitCollectionCashAmount || 0);
        const cTendered = roundCurrency(splitCollectionCashTendered || cAmount);
        const cChange = Math.max(0, roundCurrency(cTendered - cAmount));

        if (cAmount > 0) {
          payments.push({
            method: 'CASH',
            amount: cAmount,
            billAllocation: cAmount,
            tipAllocation: 0,
            cashTendered: cTendered,
            changeReturned: cChange,
          });
        }

        for (const op of splitCollectionOnlinePayments) {
          const acc = paymentAccounts.find((a) => a.id === op.paymentAccountId);
          const opAmount = roundCurrency(op.amount || 0);
          if (opAmount > 0 && acc) {
            payments.push({
              method: 'ONLINE_ACCOUNT',
              paymentAccountId: acc.id,
              paymentAccountName: `${acc.name} (${acc.accountIdentifier || acc.providerName})`,
              amount: opAmount,
              billAllocation: opAmount,
              tipAllocation: 0,
            });
          }
        }
      }

      const collKey = `coll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const updatedInvoice = await salonService.collectInvoicePayment(
        {
          invoiceId: selectedInvoiceForPayment.id,
          payments,
          idempotencyKey: collKey,
          notes: collectionNotes || `Previous dues collected at POS for ${selectedInvoiceForPayment.clientName}`,
        },
        user
      );

      // Refresh client's outstanding balance
      if (selectedClientId && selectedBranchId) {
        const refreshedClient = await salonService.getClient(selectedClientId, user);
        if (refreshedClient) setSelectedClient(refreshedClient);
      }

      setPostedInvoice(updatedInvoice);
      setIsCollectionModalOpen(false);
      setIsReceiptOpen(true);
    } catch (err: any) {
      const msg = err.message || 'Failed to process collection payment.';
      setCollectionError(msg);
      toast.error(msg);
    } finally {
      setIsPostingCollection(false);
    }
  };

  // Categories list
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    services.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats);
  }, [services]);

  // Check if a package contains any deactivated service
  const getPackageValidity = (pkg: PackageItem) => {
    for (const comp of pkg.components) {
      const srv = services.find((s) => s.id === comp.serviceId);
      if (!srv || !srv.isActive) {
        return { isValid: false, reason: `Component '${comp.serviceName}' is deactivated` };
      }
    }
    return { isValid: true };
  };

  // Filtered catalogue
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || s.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [services, searchQuery, selectedCategory]);

  const filteredPackages = useMemo(() => {
    return packages.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [packages, searchQuery]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const handleAddProductToCart = (product: InventoryItem) => {
    const available = productStockMap[product.id] ?? 0;
    const existingInCart = cart.find((ci) => ci.item.id === product.id)?.quantity || 0;
    if (available <= 0) {
      toast.warning(`Product '${product.name}' is currently out of stock.`);
      return;
    }
    if (existingInCart + 1 > available) {
      toast.warning(`Cannot add more '${product.name}'. Remaining stock in branch: ${available}`);
      return;
    }

    const cartInstanceId = `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const newItem: POSCartItem = {
      cartInstanceId,
      type: 'PRODUCT',
      item: product,
      quantity: 1,
      staffId: '',
      staffName: '',
      staffCommissionRate: 0,
    };

    setCart((prev) => [...prev, newItem]);
  };

  // Add Service to Cart
  const handleAddServiceToCart = (service: ServiceItem) => {
    const cartInstanceId = `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const newItem: POSCartItem = {
      cartInstanceId,
      type: 'SERVICE',
      item: service,
      quantity: 1,
      staffId: '',
      staffName: '',
      staffCommissionRate: 0,
    };

    setCart((prev) => [...prev, newItem]);
  };

  // Add Package to Cart
  const handleAddPackageToCart = (pkg: PackageItem) => {
    const validity = getPackageValidity(pkg);
    if (!validity.isValid) return;

    const cartInstanceId = `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    // Build component assignments with revenue weights
    const alloc = allocatePackageRevenue(pkg.price, pkg.components);

    const compAssignments: POSCartComponentAssignment[] = alloc.allocatedComponents.map((c) => ({
      serviceId: c.serviceId,
      serviceCode: c.serviceCode,
      serviceName: c.serviceName,
      quantity: c.quantity,
      allocationPercentage: c.allocationPercentage,
      allocatedAmount: c.allocatedAmount,
      staffId: '',
      staffName: '',
      staffCommissionRate: 0,
    }));

    const newItem: POSCartItem = {
      cartInstanceId,
      type: 'PACKAGE',
      item: pkg,
      quantity: 1,
      staffId: '',
      staffName: '',
      staffCommissionRate: 0,
      assignedStaff: [],
      packageComponents: compAssignments,
    };

    setCart((prev) => [...prev, newItem]);
  };

  // Update Cart Item Quantity
  const handleUpdateQuantity = (cartInstanceId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((ci) => {
          if (ci.cartInstanceId === cartInstanceId) {
            const newQty = ci.quantity + delta;
            if (ci.type === 'PRODUCT' && delta > 0) {
              const available = productStockMap[ci.item.id] ?? 0;
              if (newQty > available) {
                toast.error(`Cannot exceed available branch stock of ${available} for '${ci.item.name}'.`);
                return ci;
              }
            }
            if (newQty <= 0) return null;

            if (ci.type === 'PACKAGE' && ci.assignedStaff && ci.assignedStaff.length > 0) {
              const newTotal = getCatalogueSellingPrice(ci.item) * newQty;
              const count = ci.assignedStaff.length;
              const oldTotal = getCatalogueSellingPrice(ci.item) * ci.quantity;

              let updatedStaff;
              if (oldTotal > 0) {
                let allocated = 0;
                updatedStaff = ci.assignedStaff.map((s, idx) => {
                  if (idx === count - 1) {
                    return { ...s, allocatedAmount: Math.max(0, newTotal - allocated) };
                  }
                  const ratio = (s.allocatedAmount ?? 0) / oldTotal;
                  const share = Math.round(newTotal * ratio);
                  allocated += share;
                  return { ...s, allocatedAmount: share };
                });
              } else {
                const equalShare = Math.floor(newTotal / count);
                const rem = newTotal - equalShare * count;
                updatedStaff = ci.assignedStaff.map((s, idx) => ({
                  ...s,
                  allocatedAmount: equalShare + (idx === 0 ? rem : 0),
                }));
              }
              return { ...ci, quantity: newQty, assignedStaff: updatedStaff };
            }

            return { ...ci, quantity: newQty };
          }
          return ci;
        })
        .filter(Boolean) as POSCartItem[]
    );
  };

  // Remove Cart Item
  const handleRemoveItem = (cartInstanceId: string) => {
    setCart((prev) => prev.filter((ci) => ci.cartInstanceId !== cartInstanceId));
  };

  // Assign staff to a service cart item
  const handleAssignStaff = (cartInstanceId: string, staffId: string) => {
    if (!staffId || staffId === 'unassigned') {
      setCart((prev) =>
        prev.map((ci) => {
          if (ci.cartInstanceId === cartInstanceId) {
            return {
              ...ci,
              staffId: '',
              staffName: '',
              staffCommissionRate: 0,
            };
          }
          return ci;
        })
      );
      return;
    }

    if (staffId === 'house') {
      setCart((prev) =>
        prev.map((ci) => {
          if (ci.cartInstanceId === cartInstanceId) {
            return {
              ...ci,
              staffId: 'house',
              staffName: 'House / Salon',
              staffCommissionRate: 0,
            };
          }
          return ci;
        })
      );
      return;
    }

    const staff = staffList.find((s) => s.id === staffId);
    if (!staff) return;

    setCart((prev) =>
      prev.map((ci) => {
        if (ci.cartInstanceId === cartInstanceId) {
          return {
            ...ci,
            staffId: staff.id,
            staffName: staff.name,
            staffCommissionRate: staff.commissionRate,
          };
        }
        return ci;
      })
    );
  };

  // Add staff member to a package line item
  const handleAddStaffToPackage = (cartInstanceId: string, staffId: string) => {
    const staff = staffId === 'house'
      ? { id: 'house', name: 'House / Salon', commissionRate: 0 }
      : staffList.find((s) => s.id === staffId);
    if (!staff) return;

    setCart((prev) =>
      prev.map((ci) => {
        if (ci.cartInstanceId !== cartInstanceId) return ci;
        const currentStaff = ci.assignedStaff || [];
        if (currentStaff.some((s) => s.staffId === staffId)) return ci;

        const totalLineAmount = getCatalogueSellingPrice(ci.item) * ci.quantity;
        const newStaffList = [
          ...currentStaff,
          {
            staffId: staff.id,
            staffName: staff.name,
            staffCommissionRate: staff.commissionRate,
            allocatedAmount: 0,
          },
        ];

        // Evenly divide totalLineAmount across all staff members so it always sums to totalLineAmount
        const count = newStaffList.length;
        const equalShare = Math.floor(totalLineAmount / count);
        const remainder = totalLineAmount - equalShare * count;

        const updatedStaff = newStaffList.map((s, idx) => ({
          ...s,
          allocatedAmount: equalShare + (idx === 0 ? remainder : 0),
        }));

        return {
          ...ci,
          staffId: updatedStaff[0].staffId,
          staffName: updatedStaff.map((s) => s.staffName).join(', '),
          staffCommissionRate: updatedStaff[0].staffCommissionRate,
          assignedStaff: updatedStaff,
        };
      })
    );
  };

  // Update custom sales allocation amount for a staff member on a package
  const handleUpdateStaffPackageAmount = (
    cartInstanceId: string,
    staffId: string,
    amount: number
  ) => {
    setCart((prev) =>
      prev.map((ci) => {
        if (ci.cartInstanceId !== cartInstanceId) return ci;
        const currentStaff = ci.assignedStaff || [];
        if (currentStaff.length === 0) return ci;

        const totalLineAmount = getCatalogueSellingPrice(ci.item) * ci.quantity;
        const targetStaff = currentStaff.find((s) => s.staffId === staffId);
        if (!targetStaff) return ci;

        // Strictly clamp amount between 0 and totalLineAmount ("packag price sa uper nhi jaega")
        const clampedAmount = Math.max(0, Math.min(Math.round(amount), totalLineAmount));
        const otherStaff = currentStaff.filter((s) => s.staffId !== staffId);

        if (otherStaff.length === 0) {
          // If only 1 staff member, they always get 100% of package price
          return {
            ...ci,
            assignedStaff: [{ ...targetStaff, allocatedAmount: totalLineAmount }],
          };
        }

        // The remaining balance that must be distributed across other staff
        const remainingBalance = totalLineAmount - clampedAmount;

        if (otherStaff.length === 1) {
          // Exactly 2 staff: (e.g. package=1500, staff1=1000 => staff2=500)
          const updatedStaff = currentStaff.map((s) => {
            if (s.staffId === staffId) return { ...s, allocatedAmount: clampedAmount };
            return { ...s, allocatedAmount: remainingBalance };
          });
          return { ...ci, assignedStaff: updatedStaff };
        }

        // More than 2 staff: distribute remainingBalance among other staff proportionally
        const currentOtherTotal = otherStaff.reduce(
          (sum, s) => sum + (s.allocatedAmount ?? 0),
          0
        );

        let allocatedSoFar = 0;
        const newOtherAllocations = new Map<string, number>();

        otherStaff.forEach((s, idx) => {
          if (idx === otherStaff.length - 1) {
            newOtherAllocations.set(s.staffId, Math.max(0, remainingBalance - allocatedSoFar));
          } else {
            let share = 0;
            if (currentOtherTotal > 0) {
              share = Math.round(remainingBalance * ((s.allocatedAmount ?? 0) / currentOtherTotal));
            } else {
              share = Math.floor(remainingBalance / otherStaff.length);
            }
            share = Math.max(0, Math.min(share, remainingBalance - allocatedSoFar));
            allocatedSoFar += share;
            newOtherAllocations.set(s.staffId, share);
          }
        });

        const updatedStaff = currentStaff.map((s) => {
          if (s.staffId === staffId) return { ...s, allocatedAmount: clampedAmount };
          return { ...s, allocatedAmount: newOtherAllocations.get(s.staffId) ?? 0 };
        });

        return {
          ...ci,
          assignedStaff: updatedStaff,
        };
      })
    );
  };

  // Split package total evenly across all assigned staff
  const handleEqualizeStaffPackageAmounts = (cartInstanceId: string) => {
    setCart((prev) =>
      prev.map((ci) => {
        if (ci.cartInstanceId !== cartInstanceId) return ci;
        const currentStaff = ci.assignedStaff || [];
        if (currentStaff.length === 0) return ci;
        const totalLineAmount = getCatalogueSellingPrice(ci.item) * ci.quantity;
        const count = currentStaff.length;
        const equalShare = Math.floor(totalLineAmount / count);
        const remainder = totalLineAmount - equalShare * count;

        const updatedStaff = currentStaff.map((s, idx) => ({
          ...s,
          allocatedAmount: equalShare + (idx === 0 ? remainder : 0),
        }));

        return {
          ...ci,
          assignedStaff: updatedStaff,
        };
      })
    );
  };

  // Remove staff member from a package line item
  const handleRemoveStaffFromPackage = (cartInstanceId: string, staffId: string) => {
    setCart((prev) =>
      prev.map((ci) => {
        if (ci.cartInstanceId !== cartInstanceId) return ci;
        const currentStaff = ci.assignedStaff || [];
        const updatedStaffRaw = currentStaff.filter((s) => s.staffId !== staffId);

        if (updatedStaffRaw.length === 0) {
          return {
            ...ci,
            staffId: '',
            staffName: '',
            staffCommissionRate: 0,
            assignedStaff: [],
          };
        }

        const totalLineAmount = getCatalogueSellingPrice(ci.item) * ci.quantity;
        const count = updatedStaffRaw.length;
        const equalShare = Math.floor(totalLineAmount / count);
        const remainder = totalLineAmount - equalShare * count;

        const updatedStaff = updatedStaffRaw.map((s, idx) => ({
          ...s,
          allocatedAmount: equalShare + (idx === 0 ? remainder : 0),
        }));

        return {
          ...ci,
          staffId: updatedStaff[0].staffId,
          staffName: updatedStaff.map((s) => s.staffName).join(', '),
          staffCommissionRate: updatedStaff[0].staffCommissionRate,
          assignedStaff: updatedStaff,
        };
      })
    );
  };

  // Assign staff to a specific package component (legacy fallback)
  const handleAssignPackageComponentStaff = (
    cartInstanceId: string,
    serviceId: string,
    staffId: string
  ) => {
    const staff = staffList.find((s) => s.id === staffId);
    if (!staff) return;

    setCart((prev) =>
      prev.map((ci) => {
        if (ci.cartInstanceId === cartInstanceId && ci.packageComponents) {
          const updatedComps = ci.packageComponents.map((comp) => {
            if (comp.serviceId === serviceId) {
              return {
                ...comp,
                staffId: staff.id,
                staffName: staff.name,
                staffCommissionRate: staff.commissionRate,
              };
            }
            return comp;
          });
          return { ...ci, packageComponents: updatedComps };
        }
        return ci;
      })
    );
  };

  // Clear Cart
  const handleClearCart = () => {
    setCart([]);
    setDiscountValue(0);
    setTipAmount(0);
    setInvoiceNotes('');
    setLoadedAppointment(null);
    setAcknowledgedPriceDiscrepancy(false);
    setApplyBranchTax(true);
  };

  // Open Appointment in POS
  const handleOpenAppointmentInPOS = (appt: Appointment, forceReplace = false) => {
    if (cart.length > 0 && !forceReplace) {
      setPendingAppointmentToLoad(appt);
      setIsCartOverwritePromptOpen(true);
      return;
    }

    setLoadedAppointment(appt);
    setAcknowledgedPriceDiscrepancy(false);
    setIsWalkIn(false);
    setClientName(appt.clientName);
    setClientPhone(appt.clientPhone);
    setCustomerSource((appt.customerSource as CustomerSource) || 'WALK_IN');
    setCustomerSourceDetails(appt.customerSourceDetails || '');
    if (appt.clientId) {
      setSelectedClientId(appt.clientId);
    }

    // Map items
    const newCartItems: POSCartItem[] = [];

    if (appt.items && appt.items.length > 0) {
      for (const itm of appt.items) {
        if (itm.type === 'PACKAGE') {
          const matchedPkg = packages.find((p) => p.id === itm.itemId) || {
            id: itm.itemId,
            branchId: appt.branchId,
            code: itm.code,
            name: itm.name,
            price: itm.unitPrice,
            components: (itm.packageComponents || []).map((c) => ({
              serviceId: c.serviceId,
              serviceCode: c.serviceCode,
              serviceName: c.serviceName,
              quantity: 1,
              allocationPercentage: c.allocationPercentage,
              unitPrice: 0,
            })),
            taxTreatment: 'BRANCH_DEFAULT' as const,
            isActive: true,
          };

          const alloc = allocatePackageRevenue(matchedPkg.price, matchedPkg.components);
          const compAssignments: POSCartComponentAssignment[] = alloc.allocatedComponents.map((c) => {
            const bookedComp = itm.packageComponents?.find((bc) => bc.serviceId === c.serviceId);
            const staffId = bookedComp?.staffId || itm.staffId || '';
            const staffMember = staffId ? staffList.find((s) => s.id === staffId) : undefined;
            const staffName = bookedComp?.staffName || itm.staffName || staffMember?.name || '';

            return {
              serviceId: c.serviceId,
              serviceCode: c.serviceCode,
              serviceName: c.serviceName,
              quantity: c.quantity,
              allocationPercentage: c.allocationPercentage,
              allocatedAmount: c.allocatedAmount,
              staffId,
              staffName,
              staffCommissionRate: staffMember?.commissionRate ?? 0,
            };
          });

          const primaryStaffId = compAssignments.find((c) => c.staffId)?.staffId || itm.staffId || '';
          const primaryStaffMember = primaryStaffId ? staffList.find((s) => s.id === primaryStaffId) : undefined;
          const primaryStaffName = compAssignments.find((c) => c.staffName)?.staffName || itm.staffName || primaryStaffMember?.name || '';

          const packageAssignedStaff = itm.assignedStaff && itm.assignedStaff.length > 0
            ? itm.assignedStaff.map((as) => {
                const member = staffList.find((s) => s.id === as.staffId);
                return {
                  staffId: as.staffId,
                  staffName: as.staffName || member?.name || 'Stylist',
                  staffCommissionRate: as.staffCommissionRate ?? member?.commissionRate ?? 0,
                };
              })
            : (primaryStaffId
                ? [
                    {
                      staffId: primaryStaffId,
                      staffName: primaryStaffName,
                      staffCommissionRate: primaryStaffMember?.commissionRate ?? 0,
                    },
                  ]
                : []);

          newCartItems.push({
            cartInstanceId: itm.lineInstanceId || `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'PACKAGE',
            item: matchedPkg,
            quantity: 1,
            staffId: primaryStaffId,
            staffName: packageAssignedStaff.map((s) => s.staffName).join(', ') || primaryStaffName,
            staffCommissionRate: primaryStaffMember?.commissionRate ?? 0.1,
            assignedStaff: packageAssignedStaff,
            packageComponents: compAssignments,
          });
        } else {
          const matchedService = services.find((s) => s.id === itm.itemId) || {
            id: itm.itemId,
            branchId: appt.branchId,
            code: itm.code,
            name: itm.name,
            category: 'General',
            durationMinutes: itm.durationMinutes,
            price: itm.unitPrice,
            taxTreatment: 'BRANCH_DEFAULT' as const,
            isActive: true,
          };

          const staffId = itm.staffId || '';
          const staffMember = staffId ? staffList.find((s) => s.id === staffId) : undefined;
          const staffName = itm.staffName || staffMember?.name || '';

          newCartItems.push({
            cartInstanceId: itm.lineInstanceId || `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'SERVICE',
            item: matchedService,
            quantity: 1,
            staffId,
            staffName,
            staffCommissionRate: staffMember?.commissionRate ?? 0,
          });
        }
      }
    }

    setCart(newCartItems);
    setIsQueueOpen(false);
  };

  // Financial Calculations
  const calculations = useMemo(() => {
    const grossSubtotal = roundCurrency(
      cart.reduce((sum, ci) => sum + getCatalogueSellingPrice(ci.item) * ci.quantity, 0)
    );

    let calculatedDiscount = 0;
    if (discountType === 'PERCENTAGE') {
      const pct = Math.max(0, Math.min(100, discountValue || 0));
      calculatedDiscount = roundCurrency(grossSubtotal * (pct / 100));
    } else {
      calculatedDiscount = roundCurrency(Math.max(0, Math.min(grossSubtotal, discountValue || 0)));
    }

    // Branch sales tax (configured in Branch Settings)
    const branchTaxRate = (applyBranchTax && currentBranch?.taxEnabled) ? (currentBranch.taxRate || 0) : 0;
    let totalTax = 0;

    const lineCalculations = cart.map((ci) => {
      const itemPrice = getCatalogueSellingPrice(ci.item);
      const gross = roundCurrency(itemPrice * ci.quantity);
      const lineDisc = grossSubtotal > 0 ? roundCurrency((gross / grossSubtotal) * calculatedDiscount) : 0;
      const lineNet = roundCurrency(gross - lineDisc);

      const effectiveTaxRate = branchTaxRate;
      const lineTax = roundCurrency(lineNet * effectiveTaxRate);
      totalTax = roundCurrency(totalTax + lineTax);

      return {
        ...ci,
        gross,
        lineDisc,
        lineNet,
        effectiveTaxRate,
        lineTax,
        lineTotal: roundCurrency(lineNet + lineTax),
      };
    });

    const netSales = roundCurrency(grossSubtotal - calculatedDiscount);
    const billTotal = roundCurrency(netSales + totalTax); // Bill excluding tips
    const cleanTip = Math.max(0, roundCurrency(tipAmount || 0));
    const fullInvoiceTotal = roundCurrency(billTotal + cleanTip);

    return {
      grossSubtotal,
      calculatedDiscount,
      netSales,
      totalTax,
      billTotal,
      cleanTip,
      fullInvoiceTotal,
      lineCalculations,
    };
  }, [cart, discountType, discountValue, tipAmount, currentBranch, applyBranchTax]);

  // Check if booking quote differs from canonical cart subtotal
  const bookingPriceDiscrepancy = useMemo(() => {
    if (!loadedAppointment) return null;
    const bookingQuoted = loadedAppointment.price || 0;
    const canonicalSubtotal = calculations.grossSubtotal;
    const diff = canonicalSubtotal - bookingQuoted;
    if (Math.abs(diff) > 0.5) {
      return {
        quoted: bookingQuoted,
        canonical: canonicalSubtotal,
        difference: diff,
      };
    }
    return null;
  }, [loadedAppointment, calculations.grossSubtotal]);

  // Open Checkout Modal
  const handleOpenCheckout = () => {
    if (cart.length === 0) return;

    // Check if any service in cart is unassigned and warn cashier
    const unassignedService = cart.find(
      (ci) => ci.type === 'SERVICE' && (!ci.staffId || ci.staffId === 'unassigned')
    );
    if (unassignedService) {
      toast.warning(`Please select an assigned staff member for '${unassignedService.item.name}' before checkout.`);
      return;
    }
    
    // Auto-assign House / Salon to any package that doesn't have assigned staff
    setCart((prev) =>
      prev.map((ci) => {
        if (ci.type === 'PACKAGE' && (!ci.assignedStaff || ci.assignedStaff.length === 0)) {
          const totalLineAmount = getCatalogueSellingPrice(ci.item) * ci.quantity;
          return {
            ...ci,
            staffId: 'house',
            staffName: 'House / Salon',
            staffCommissionRate: 0,
            assignedStaff: [
              {
                staffId: 'house',
                staffName: 'House / Salon',
                staffCommissionRate: 0,
                allocatedAmount: totalLineAmount,
              },
            ],
          };
        }
        return ci;
      })
    );

    if (bookingPriceDiscrepancy && !acknowledgedPriceDiscrepancy) {
      toast.warning(
        `Price Quote Notice: The quoted booking price was ${formatCurrency(
          bookingPriceDiscrepancy.quoted
        )}, but active catalogue subtotal is ${formatCurrency(
          bookingPriceDiscrepancy.canonical
        )}. Please acknowledge the price difference in the cart banner before checking out.`
      );
      return;
    }
    setPostingError(null);
    setIdempotencyKey(`pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);

    // Pre-populate exact amounts
    const billAndTip = calculations.fullInvoiceTotal;
    setCashTenderedInput(billAndTip);
    setOnlineAmountInput(billAndTip);
    setSplitCashAmount(calculations.billTotal);
    setSplitCashTendered(calculations.billTotal);
    setSplitOnlinePayments([]);

    setIsCheckoutOpen(true);
  };

  // Submit and Post POS Invoice
  const handlePostInvoice = async () => {
    if (!currentBranch || cart.length === 0) return;
    setIsPosting(true);
    setPostingError(null);

    try {
      const payments: POSPaymentEntry[] = [];
      const billTotal = calculations.billTotal;
      const tipAmount = calculations.cleanTip;

      if (checkoutMode === 'CASH') {
        const cashTendered = roundCurrency(cashTenderedInput || 0);
        const retained = Math.min(cashTendered, calculations.fullInvoiceTotal);
        const change = Math.max(0, roundCurrency(cashTendered - retained));

        // Allocate retained to bill first, then tip
        const billAlloc = Math.min(retained, billTotal);
        const tipAlloc = Math.min(Math.max(0, roundCurrency(retained - billAlloc)), tipAmount);

        if (retained > 0) {
          payments.push({
            method: 'CASH',
            amount: retained,
            billAllocation: billAlloc,
            tipAllocation: tipAlloc,
            cashTendered,
            changeReturned: change,
          });
        }
      } else if (checkoutMode === 'ONLINE') {
        const selectedAcc = paymentAccounts.find((a) => a.id === selectedOnlineAccountId);
        if (!selectedAcc && (onlineAmountInput || 0) > 0) {
          throw new Error('Please select an active online payment account.');
        }

        const onlineAmount = roundCurrency(onlineAmountInput || 0);
        if (onlineAmount > calculations.fullInvoiceTotal) {
          throw new Error(`Online payment cannot exceed total due (${calculations.fullInvoiceTotal} PKR).`);
        }

        const billAlloc = Math.min(onlineAmount, billTotal);
        const tipAlloc = Math.min(Math.max(0, roundCurrency(onlineAmount - billAlloc)), tipAmount);

        if (onlineAmount > 0 && selectedAcc) {
          payments.push({
            method: 'ONLINE_ACCOUNT',
            paymentAccountId: selectedAcc.id,
            paymentAccountName: `${selectedAcc.name} (${selectedAcc.accountIdentifier || selectedAcc.providerName})`,
            amount: onlineAmount,
            billAllocation: billAlloc,
            tipAllocation: tipAlloc,
          });
        }
      } else if (checkoutMode === 'SPLIT') {
        // Cash component
        const cAmount = roundCurrency(splitCashAmount || 0);
        const cTendered = roundCurrency(splitCashTendered || cAmount);
        const cChange = Math.max(0, roundCurrency(cTendered - cAmount));

        if (cAmount > 0) {
          const bAlloc = Math.min(cAmount, billTotal);
          const tAlloc = Math.min(Math.max(0, roundCurrency(cAmount - bAlloc)), tipAmount);
          payments.push({
            method: 'CASH',
            amount: cAmount,
            billAllocation: bAlloc,
            tipAllocation: tAlloc,
            cashTendered: cTendered,
            changeReturned: cChange,
          });
        }

        // Online components
        let accumulatedBill = payments.reduce((sum, p) => sum + p.billAllocation, 0);
        let accumulatedTip = payments.reduce((sum, p) => sum + p.tipAllocation, 0);

        for (const op of splitOnlinePayments) {
          const acc = paymentAccounts.find((a) => a.id === op.paymentAccountId);
          const opAmount = roundCurrency(op.amount || 0);
          if (opAmount > 0 && acc) {
            const remainingBill = Math.max(0, roundCurrency(billTotal - accumulatedBill));
            const bAlloc = Math.min(opAmount, remainingBill);
            const remainingTip = Math.max(0, roundCurrency(tipAmount - accumulatedTip));
            const tAlloc = Math.min(Math.max(0, roundCurrency(opAmount - bAlloc)), remainingTip);

            accumulatedBill += bAlloc;
            accumulatedTip += tAlloc;

            payments.push({
              method: 'ONLINE_ACCOUNT',
              paymentAccountId: acc.id,
              paymentAccountName: `${acc.name} (${acc.accountIdentifier || acc.providerName})`,
              amount: opAmount,
              billAllocation: bAlloc,
              tipAllocation: tAlloc,
            });
          }
        }
      }

      // Check if partial or unpaid: customer name & phone are required
      const retainedTotal = payments.reduce((sum, p) => sum + p.amount, 0);
      const isDueRemaining = (calculations.fullInvoiceTotal - retainedTotal) > 0.01;

      if (isDueRemaining) {
        const cleanName = (clientName || '').trim();
        const cleanPhone = (clientPhone || '').replace(/\D/g, '');
        if (!cleanName || cleanName.toLowerCase() === 'walk-in customer' || cleanName.toLowerCase() === 'walk-in' || isWalkIn) {
          throw new Error('A specific customer name is required for Partial or Unpaid invoices so dues are tracked in their Client Ledger.');
        }
        if (!cleanPhone || cleanPhone.length < 10) {
          throw new Error('A valid customer contact phone number (at least 10 digits) is required for Partial or Unpaid invoices.');
        }
      }

      // Sanitize cart items so lines without assigned staff fallback cleanly to 'house' (No Staff / Salon)
      const sanitizedCart = cart.map((ci) => ({
        ...ci,
        staffId: (!ci.staffId || ci.staffId === 'unassigned') ? 'house' : ci.staffId,
        staffName: (!ci.staffName || ci.staffId === 'house' || ci.staffId === 'unassigned') ? 'House / Salon' : ci.staffName,
        assignedStaff: (ci.assignedStaff && ci.assignedStaff.length > 0)
          ? ci.assignedStaff.map((as) => ({
              ...as,
              staffId: (!as.staffId || as.staffId === 'unassigned') ? 'house' : as.staffId,
              staffName: (!as.staffName || as.staffId === 'house' || as.staffId === 'unassigned') ? 'House / Salon' : as.staffName,
            }))
          : [{ staffId: 'house', staffName: 'House / Salon', staffCommissionRate: 0, allocatedAmount: getCatalogueSellingPrice(ci.item) * ci.quantity }],
      }));

      // Input payload
      const payload: CreatePOSInvoiceInput = {
        branchId: currentBranch.id,
        appointmentId: loadedAppointment?.id,
        clientId: selectedClientId,
        clientName: isWalkIn ? 'Walk-in Customer' : clientName,
        clientPhone: isWalkIn ? 'N/A' : clientPhone,
        customerSource,
        customerSourceDetails: customerSourceDetails?.trim(),
        discountType,
        discountValue,
        tip: tipAmount,
        applyTax: applyBranchTax,
        cartItems: sanitizedCart,
        payments,
        idempotencyKey,
        notes: invoiceNotes,
      };

      const result = await salonService.postPOSInvoice(payload, user);

      toast.success(`Invoice #${result.invoiceNumber} posted and completed successfully!`);
      setPostedInvoice(result);
      setIsCheckoutOpen(false);
      handleClearCart();
      setIsReceiptOpen(true);
      if (selectedBranchId) {
        loadBranchData(selectedBranchId);
        refreshQueueCount(selectedBranchId);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to post POS invoice. Please retry.';
      setPostingError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsPosting(false);
    }
  };

  const currentCartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0);

  return (
    <div className="space-y-4 pb-12 font-sans">
      {/* 1. Header & Branch Selection bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2254E1]/10 text-[#2254E1] flex items-center justify-center font-bold">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              POS Billing & Reception
              <Badge variant="neutral" className="text-[10px] font-mono">
                {currentBranch?.code || 'LHE-01'}
              </Badge>
            </h1>
            <p className="text-xs text-slate-500">
              {currentBranch?.name} • System Date: <span className="font-semibold text-slate-700">{demoDate}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsQueueOpen(true)}
            className="h-9 text-xs gap-1.5 font-semibold border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            Appointments Queue
            {queueCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                {queueCount}
              </span>
            )}
          </Button>

          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <Select
                value={selectedBranchId}
                onValueChange={(val) => {
                  setSelectedBranchId(val);
                  switchBranch(val);
                }}
              >
                <SelectTrigger className="w-[220px] text-xs h-9 font-medium bg-slate-50">
                  <SelectValue placeholder="Select Active Branch" />
                </SelectTrigger>
                <SelectContent>
                  {allBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs">
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* 2. Top Bar: Customer Details & Lookup Header */}
      <Card className="p-4 bg-white border-slate-200/80 shadow-2xs">
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#2254E1]" />
              <h2 className="text-sm font-bold text-slate-900">Customer Attribution & Dues</h2>
              {selectedClient ? (
                <Badge variant="success" className="text-[11px] gap-1">
                  <UserCheck className="w-3 h-3" />
                  Registered Profile
                </Badge>
              ) : isWalkIn ? (
                <Badge variant="neutral" className="text-[11px]">
                  Anonymous Walk-in
                </Badge>
              ) : (
                <Badge variant="warning" className="text-[11px]">
                  New Customer
                </Badge>
              )}
            </div>

            {/* Existing Customer Search / Lookup & Quick Add */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-72">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <Input
                    placeholder="Lookup client by name or phone..."
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setShowClientDropdown(true);
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    className="pl-8 text-xs h-8 bg-slate-50 border-slate-200"
                  />
                  {isSearchingClients && (
                    <RefreshCw className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-400 animate-spin" />
                  )}
                </div>

                {/* Client Dropdown Results */}
                {showClientDropdown && (
                  <div className="absolute left-0 right-0 top-9 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                    {customerSearchResults.length > 0 ? (
                      <>
                        {customerSearchResults.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => handleSelectClient(client)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50/70 border-b border-slate-100 last:border-none flex justify-between items-center text-xs transition-colors"
                          >
                            <div>
                              <span className="font-bold text-slate-900 block">{client.name}</span>
                              <span className="text-[10px] text-slate-500">{client.phone}</span>
                            </div>
                            {client.outstandingBalance && client.outstandingBalance > 0 ? (
                              <Badge variant="warning" className="text-[10px]">
                                Due: {formatCurrency(client.outstandingBalance)}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-slate-400">Clear</span>
                            )}
                          </button>
                        ))}
                        <div className="p-2 border-t border-slate-100 bg-slate-50/70">
                          <button
                            type="button"
                            onClick={() => handleOpenAddClientModal(customerSearchQuery)}
                            className="w-full text-left px-2 py-1 text-[11px] text-[#2254E1] hover:underline font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Register another client in CRM
                          </button>
                        </div>
                      </>
                    ) : customerSearchQuery.trim() ? (
                      <div className="p-3 text-center text-xs space-y-2">
                        <p className="text-slate-500 text-[11px]">No registered client matches "{customerSearchQuery}".</p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleOpenAddClientModal(customerSearchQuery)}
                          className="h-7 text-xs bg-[#2254E1] hover:bg-[#1B44B8] text-white gap-1 w-full"
                        >
                          <Plus className="w-3 h-3" />
                          Register "{customerSearchQuery}" in CRM
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleOpenAddClientModal()}
                className="h-8 text-xs font-semibold gap-1 text-[#2254E1] border-blue-200 hover:bg-blue-50 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Client
              </Button>
            </div>
          </div>

          {/* Customer Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Customer Name <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="Walk-in Customer"
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  setIsWalkIn(false);
                }}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="+92 300 1234567"
                value={clientPhone}
                onChange={(e) => {
                  setClientPhone(e.target.value);
                  setIsWalkIn(false);
                }}
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Customer Source
              </label>
              <Select
                value={customerSource}
                onValueChange={(val: CustomerSource) => setCustomerSource(val)}
              >
                <SelectTrigger className="text-xs h-9 bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WALK_IN" className="text-xs">
                    Walk-in
                  </SelectItem>
                  <SelectItem value="REFERRAL" className="text-xs">
                    Referral
                  </SelectItem>
                  <SelectItem value="SOCIAL_MEDIA" className="text-xs">
                    Social Media
                  </SelectItem>
                  <SelectItem value="OTHER" className="text-xs">
                    Other
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                {customerSource === 'REFERRAL'
                  ? 'Referrer Name / Code'
                  : customerSource === 'SOCIAL_MEDIA'
                  ? 'Platform / Handle'
                  : 'Source Details'}
              </label>
              <Input
                placeholder={
                  customerSource === 'REFERRAL'
                    ? 'e.g. Dr. Usman'
                    : customerSource === 'SOCIAL_MEDIA'
                    ? 'e.g. Instagram @handle'
                    : 'Notes / Source details'
                }
                value={customerSourceDetails}
                onChange={(e) => setCustomerSourceDetails(e.target.value)}
                disabled={customerSource === 'WALK_IN'}
                className="text-xs h-9"
              />
            </div>
          </div>

          {/* Registered Customer Status Card */}
          {selectedClient && (
            <div className="mt-3 p-3 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">{selectedClient.name}</span>
                    <Badge variant="primary" className="text-[10px] py-0 px-1.5">
                      CRM Registered
                    </Badge>
                  </div>
                  <span className="text-[11px] text-slate-500 block">
                    {selectedClient.phone} {selectedClient.totalVisits ? `· ${selectedClient.totalVisits} visits on record` : '· First recorded visit'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSetWalkIn}
                  className="h-7 text-xs text-slate-600 hover:text-rose-600 hover:bg-rose-50 border-slate-200"
                >
                  Clear (Switch to Walk-in)
                </Button>
              </div>
            </div>
          )}

          {/* Previous Outstanding Balance Banner */}
          {selectedClient && (selectedClient.outstandingBalance || 0) > 0 && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div>
                  <span className="font-bold">Previous Outstanding Balance: </span>
                  <span className="font-mono font-bold text-amber-800 text-sm">
                    {formatCurrency(selectedClient.outstandingBalance || 0)}
                  </span>
                  <span className="text-[11px] text-amber-700 block sm:inline sm:ml-2">
                    (Previous dues are kept 100% separate from current cart)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenCollectionModal}
                  className="text-xs h-8 bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  <History className="w-3.5 h-3.5 mr-1" />
                  View Unpaid Invoices
                </Button>

                <Button
                  size="sm"
                  onClick={handleOpenCollectionModal}
                  className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  <Banknote className="w-3.5 h-3.5 mr-1" />
                  Collect Previous Dues
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 3. Main Desktop Grid: Left Catalogue (65%), Right Billing Summary (35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Catalogue & Cart (lg:col-span-7 or 8) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Catalogue Tab Controls */}
          <Card className="p-4 bg-white border-slate-200/80 shadow-2xs">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Tabs value={catalogueTab} onValueChange={(val: any) => setCatalogueTab(val)}>
                  <TabsList className="bg-slate-100 p-0.5 h-9">
                    <TabsTrigger value="SERVICES" className="text-xs font-semibold px-3 h-8">
                      <Scissors className="w-3.5 h-3.5 mr-1" />
                      Services ({services.length})
                    </TabsTrigger>
                    <TabsTrigger value="PACKAGES" className="text-xs font-semibold px-3 h-8">
                      <Layers className="w-3.5 h-3.5 mr-1" />
                      Packages ({packages.length})
                    </TabsTrigger>
                    <TabsTrigger value="PRODUCTS" className="text-xs font-semibold px-3 h-8">
                      <Package className="w-3.5 h-3.5 mr-1" />
                      Products ({filteredProducts.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Search */}
                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <Input
                    placeholder="Search item or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 text-xs h-8 bg-slate-50 border-slate-200"
                  />
                </div>
              </div>

              {/* Service Categories Filter Pills */}
              {catalogueTab === 'SERVICES' && availableCategories.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setSelectedCategory('ALL')}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors flex-shrink-0 ${
                      selectedCategory === 'ALL'
                        ? 'bg-[#2254E1] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Categories
                  </button>
                  {availableCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors flex-shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-[#2254E1] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Catalogue Grid Display */}
          <div className="max-h-[380px] overflow-y-auto pr-1">
            {catalogueTab === 'SERVICES' ? (
              filteredServices.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                  No matching active services found for this branch.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredServices.map((srv) => (
                    <div
                      key={srv.id}
                      className="bg-white p-3.5 rounded-xl border border-slate-200/80 hover:border-[#2254E1]/50 hover:shadow-xs transition-all flex flex-col justify-between space-y-2 group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">
                            {srv.code}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-xs mt-1 tracking-tight group-hover:text-[#2254E1] transition-colors">
                          {srv.name}
                        </h3>
                        {srv.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{srv.description}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatCurrency(srv.price)}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => handleAddServiceToCart(srv)}
                          className="h-7 px-3 bg-[#2254E1] hover:bg-[#1B44B8] text-white text-xs gap-1 rounded-lg"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : catalogueTab === 'PACKAGES' ? (
              filteredPackages.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                  No matching active packages found.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredPackages.map((pkg) => {
                    const validity = getPackageValidity(pkg);
                    return (
                      <div
                        key={pkg.id}
                        className={`bg-white p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2 ${
                          validity.isValid
                            ? 'border-slate-200/80 hover:border-[#2254E1]/50 hover:shadow-xs'
                            : 'border-rose-200 bg-rose-50/20 opacity-75'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold">
                              {pkg.code}
                            </span>
                            <Badge variant="neutral" className="text-[9px]">
                              {pkg.components.length} Components
                            </Badge>
                          </div>
                          <h3 className="font-bold text-slate-900 text-xs mt-1 tracking-tight">
                            {pkg.name}
                          </h3>
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{pkg.description}</p>

                          {!validity.isValid && (
                            <p className="text-[10px] text-rose-600 font-medium mt-1">
                              ⚠️ {validity.reason}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="font-mono font-bold text-[#2254E1] text-sm">
                            {formatCurrency(pkg.price)}
                          </span>
                          <Button
                            size="sm"
                            disabled={!validity.isValid}
                            onClick={() => handleAddPackageToCart(pkg)}
                            className="h-7 px-3 bg-[#2254E1] hover:bg-[#1B44B8] text-white text-xs gap-1 rounded-lg"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Package
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* PRODUCTS CATALOGUE */
              filteredProducts.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                  No matching retail products found.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredProducts.map((prod) => {
                    const currentStock = productStockMap[prod.id] || 0;
                    const isOutOfStock = currentStock <= 0;
                    const isLowStock = currentStock > 0 && currentStock <= prod.minStockLevel;

                    return (
                      <div
                        key={prod.id}
                        className={`bg-white p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2 ${
                          isOutOfStock
                            ? 'border-slate-200 bg-slate-50/40 opacity-70'
                            : 'border-slate-200/80 hover:border-[#2254E1]/50 hover:shadow-xs'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">
                              {getCatalogueCode(prod)}
                            </span>
                            {isOutOfStock ? (
                              <Badge variant="destructive" className="text-[9px]">
                                Out of Stock
                              </Badge>
                            ) : isLowStock ? (
                              <Badge variant="neutral" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                                Low: {currentStock} left
                              </Badge>
                            ) : (
                              <Badge variant="neutral" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                {currentStock} in stock
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-900 text-xs mt-1 tracking-tight">
                            {prod.name}
                          </h3>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {prod.brand ? `${prod.brand} • ` : ''}{prod.category}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="font-mono font-bold text-[#2254E1] text-sm">
                            {formatCurrency(getCatalogueSellingPrice(prod))}
                          </span>
                          <Button
                            size="sm"
                            disabled={isOutOfStock}
                            onClick={() => handleAddProductToCart(prod)}
                            className="h-7 px-3 bg-[#2254E1] hover:bg-[#1B44B8] text-white text-xs gap-1 rounded-lg disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Product
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Active Cart Line Items Card */}
          <Card className="p-4 bg-white border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#2254E1]" />
                <h3 className="font-bold text-slate-900 text-sm">Current Cart Items ({currentCartCount})</h3>
              </div>
              {cart.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCart}
                  className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear Cart
                </Button>
              )}
            </div>

            {/* Linked Appointment Badge */}
            {loadedAppointment && (
              <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg flex items-center justify-between text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold">Linked Appointment:</span> {loadedAppointment.appointmentNumber || loadedAppointment.id}
                    <span className="text-blue-700 block text-[11px]">{loadedAppointment.clientName} • {loadedAppointment.startTime || loadedAppointment.time || '10:00 AM'}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLoadedAppointment(null);
                    setAcknowledgedPriceDiscrepancy(false);
                  }}
                  className="h-6 w-6 p-0 text-blue-500 hover:text-blue-800"
                  title="Unlink Appointment"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Price Quote Discrepancy Banner */}
            {bookingPriceDiscrepancy && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2">
                <div className="flex items-start gap-2 text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Price Quote Discrepancy</span>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Booking quote was <span className="font-semibold">{formatCurrency(bookingPriceDiscrepancy.quoted)}</span>, while active catalogue subtotal calculates to <span className="font-semibold">{formatCurrency(bookingPriceDiscrepancy.canonical)}</span>.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[11px] font-semibold text-amber-900 cursor-pointer pt-1 border-t border-amber-200/60">
                  <input
                    type="checkbox"
                    checked={acknowledgedPriceDiscrepancy}
                    onChange={(e) => setAcknowledgedPriceDiscrepancy(e.target.checked)}
                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>I acknowledge and confirm this price adjustment before billing</span>
                </label>
              </div>
            )}

            {cart.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs space-y-1">
                <ShoppingCart className="w-8 h-8 mx-auto text-slate-300 stroke-1" />
                <p>Your POS cart is currently empty.</p>
                <p className="text-[11px] text-slate-400">Select services or packages above to begin building bill.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {cart.map((ci) => (
                  <div
                    key={ci.cartInstanceId}
                    className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{ci.item.name}</span>
                          {ci.type === 'PACKAGE' ? (
                            <Badge variant="neutral" className="text-[9px] bg-blue-100 text-blue-800">
                              Package
                            </Badge>
                          ) : ci.type === 'PRODUCT' ? (
                            <Badge variant="neutral" className="text-[9px] bg-emerald-100 text-emerald-800">
                              Product
                            </Badge>
                          ) : null}
                        </div>
                        <span className="font-mono text-[11px] text-slate-500">
                          {formatCurrency(getCatalogueSellingPrice(ci.item))} each
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Quantity Adjuster */}
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUpdateQuantity(ci.cartInstanceId, -1)}
                            className="w-5 h-5 h-auto p-0"
                          >
                            <Minus className="w-3 h-3 text-slate-600" />
                          </Button>
                          <span className="font-mono font-bold px-1.5 text-xs text-slate-900">
                            {ci.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUpdateQuantity(ci.cartInstanceId, 1)}
                            className="w-5 h-5 h-auto p-0"
                          >
                            <Plus className="w-3.5 h-3.5 text-slate-600" />
                          </Button>
                        </div>

                        <span className="font-mono font-bold text-slate-900 w-16 text-right">
                          {formatCurrency(getCatalogueSellingPrice(ci.item) * ci.quantity)}
                        </span>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(ci.cartInstanceId)}
                          className="w-6 h-6 text-slate-400 hover:text-rose-600 p-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Staff Assignment */}
                    {ci.type === 'SERVICE' || ci.type === 'PRODUCT' ? (
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60">
                        <span className="text-[11px] text-slate-500 font-medium">
                          {ci.type === 'PRODUCT' ? 'Sales Staff (Commission):' : 'Assigned Stylist:'}
                        </span>
                        <Select
                          value={ci.staffId || 'unassigned'}
                          onValueChange={(val) => handleAssignStaff(ci.cartInstanceId, val)}
                        >
                          <SelectTrigger
                            className={`w-[190px] text-xs h-7 bg-white transition-colors ${
                              !ci.staffId || ci.staffId === 'unassigned'
                                ? 'border-amber-400 text-amber-800 bg-amber-50/60 font-semibold'
                                : 'border-slate-200 text-slate-800'
                            }`}
                          >
                            <SelectValue placeholder="Select Staff..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned" className="text-xs text-amber-700 italic font-medium">
                              -- Select Staff --
                            </SelectItem>
                            <SelectItem value="house" className="text-xs font-semibold text-slate-700">
                              House / Salon (No Staff)
                            </SelectItem>
                            {staffList.map((st) => (
                              <SelectItem key={st.id} value={st.id} className="text-xs">
                                {st.name} ({st.roleTitle})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      /* Package Multi-Staff Assignment & Commission Split */
                      <div className="pt-2 border-t border-slate-200/60 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-[#2254E1]" />
                            <span>Assigned Staff ({ci.assignedStaff?.length || 0}):</span>
                          </span>

                          <div className="flex items-center gap-1.5">
                            {ci.assignedStaff && ci.assignedStaff.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleEqualizeStaffPackageAmounts(ci.cartInstanceId)}
                                className="text-[10px] font-medium text-[#2254E1] hover:text-[#1B44B8] underline hover:no-underline cursor-pointer"
                                title="Split total package amount equally across assigned staff"
                              >
                                Split Evenly
                              </button>
                            )}
                            {(() => {
                              const totalPkgAmount = getCatalogueSellingPrice(ci.item) * ci.quantity;
                              const currentSum = (ci.assignedStaff || []).reduce(
                                (s, st) => s + (st.allocatedAmount ?? 0),
                                0
                              );
                              const isMultiple = (ci.assignedStaff?.length || 0) > 1;
                              if (!ci.assignedStaff || ci.assignedStaff.length === 0) {
                                return (
                                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                                    No staff assigned
                                  </span>
                                );
                              }
                              if (isMultiple && Math.abs(currentSum - totalPkgAmount) <= 1) {
                                return (
                                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                    Allocated: {formatCurrency(currentSum)} / {formatCurrency(totalPkgAmount)}
                                  </span>
                                );
                              }
                              if (isMultiple) {
                                return (
                                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                                    Allocated: {formatCurrency(currentSum)} / {formatCurrency(totalPkgAmount)}
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[10px] text-slate-500 font-medium">
                                  100% attributed ({formatCurrency(totalPkgAmount)})
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Custom Staff Sale Allocation List */}
                        {/* List of Assigned Staff with custom Sale Amount input */}
                        {ci.assignedStaff && ci.assignedStaff.length > 0 && (
                          <div className="space-y-1.5 bg-slate-50/70 p-2 rounded-lg border border-slate-200/70">
                            {ci.assignedStaff.map((st) => {
                              const rawRate = st.staffCommissionRate ?? 0;
                              const displayRate = rawRate > 0 && rawRate <= 1 ? Math.round(rawRate * 100) : Math.round(rawRate);
                              const lineTotalAmount = getCatalogueSellingPrice(ci.item) * ci.quantity;
                              const currentAmount = st.allocatedAmount ?? (ci.assignedStaff?.length === 1 ? lineTotalAmount : Math.round(lineTotalAmount / (ci.assignedStaff?.length || 1)));
                              const estimatedComm = (currentAmount * displayRate) / 100;

                              return (
                                <div
                                  key={st.staffId}
                                  className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-md border border-slate-200 text-xs shadow-2xs"
                                >
                                  <div className="flex items-center gap-1.5 min-w-[120px]">
                                    <span className="font-semibold text-slate-800 text-xs">{st.staffName}</span>
                                    <span className="text-[10px] font-medium px-1 py-0.2 bg-blue-50 text-[#2254E1] rounded border border-blue-100">
                                      {displayRate}% comm.
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-semibold text-slate-400 uppercase">Sale:</span>
                                      <div className="relative">
                                        <input
                                          type="number"
                                          min="0"
                                          max={lineTotalAmount}
                                          step="1"
                                          value={st.allocatedAmount ?? currentAmount}
                                          onChange={(e) =>
                                            handleUpdateStaffPackageAmount(
                                              ci.cartInstanceId,
                                              st.staffId,
                                              Number(e.target.value) || 0
                                            )
                                          }
                                          className="w-20 h-6 px-1.5 text-right font-mono font-bold text-xs bg-slate-50 focus:bg-white border border-slate-300 focus:border-[#2254E1] rounded focus:outline-hidden focus:ring-1 focus:ring-[#2254E1]"
                                          placeholder="0"
                                        />
                                      </div>
                                      <span className="text-[10px] text-slate-500 font-medium">PKR</span>
                                    </div>

                                    <span className="text-[10px] font-mono font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 hidden sm:inline-block">
                                      +{formatCurrency(estimatedComm)}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveStaffFromPackage(ci.cartInstanceId, st.staffId)}
                                      className="p-1 text-slate-400 hover:text-rose-600 focus:outline-hidden rounded transition-colors cursor-pointer"
                                      title="Remove staff member"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Add staff to package dropdown */}
                        {staffList.filter((s) => !ci.assignedStaff?.some((as) => as.staffId === s.id)).length > 0 && (
                          <div className="pt-0.5">
                            <Select
                              value=""
                              onValueChange={(val) => {
                                if (val) handleAddStaffToPackage(ci.cartInstanceId, val);
                              }}
                            >
                              <SelectTrigger
                                className={`text-[11px] h-7 font-semibold cursor-pointer ${
                                  !ci.assignedStaff || ci.assignedStaff.length === 0
                                    ? 'w-[140px] bg-amber-50/80 border-amber-300 text-amber-800 hover:bg-amber-100/70'
                                    : 'w-[125px] bg-blue-50/60 border-blue-200 text-[#2254E1] hover:bg-blue-100/60'
                                }`}
                              >
                                <SelectValue placeholder={!ci.assignedStaff || ci.assignedStaff.length === 0 ? '+ Assign Staff' : '+ Add Staff'} />
                              </SelectTrigger>
                              <SelectContent>
                                {!ci.assignedStaff?.some((as) => as.staffId === 'house') && (
                                  <SelectItem value="house" className="text-xs font-semibold text-slate-700">
                                    House / Salon (No Staff)
                                  </SelectItem>
                                )}
                                {staffList
                                  .filter((s) => !ci.assignedStaff?.some((as) => as.staffId === s.id))
                                  .map((st) => (
                                    <SelectItem key={st.id} value={st.id} className="text-xs">
                                      {st.name} ({st.roleTitle}) — {typeof st.commissionRate === 'number' && st.commissionRate <= 1 ? Math.round(st.commissionRate * 100) : Math.round(st.commissionRate || 0)}%
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Included services in package */}
                        <div className="bg-slate-50/80 p-1.5 rounded border border-slate-200/50 space-y-1">
                          <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block">
                            Included Package Services ({((ci.item as PackageItem).components || []).length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {((ci.item as PackageItem).components || []).map((c, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 font-medium"
                              >
                                • {c.serviceName}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Billing Summary & Payment Controls (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-4 bg-white border-slate-200/80 shadow-2xs space-y-4 sticky top-4">
            <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Bill Summary & Payment</span>
              <Badge variant="neutral" className="text-[10px]">
                {cart.length} line items
              </Badge>
            </h3>

            {/* Discounts & Tip Inputs */}
            <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">Promotional Discount</label>
                <div className="flex items-center gap-2">
                  <Select
                    value={discountType}
                    onValueChange={(val: 'FIXED' | 'PERCENTAGE') => setDiscountType(val)}
                  >
                    <SelectTrigger className="w-28 text-xs h-8 bg-white border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED" className="text-xs">
                        Amount (PKR)
                      </SelectItem>
                      <SelectItem value="PERCENTAGE" className="text-xs">
                        Percentage (%)
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    className="text-xs h-8 bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Staff Gratuity / Tip (PKR)
                </label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={tipAmount || ''}
                  onChange={(e) => setTipAmount(parseFloat(e.target.value) || 0)}
                  className="text-xs h-8 bg-white"
                />
              </div>
            </div>

            {/* Detailed Line Item & Financial Summary Table */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Before Tax & Disc)</span>
                <span className="font-mono font-medium">{formatCurrency(calculations.grossSubtotal)}</span>
              </div>

              {calculations.calculatedDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Discount Allocated</span>
                  <span className="font-mono">- {formatCurrency(calculations.calculatedDiscount)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-700 font-semibold pt-1 border-t border-slate-100">
                <span>Net Sales</span>
                <span className="font-mono">{formatCurrency(calculations.netSales)}</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <label htmlFor="pos-tax-toggle" className="flex items-center gap-2 cursor-pointer text-slate-700 text-xs font-medium select-none">
                  <input
                    id="pos-tax-toggle"
                    type="checkbox"
                    checked={applyBranchTax}
                    onChange={(e) => setApplyBranchTax(e.target.checked)}
                    className="rounded border-slate-300 text-[#2254E1] focus:ring-[#2254E1] h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>
                    Branch Sales Tax ({currentBranch?.taxEnabled ? `${((currentBranch.taxRate || 0) * 100).toFixed(0)}%` : '0%'})
                  </span>
                </label>
                <span className="font-mono text-xs font-semibold text-slate-900">
                  {applyBranchTax && currentBranch?.taxEnabled && calculations.totalTax > 0
                    ? `+ ${formatCurrency(calculations.totalTax)}`
                    : 'Rs 0'}
                </span>
              </div>

              <div className="flex justify-between text-slate-900 font-bold text-sm pt-1 border-t border-slate-200">
                <span>Current Bill Total</span>
                <span className="font-mono text-[#2254E1]">
                  {formatCurrency(calculations.billTotal)}
                </span>
              </div>

              {calculations.cleanTip > 0 && (
                <div className="flex justify-between text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs">
                  <span>Staff Gratuity (Direct)</span>
                  <span className="font-mono font-bold">+ {formatCurrency(calculations.cleanTip)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-900 font-bold text-base pt-2 border-t-2 border-slate-900">
                <span>Total Payable</span>
                <span className="font-mono">{formatCurrency(calculations.fullInvoiceTotal)}</span>
              </div>
            </div>

            {/* Post POS Invoice Button */}
            <Button
              disabled={cart.length === 0 || isPosting}
              onClick={handleOpenCheckout}
              className="w-full bg-[#2254E1] hover:bg-[#1B44B8] text-white font-bold h-11 text-sm rounded-xl shadow-xs gap-2"
            >
              <CreditCard className="w-4 h-4" />
              Proceed to Checkout ({formatCurrency(calculations.fullInvoiceTotal)})
            </Button>
          </Card>
        </div>
      </div>

      {/* 4. Checkout & Payment Modal */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto font-sans p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#2254E1]" />
              Select Payment Method & Finalize
            </DialogTitle>
            <DialogDescription className="text-xs">
              Bill Total: <span className="font-bold text-slate-900">{formatCurrency(calculations.fullInvoiceTotal)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick Settlement Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setCashTenderedInput(calculations.fullInvoiceTotal);
                  setOnlineAmountInput(calculations.fullInvoiceTotal);
                  setSplitCashAmount(calculations.billTotal);
                  setSplitCashTendered(calculations.billTotal);
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
              >
                Full Pay ({formatCurrency(calculations.fullInvoiceTotal)})
              </button>
              <button
                type="button"
                onClick={() => {
                  const half = Math.round(calculations.fullInvoiceTotal / 2);
                  setCashTenderedInput(half);
                  setOnlineAmountInput(half);
                  setSplitCashAmount(half);
                  setSplitCashTendered(half);
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 cursor-pointer"
              >
                50% Partial ({formatCurrency(Math.round(calculations.fullInvoiceTotal / 2))})
              </button>
            </div>

            {/* Real-time Status Card */}
            {(() => {
              const currentRetained = checkoutMode === 'CASH'
                ? Math.min(cashTenderedInput || 0, calculations.fullInvoiceTotal)
                : checkoutMode === 'ONLINE'
                ? Math.min(onlineAmountInput || 0, calculations.fullInvoiceTotal)
                : Math.min((splitCashAmount || 0) + splitOnlinePayments.reduce((s, p) => s + (p.amount || 0), 0), calculations.fullInvoiceTotal);
              const currentDue = Math.max(0, Math.round((calculations.fullInvoiceTotal - currentRetained) * 100) / 100);

              return (
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    currentDue === 0
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : currentRetained > 0
                      ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}>
                    <div>
                      <span className="font-bold block">
                        {currentDue === 0 ? 'STATUS: PAID' : currentRetained > 0 ? 'STATUS: PARTIAL' : 'STATUS: UNPAID'}
                      </span>
                      <span className="text-[11px] opacity-80 block">
                        {currentDue === 0
                          ? 'Full payment received. Invoice is fully settled.'
                          : currentRetained > 0
                          ? `Paying ${formatCurrency(currentRetained)}. Remaining ${formatCurrency(currentDue)} will be recorded in Client Ledger.`
                          : `Paying PKR 0 now. Full ${formatCurrency(currentDue)} will be recorded as Outstanding Due in Client Ledger.`}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] uppercase font-semibold text-slate-500 block">Remaining Due</span>
                      <span className={`text-sm font-bold font-mono ${currentDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {formatCurrency(currentDue)}
                      </span>
                    </div>
                  </div>

                  {currentDue > 0 && (isWalkIn || !clientName || clientName === 'Walk-in Customer' || !clientPhone || clientPhone.replace(/\D/g, '').length < 10) && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Customer Details Required for Client Ledger</span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        Partial & Unpaid invoices must be linked to a customer name & phone so dues show in their ledger:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 font-semibold block mb-0.5">Customer Name *</label>
                          <Input
                            placeholder="Client Name"
                            value={clientName === 'Walk-in Customer' ? '' : clientName}
                            onChange={(e) => {
                              setClientName(e.target.value);
                              setIsWalkIn(false);
                            }}
                            className="text-xs h-8 bg-white font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 font-semibold block mb-0.5">Phone Number (10+ digits) *</label>
                          <Input
                            placeholder="03001234567"
                            value={clientPhone === 'N/A' ? '' : clientPhone}
                            onChange={(e) => {
                              setClientPhone(e.target.value);
                              setIsWalkIn(false);
                            }}
                            className="text-xs h-8 bg-white font-medium font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Payment Method Selector Tabs */}
            <Tabs value={checkoutMode} onValueChange={(val: any) => setCheckoutMode(val)}>
              <TabsList className="grid grid-cols-3 bg-slate-100 p-1 h-10 w-full">
                <TabsTrigger value="CASH" className="text-xs font-semibold">
                  <Banknote className="w-3.5 h-3.5 mr-1" />
                  Cash
                </TabsTrigger>
                <TabsTrigger value="ONLINE" className="text-xs font-semibold">
                  <CreditCard className="w-3.5 h-3.5 mr-1" />
                  Online
                </TabsTrigger>
                <TabsTrigger value="SPLIT" className="text-xs font-semibold">
                  <Coins className="w-3.5 h-3.5 mr-1" />
                  Split Payment
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* CASH MODE */}
            {checkoutMode === 'CASH' && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Cash Tendered / Received (PKR)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={cashTenderedInput || ''}
                    onChange={(e) => setCashTenderedInput(parseFloat(e.target.value) || 0)}
                    className="text-sm font-mono font-bold bg-white h-10"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-xs">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Cash Retained</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatCurrency(Math.min(cashTenderedInput || 0, calculations.fullInvoiceTotal))}
                    </span>
                  </div>
                  <div className="bg-emerald-50 p-2 rounded border border-emerald-200">
                    <span className="text-[10px] text-emerald-700 block">Change to Return</span>
                    <span className="font-mono font-bold text-emerald-800">
                      {formatCurrency(Math.max(0, (cashTenderedInput || 0) - calculations.fullInvoiceTotal))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ONLINE MODE */}
            {checkoutMode === 'ONLINE' && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Active Branch Payment Account
                  </label>
                  <Select
                    value={selectedOnlineAccountId}
                    onValueChange={(val) => setSelectedOnlineAccountId(val)}
                  >
                    <SelectTrigger className="text-xs bg-white h-9">
                      <SelectValue placeholder="Select Account" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id} className="text-xs">
                          {acc.name} ({acc.accountIdentifier || acc.providerName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Amount Received via Digital Transfer (PKR)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max={calculations.fullInvoiceTotal}
                    value={onlineAmountInput || ''}
                    onChange={(e) => setOnlineAmountInput(parseFloat(e.target.value) || 0)}
                    className="text-sm font-mono font-bold bg-white h-10"
                  />
                </div>
              </div>
            )}

            {/* SPLIT MODE */}
            {checkoutMode === 'SPLIT' && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="space-y-2">
                  <span className="font-bold text-slate-900 block text-xs">Cash Split Component</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500">Retained Cash</label>
                      <Input
                        type="number"
                        value={splitCashAmount || ''}
                        onChange={(e) => setSplitCashAmount(parseFloat(e.target.value) || 0)}
                        className="text-xs h-8 bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Cash Tendered</label>
                      <Input
                        type="number"
                        value={splitCashTendered || ''}
                        onChange={(e) => setSplitCashTendered(parseFloat(e.target.value) || 0)}
                        className="text-xs h-8 bg-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Online Split Rows */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Digital Account Splits</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSplitOnlinePayments((prev) => [
                          ...prev,
                          { paymentAccountId: paymentAccounts[0]?.id || '', amount: 0 },
                        ])
                      }
                      className="text-xs h-7 px-2"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Account Row
                    </Button>
                  </div>

                  {splitOnlinePayments.map((op, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border border-slate-200">
                      <Select
                        value={op.paymentAccountId}
                        onValueChange={(val) => {
                          const updated = [...splitOnlinePayments];
                          updated[idx].paymentAccountId = val;
                          setSplitOnlinePayments(updated);
                        }}
                      >
                        <SelectTrigger className="text-xs h-8 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id} className="text-xs">
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        placeholder="Amount"
                        value={op.amount || ''}
                        onChange={(e) => {
                          const updated = [...splitOnlinePayments];
                          updated[idx].amount = parseFloat(e.target.value) || 0;
                          setSplitOnlinePayments(updated);
                        }}
                        className="w-28 text-xs h-8 font-mono"
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setSplitOnlinePayments((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="w-6 h-6 text-rose-500 hover:bg-rose-50 p-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              disabled={isPosting}
              onClick={handlePostInvoice}
              className="bg-[#2254E1] hover:bg-[#1B44B8] text-white text-xs font-bold gap-1.5"
            >
              {isPosting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Confirm & Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Dues & Previous Invoices Collection Modal */}
      <Dialog open={isCollectionModalOpen} onOpenChange={setIsCollectionModalOpen}>
        <DialogContent className="max-w-md font-sans p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Banknote className="w-5 h-5 text-amber-600" />
              Collect Previous Outstanding Dues
            </DialogTitle>
            <DialogDescription className="text-xs">
              Customer: <span className="font-bold text-slate-900">{clientName || selectedClient?.name}</span>
            </DialogDescription>
          </DialogHeader>

          {isLoadingInvoices ? (
            <div className="py-8 text-center text-xs text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400 mb-2" />
              Loading customer unpaid invoices...
            </div>
          ) : customerOutstandingInvoices.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No unpaid invoices found for this customer profile.
            </div>
          ) : (
            <div className="space-y-3 py-2 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Select Original Invoice to Collect Against
                </label>
                <Select
                  value={selectedInvoiceForPayment?.id || ''}
                  onValueChange={(val) => {
                    const inv = customerOutstandingInvoices.find((i) => i.id === val) || null;
                    setSelectedInvoiceForPayment(inv);
                    if (inv) {
                      setCollectionAmountInput(inv.amountDue);
                      setCollectionCashTendered(inv.amountDue);
                    }
                  }}
                >
                  <SelectTrigger className="text-xs h-9 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customerOutstandingInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id} className="text-xs">
                        {inv.invoiceNumber} ({inv.date}) — Due: {formatCurrency(inv.amountDue)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedInvoiceForPayment && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex justify-between text-xs pb-2 border-b border-slate-200">
                    <span className="text-slate-600">Original Invoice Total:</span>
                    <span className="font-mono font-bold">{formatCurrency(selectedInvoiceForPayment.total)}</span>
                  </div>
                  <div className="flex justify-between text-xs pb-2 border-b border-slate-200">
                    <span className="text-slate-600">Current Outstanding Balance:</span>
                    <span className="font-mono font-bold text-amber-700">
                      {formatCurrency(selectedInvoiceForPayment.amountDue)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-slate-700 block">Payment Method</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Button
                        type="button"
                        variant={collectionPaymentMode === 'CASH' ? 'default' : 'outline'}
                        onClick={() => setCollectionPaymentMode('CASH')}
                        className={`text-xs h-8 ${collectionPaymentMode === 'CASH' ? 'bg-[#2254E1]' : ''}`}
                      >
                        Cash
                      </Button>
                      <Button
                        type="button"
                        variant={collectionPaymentMode === 'ONLINE' ? 'default' : 'outline'}
                        onClick={() => setCollectionPaymentMode('ONLINE')}
                        className={`text-xs h-8 ${collectionPaymentMode === 'ONLINE' ? 'bg-[#2254E1]' : ''}`}
                      >
                        Online
                      </Button>
                      <Button
                        type="button"
                        variant={collectionPaymentMode === 'SPLIT' ? 'default' : 'outline'}
                        onClick={() => {
                          setCollectionPaymentMode('SPLIT');
                          setSplitCollectionCashAmount(collectionAmountInput);
                          setSplitCollectionCashTendered(collectionAmountInput);
                          setSplitCollectionOnlinePayments([]);
                        }}
                        className={`text-xs h-8 ${collectionPaymentMode === 'SPLIT' ? 'bg-[#2254E1]' : ''}`}
                      >
                        Split
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Total Collection Amount (PKR)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max={selectedInvoiceForPayment.amountDue}
                      value={collectionAmountInput || ''}
                      onChange={(e) => setCollectionAmountInput(parseFloat(e.target.value) || 0)}
                      className="text-sm font-mono font-bold bg-white h-9"
                    />
                  </div>

                  {collectionPaymentMode === 'CASH' && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Cash Tendered (PKR)
                      </label>
                      <Input
                        type="number"
                        min={collectionAmountInput}
                        value={collectionCashTendered || ''}
                        onChange={(e) => setCollectionCashTendered(parseFloat(e.target.value) || 0)}
                        className="text-sm font-mono font-bold bg-white h-9"
                      />
                    </div>
                  )}

                  {collectionPaymentMode === 'ONLINE' && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Deposit Payment Account
                      </label>
                      <Select
                        value={collectionOnlineAccountId}
                        onValueChange={setCollectionOnlineAccountId}
                      >
                        <SelectTrigger className="text-xs h-9 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id} className="text-xs">
                              {acc.name} ({acc.accountIdentifier || acc.providerName})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {collectionPaymentMode === 'SPLIT' && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600 block mb-1">Retained Cash Portion (PKR)</label>
                        <Input
                          type="number"
                          value={splitCollectionCashAmount || ''}
                          onChange={(e) => setSplitCollectionCashAmount(parseFloat(e.target.value) || 0)}
                          className="text-xs h-8 font-mono bg-white"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-600">Digital Account Splits</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setSplitCollectionOnlinePayments((prev) => [
                                ...prev,
                                { paymentAccountId: paymentAccounts[0]?.id || '', amount: 0 },
                              ])
                            }
                            className="text-[10px] h-6 px-2"
                          >
                            + Add Account Row
                          </Button>
                        </div>

                        {splitCollectionOnlinePayments.map((op, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200 text-xs">
                            <Select
                              value={op.paymentAccountId}
                              onValueChange={(val) => {
                                const updated = [...splitCollectionOnlinePayments];
                                updated[idx].paymentAccountId = val;
                                setSplitCollectionOnlinePayments(updated);
                              }}
                            >
                              <SelectTrigger className="text-xs h-7 flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {paymentAccounts.map((acc) => (
                                  <SelectItem key={acc.id} value={acc.id} className="text-xs">
                                    {acc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Input
                              type="number"
                              placeholder="Amount"
                              value={op.amount || ''}
                              onChange={(e) => {
                                const updated = [...splitCollectionOnlinePayments];
                                updated[idx].amount = parseFloat(e.target.value) || 0;
                                setSplitCollectionOnlinePayments(updated);
                              }}
                              className="w-24 text-xs h-7 font-mono"
                            />

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setSplitCollectionOnlinePayments((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="w-5 h-5 text-rose-500 hover:bg-rose-50 p-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCollectionModalOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              disabled={isPostingCollection || !selectedInvoiceForPayment || collectionAmountInput <= 0}
              onClick={handlePostCollectionPayment}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold gap-1.5"
            >
              {isPostingCollection ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Banknote className="w-3.5 h-3.5" />
              )}
              Confirm Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Printable Receipt Modal */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        invoice={postedInvoice}
        branch={currentBranch}
        onNewSale={() => {
          setIsReceiptOpen(false);
          setPostedInvoice(null);
        }}
      />

      {/* 7. Appointment Queue Sheet */}
      <AppointmentQueueSheet
        isOpen={isQueueOpen}
        onOpenChange={setIsQueueOpen}
        branchId={selectedBranchId}
        loadedAppointmentId={loadedAppointment?.id}
        onSelectAppointment={(appt) => handleOpenAppointmentInPOS(appt)}
      />

      {/* 8. Cart Overwrite Protection Prompt */}
      <CartOverwritePromptModal
        isOpen={isCartOverwritePromptOpen}
        onClose={() => {
          setIsCartOverwritePromptOpen(false);
          setPendingAppointmentToLoad(null);
        }}
        pendingAppointment={pendingAppointmentToLoad}
        currentCartCount={cart.length}
        onConfirmReplace={() => {
          if (pendingAppointmentToLoad) {
            handleOpenAppointmentInPOS(pendingAppointmentToLoad, true);
          }
        }}
      />

      {/* 9. Quick Client Registration Modal */}
      <ClientFormModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onSuccess={handleClientCreated}
        activeBranchId={selectedBranchId}
        branches={allBranches}
        initialName={clientModalPrefill.name}
        initialPhone={clientModalPrefill.phone}
      />
    </div>
  );
};
