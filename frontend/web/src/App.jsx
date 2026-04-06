import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoomRentalClient, resolveApiBaseUrl } from './lib/api';
import brandLogo from './image.png';

const SESSION_KEY = 'roomrental.session';

const defaultFilters = {
  search: '',
  city: ''
};

const defaultLoginForm = {
  identifier: '',
  password: ''
};

const defaultRegisterForm = {
  role: 'student',
  fullName: '',
  phone: '',
  email: '',
  password: '',
  universityName: '',
  courseName: '',
  yearOfStudy: '',
  budgetMin: '',
  budgetMax: '',
  preferredGender: 'female',
  businessName: ''
};

const mockFacilityPool = [
  'WiFi',
  'Attached Bath',
  'AC',
  'RO Water',
  'Laundry',
  'Parking',
  'Power Backup',
  'Study Desk',
  'CCTV',
  'Lift',
  'Housekeeping',
  'Mess Nearby'
];

const mockCityLocalityPool = [
  { city: 'Jaipur', localityName: 'Malviya Nagar', latitude: 26.8545, longitude: 75.8127 },
  { city: 'Indore', localityName: 'Vijay Nagar', latitude: 22.7533, longitude: 75.8937 },
  { city: 'Pune', localityName: 'Hinjewadi', latitude: 18.5912, longitude: 73.7389 },
  { city: 'Bengaluru', localityName: 'HSR Layout', latitude: 12.9116, longitude: 77.6389 },
  { city: 'Delhi', localityName: 'Mukherjee Nagar', latitude: 28.7062, longitude: 77.2078 },
  { city: 'Hyderabad', localityName: 'Gachibowli', latitude: 17.4401, longitude: 78.3489 },
  { city: 'Ahmedabad', localityName: 'Navrangpura', latitude: 23.0333, longitude: 72.5564 },
  { city: 'Bhopal', localityName: 'Arera Colony', latitude: 23.2325, longitude: 77.4342 },
  { city: 'Lucknow', localityName: 'Gomti Nagar', latitude: 26.8467, longitude: 80.9462 },
  { city: 'Chandigarh', localityName: 'Sector 22', latitude: 30.7333, longitude: 76.7794 }
];

const mockRoomTypePool = ['single', 'double', 'shared'];
const mockFurnishingPool = ['furnished', 'semi-furnished', 'unfurnished'];

function buildMockBrowseListings() {
  return Array.from({ length: 20 }).map((_, index) => {
    const locality = mockCityLocalityPool[index % mockCityLocalityPool.length];
    const facilities = Array.from({ length: 4 }).map((__, facilityIndex) => (
      mockFacilityPool[(index + facilityIndex) % mockFacilityPool.length]
    ));
    const roomType = mockRoomTypePool[index % mockRoomTypePool.length];
    const furnishingType = mockFurnishingPool[index % mockFurnishingPool.length];
    const rent = 6500 + (index * 650);
    const securityDeposit = Math.round(rent * 1.2);

    return {
      id: `mock-room-${index + 1}`,
      title: `${roomType.charAt(0).toUpperCase() + roomType.slice(1)} room in ${locality.localityName}`,
      description: `Well-lit ${roomType} accommodation in ${locality.localityName}, ${locality.city}. Includes ${facilities.join(', ')} with secure access and student friendly neighborhood.`,
      locality,
      addressLine1: `${20 + index}, ${locality.localityName} Main Road`,
      monthlyRent: rent,
      securityDeposit,
      roomType,
      furnishingType,
      tenantGenderPreference: 'any',
      status: 'active',
      isVerified: true,
      latitude: locality.latitude,
      longitude: locality.longitude,
      amenityCodes: facilities,
      landlord: {
        id: `mock-owner-${index + 1}`,
        fullName: `Owner ${index + 1}`,
        phone: `98${String(10000000 + index).slice(-8)}`,
        email: `owner${index + 1}@room4rent.in`
      },
      images: [
        {
          id: `mock-image-${index + 1}`,
          image_url: `https://picsum.photos/seed/roomrental-${index + 1}/900/600`
        }
      ],
      primaryImageUrl: `https://picsum.photos/seed/roomrental-${index + 1}/900/600`
    };
  });
}

const mockBrowseListings = buildMockBrowseListings();

function formatCurrency(value) {
  if (value === undefined || value === null || value === '') {
    return 'INR --';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value));
}

function readSession() {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function writeSession(value) {
  if (!value) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

function getApiErrorMessage(error) {
  return error?.payload?.message || error?.message || 'Something went wrong. Please try again.';
}

function normalizeUserRole(role) {
  const value = String(role || '').toLowerCase();
  return value === 'landlord' || value === 'student' || value === 'admin' ? value : 'student';
}

function getListingImageUrl(item) {
  return item?.primaryImageUrl || item?.images?.[0]?.image_url || `https://picsum.photos/seed/fallback-room/900/600`;
}

function getListingFacilities(item) {
  return (item?.amenityCodes || []).filter(Boolean).slice(0, 4);
}

function getListingAllFacilities(item) {
  const facilities = (item?.amenityCodes || []).filter(Boolean);
  if (facilities.length) {
    return facilities.slice(0, 10);
  }

  return ['WiFi', 'CCTV', 'Laundry', 'Water Purifier'];
}

function getAvailabilityLabel(item) {
  if (item?.availableFrom) {
    return String(item.availableFrom).slice(0, 10);
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 7);
  return fallback.toISOString().slice(0, 10);
}

function mergeWithMockListings(items = []) {
  const normalized = (items || []).map((item) => ({
    ...item,
    images: item.images || (item.primaryImageUrl ? [{ id: `${item.id}-image`, image_url: item.primaryImageUrl }] : []),
    amenityCodes: item.amenityCodes || []
  }));

  if (normalized.length >= 20) {
    return normalized;
  }

  const existingIds = new Set(normalized.map((item) => String(item.id)));
  const needed = 20 - normalized.length;
  const mockFill = mockBrowseListings
    .filter((item) => !existingIds.has(String(item.id)))
    .slice(0, needed);

  return [...normalized, ...mockFill];
}

function App() {
  const [session, setSession] = useState(readSession);
  const [authView, setAuthView] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [popupNotice, setPopupNotice] = useState(null);
  const [navHidden, setNavHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMainLanding, setShowMainLanding] = useState(() => Boolean(readSession()));
  const lastScrollYRef = useRef(0);

  const [filters, setFilters] = useState(defaultFilters);
  const [publicState, setPublicState] = useState({ loading: true, error: '', items: [] });
  const [isLocating, setIsLocating] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [inquiryDraft, setInquiryDraft] = useState('');

  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
  const [registerErrors, setRegisterErrors] = useState({});
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [verificationAssist, setVerificationAssist] = useState(null);
  const [verificationIdentifier, setVerificationIdentifier] = useState('');

  const [studentWorkspace, setStudentWorkspace] = useState({ loading: false, savedListings: [], conversations: [], inquiries: [] });
  const [landlordWorkspace, setLandlordWorkspace] = useState({ loading: false, myListings: [], inquiries: [] });
  const [profileState, setProfileState] = useState({
    loading: false,
    data: null,
    editing: false,
    message: '',
    form: {
      fullName: '',
      email: '',
      universityName: '',
      courseName: '',
      yearOfStudy: '',
      budgetMin: '',
      budgetMax: '',
      preferredGender: 'female',
      businessName: ''
    }
  });

  const client = useMemo(
    () => createRoomRentalClient({ baseUrl: resolveApiBaseUrl(), token: session?.token || null }),
    [session]
  );

  useEffect(() => {
    if (!popupNotice) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setPopupNotice(null);
    }, 3600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [popupNotice]);

  useEffect(() => {
    if (authView) {
      setNavHidden(false);
      return undefined;
    }

    if (mobileMenuOpen) {
      setNavHidden(false);
      return undefined;
    }

    lastScrollYRef.current = window.scrollY || 0;

    const handleScroll = () => {
      const currentY = window.scrollY || 0;
      const previousY = lastScrollYRef.current;
      const delta = currentY - previousY;

      if (currentY < 24) {
        setNavHidden(false);
      } else if (delta > 10) {
        setNavHidden(true);
      } else if (delta < -10) {
        setNavHidden(false);
      }

      lastScrollYRef.current = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [authView, mobileMenuOpen]);

  useEffect(() => {
    if (authView) {
      setMobileMenuOpen(false);
    }
  }, [authView]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 760) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]:not(.is-visible)');
    if (!nodes.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -6% 0px' }
    );

    nodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
    };
  }, [session, authView, publicState.items.length]);

  useEffect(() => {
    let active = true;

    async function loadPublicListings() {
      setPublicState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const result = await client.fetchListings({ status: 'active', limit: 24 });
        if (!active) {
          return;
        }

        setPublicState({ loading: false, error: '', items: mergeWithMockListings(result.items || []) });
      } catch (error) {
        if (!active) {
          return;
        }

        setPublicState({ loading: false, error: getApiErrorMessage(error), items: mergeWithMockListings([]) });
      }
    }

    loadPublicListings();
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!session?.token || session.role !== 'student') {
      setStudentWorkspace({ loading: false, savedListings: [], conversations: [], inquiries: [] });
      return;
    }

    let active = true;

    async function loadStudentWorkspace() {
      setStudentWorkspace((current) => ({ ...current, loading: true }));
      try {
        const [savedListings, conversations, inquiries] = await Promise.all([
          client.fetchSavedListings({ limit: 8 }),
          client.fetchConversations(),
          client.fetchMyInquiries({ limit: 8 })
        ]);

        if (!active) {
          return;
        }

        setStudentWorkspace({
          loading: false,
          savedListings: savedListings.items || [],
          conversations: conversations.items || [],
          inquiries: inquiries.items || []
        });
      } catch {
        if (!active) {
          return;
        }

        setStudentWorkspace({ loading: false, savedListings: [], conversations: [], inquiries: [] });
      }
    }

    loadStudentWorkspace();
    return () => {
      active = false;
    };
  }, [client, session]);

  useEffect(() => {
    if (!session?.token || session.role !== 'landlord') {
      setLandlordWorkspace({ loading: false, myListings: [], inquiries: [] });
      return;
    }

    let active = true;

    async function loadLandlordWorkspace() {
      setLandlordWorkspace((current) => ({ ...current, loading: true }));
      try {
        const [myListings, inquiries] = await Promise.all([
          client.fetchMyListings({ limit: 8 }),
          client.fetchLandlordInquiries({ limit: 8 })
        ]);
        if (!active) {
          return;
        }

        setLandlordWorkspace({ loading: false, myListings: myListings.items || [], inquiries: inquiries.items || [] });
      } catch {
        if (!active) {
          return;
        }

        setLandlordWorkspace({ loading: false, myListings: [], inquiries: [] });
      }
    }

    loadLandlordWorkspace();
    return () => {
      active = false;
    };
  }, [client, session]);

  useEffect(() => {
    if (!session?.token) {
      setProfileState((current) => ({ ...current, data: null, editing: false, message: '' }));
      return;
    }

    let active = true;

    async function loadProfile() {
      setProfileState((current) => ({ ...current, loading: true, message: '' }));
      try {
        const profile = await client.fetchProfile();
        if (!active) {
          return;
        }

        setProfileState((current) => ({
          ...current,
          loading: false,
          data: profile,
          form: {
            fullName: profile.fullName || '',
            email: profile.email || '',
            universityName: profile.roleProfile?.university_name || '',
            courseName: profile.roleProfile?.course_name || '',
            yearOfStudy: profile.roleProfile?.year_of_study || '',
            budgetMin: profile.roleProfile?.budget_min || '',
            budgetMax: profile.roleProfile?.budget_max || '',
            preferredGender: profile.roleProfile?.preferred_gender || 'female',
            businessName: profile.roleProfile?.business_name || ''
          }
        }));
      } catch (error) {
        if (!active) {
          return;
        }

        setProfileState((current) => ({ ...current, loading: false, message: getApiErrorMessage(error) }));
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [client, session]);

  function applyLocalFilter(rawItems, nextFilters) {
    const phrase = `${nextFilters.search || ''} ${nextFilters.city || ''}`.trim().toLowerCase();

    if (!phrase) {
      return rawItems;
    }

    return rawItems.filter((item) => {
      const fullText = `${item.title || ''} ${item.description || ''} ${item.locality?.city || ''} ${item.locality?.localityName || ''}`.toLowerCase();
      return fullText.includes(phrase);
    });
  }

  async function runListingSearch(nextFilters) {
    setPublicState((current) => ({ ...current, loading: true, error: '' }));

    try {
      const result = await client.fetchListings({ status: 'active', limit: 24 });
      const filtered = applyLocalFilter(mergeWithMockListings(result.items || []), nextFilters);
      setPublicState({ loading: false, error: '', items: filtered });
    } catch (error) {
      const filteredMock = applyLocalFilter(mergeWithMockListings([]), nextFilters);
      setPublicState({ loading: false, error: getApiErrorMessage(error), items: filteredMock });
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    if (!session) {
      setAuthMessage('Create your account first to start searching rooms.');
      setStatusMessage('Please sign up and verify your email before searching.');
      openAuthModal('register');
      return;
    }
    await runListingSearch(filters);
  }

  async function handleAutoDetectLocation() {
    if (!navigator.geolocation) {
      setStatusMessage('Geolocation is not supported in this browser.');
      return;
    }

    const approved = window.confirm('Allow Room4Rent to auto-detect your location and show nearby rooms?');
    if (!approved) {
      return;
    }

    setIsLocating(true);
    setStatusMessage('Detecting your location...');

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      let detectedKeyword = '';
      try {
        const reverseLookup = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
        const payload = await reverseLookup.json();
        detectedKeyword = payload.address?.city
          || payload.address?.town
          || payload.address?.village
          || payload.address?.state_district
          || payload.address?.suburb
          || '';
      } catch {
        detectedKeyword = '';
      }

      if (!detectedKeyword) {
        setStatusMessage('Location detected, but city could not be identified. Showing all rooms.');
        await runListingSearch(filters);
        return;
      }

      const nextFilters = { ...filters, city: detectedKeyword };
      setFilters(nextFilters);
      await runListingSearch(nextFilters);
      setStatusMessage(`Showing rooms near ${detectedKeyword}.`);
    } catch (error) {
      setStatusMessage(`Unable to detect location: ${error.message || 'permission denied'}.`);
    } finally {
      setIsLocating(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthMessage('');
    setAuthSubmitting(true);
    try {
      const result = await client.login(loginForm.identifier, loginForm.password);
      const role = normalizeUserRole(result.user?.role);
      const nextSession = { token: result.accessToken, role, user: { ...result.user, role } };
      setSession(nextSession);
      setShowMainLanding(true);
      writeSession(nextSession);
      setPopupNotice({ tone: 'success', text: `Welcome back, ${result.user.fullName || 'friend'}!` });
      setStatusMessage(`Welcome back, ${result.user.fullName || 'friend'}.`);
      setAuthView(null);
      setVerificationAssist(null);
      setLoginForm(defaultLoginForm);
    } catch (error) {
      if (error?.payload?.code === 'EMAIL_NOT_VERIFIED') {
        const payload = error?.payload || {};
        const deliveryReason = payload.verificationDeliveryReason ? ` (${payload.verificationDeliveryReason})` : '';
        const emailWarning = `${payload.message || 'Please verify your email first, then log in.'}${deliveryReason}`;
        setVerificationIdentifier((loginForm.identifier || '').trim());
        if (payload.verificationUrl) {
          setVerificationAssist({
            url: payload.verificationUrl,
            emailSent: Boolean(payload.verificationEmailSent)
          });
        }
        setPopupNotice({ tone: 'warn', text: emailWarning });
        setAuthMessage(emailWarning);
        setStatusMessage(emailWarning);
        setAuthView('login');
        return;
      }
      const message = getApiErrorMessage(error);
      setAuthMessage(message);
      setPopupNotice({ tone: 'warn', text: message });
      setStatusMessage(message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setRegisterErrors({});
    setVerificationAssist(null);
    setAuthMessage('');
    setAuthSubmitting(true);

    const payload = {
      role: registerForm.role,
      fullName: registerForm.fullName,
      phone: registerForm.phone,
      email: registerForm.email || undefined,
      password: registerForm.password,
      profile: registerForm.role === 'student'
        ? {
            universityName: registerForm.universityName || undefined,
            courseName: registerForm.courseName || undefined,
            yearOfStudy: registerForm.yearOfStudy ? Number(registerForm.yearOfStudy) : undefined,
            budgetMin: registerForm.budgetMin ? Number(registerForm.budgetMin) : undefined,
            budgetMax: registerForm.budgetMax ? Number(registerForm.budgetMax) : undefined,
            preferredGender: registerForm.preferredGender || undefined
          }
        : {
            businessName: registerForm.businessName || undefined
          }
    };

    try {
      const result = await client.register(payload);

      if (result.requiresEmailVerification) {
        const deliveryReason = result.verificationDeliveryReason ? ` (${result.verificationDeliveryReason})` : '';
        const verifyMessage = result.message || 'Account created. Please verify your email before logging in.';
        const verifyMessageWithReason = `${verifyMessage}${deliveryReason}`;
        const nextIdentifier = (registerForm.email || registerForm.phone || '').trim();
        const hint = result.verificationUrl
          ? `${verifyMessageWithReason} Verification link: ${result.verificationUrl}`
          : verifyMessageWithReason;
        setVerificationIdentifier(nextIdentifier);
        if (result.verificationUrl) {
          setVerificationAssist({
            url: result.verificationUrl,
            emailSent: Boolean(result.verificationEmailSent)
          });
        }
        setAuthMessage(verifyMessageWithReason);
        setPopupNotice({ tone: 'warn', text: verifyMessageWithReason });
        setStatusMessage(hint);
        setAuthView('login');
        setRegisterForm(defaultRegisterForm);
        return;
      }

      const role = normalizeUserRole(result.user?.role);
      const nextSession = { token: result.accessToken, role, user: { ...result.user, role } };
      setSession(nextSession);
      setShowMainLanding(true);
      writeSession(nextSession);
      setPopupNotice({ tone: 'success', text: `Welcome, ${result.user.fullName || 'new user'}!` });
      setStatusMessage(`Account created for ${result.user.fullName || 'new user'}.`);
      setAuthView(null);
      setRegisterForm(defaultRegisterForm);
    } catch (error) {
      const message = getApiErrorMessage(error);
      const duplicateConflict = error?.status === 409;
      const nextIdentifier = (registerForm.email || registerForm.phone || '').trim();
      setAuthMessage(message);
      setPopupNotice({ tone: 'warn', text: message });
      setStatusMessage(message);
      if (duplicateConflict && nextIdentifier) {
        setVerificationIdentifier(nextIdentifier);
        setAuthView('login');
        setLoginForm((current) => ({ ...current, identifier: nextIdentifier }));
      }
      if (error?.payload?.field) {
        setRegisterErrors({ [error.payload.field]: message });
      }
    } finally {
      setAuthSubmitting(false);
    }
  }

  function handleLogout() {
    setSession(null);
    setShowMainLanding(false);
    writeSession(null);
    setStatusMessage('Signed out successfully.');
  }

  function handleGoHome() {
    setAuthView(null);
    setSelectedListing(null);
    setShowMainLanding(true);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openAuthModal(view) {
    setAuthMessage('');
    setRegisterErrors({});
    if (!verificationIdentifier) {
      setVerificationAssist(null);
    }
    setAuthView(view);
  }

  async function handleResendVerification() {
    const identifier = (verificationIdentifier || loginForm.identifier || registerForm.email || registerForm.phone || '').trim();
    if (!identifier) {
      const message = 'Enter your registered email or phone first.';
      setAuthMessage(message);
      setPopupNotice({ tone: 'warn', text: message });
      return;
    }

    setResendSubmitting(true);
    try {
      const result = await client.resendVerification(identifier);
      setVerificationIdentifier(identifier);

      if (result.verificationUrl) {
        setVerificationAssist({
          url: result.verificationUrl,
          emailSent: Boolean(result.verificationEmailSent)
        });
      }

      const deliveryReason = result.verificationDeliveryReason ? ` (${result.verificationDeliveryReason})` : '';
      const message = `${result.message || 'If your account exists, verification details were sent.'}${deliveryReason}`;
      setAuthMessage(message);
      setPopupNotice({ tone: 'success', text: message });
      setStatusMessage(message);
    } catch (error) {
      const message = getApiErrorMessage(error);
      setAuthMessage(message);
      setPopupNotice({ tone: 'warn', text: message });
      setStatusMessage(message);
    } finally {
      setResendSubmitting(false);
    }
  }

  async function handleCopyVerificationLink() {
    if (!verificationAssist?.url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(verificationAssist.url);
      setPopupNotice({ tone: 'success', text: 'Verification link copied.' });
    } catch {
      setPopupNotice({ tone: 'warn', text: 'Could not copy link automatically. Please copy it manually.' });
    }
  }

  async function openListingDrawer(item) {
    setShowMainLanding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (String(item?.id || '').startsWith('mock-room-')) {
      setSelectedListing(item);
      return;
    }

    try {
      const [listingDetail, immersive] = await Promise.all([
        client.fetchListingById(item.id),
        client.fetchImmersive(item.id)
      ]);

      setSelectedListing({
        ...item,
        ...listingDetail,
        immersiveAsset: immersive?.immersiveAsset || null
      });
    } catch {
      setSelectedListing(item);
    }
  }

  function closeListingDetail() {
    setSelectedListing(null);
    setInquiryDraft('');
    window.setTimeout(() => {
      const listingSection = document.getElementById('features');
      if (listingSection) {
        listingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 40);
  }

  async function handleSaveListing() {
    if (!selectedListing || !session?.token) {
      setStatusMessage('Please log in as a student to save listings.');
      return;
    }

    try {
      await client.saveListing(selectedListing.id);
      setStatusMessage('Listing saved to your account.');
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error));
    }
  }

  async function handleInquiry() {
    if (!selectedListing || !session?.token) {
      setStatusMessage('Please log in before sending an inquiry.');
      return;
    }

    if (!inquiryDraft.trim()) {
      setStatusMessage('Write a message before sending inquiry.');
      return;
    }

    try {
      await client.createInquiry(selectedListing.id, { message: inquiryDraft.trim() });

      if (selectedListing.landlord?.id) {
        await client.createConversation({
          participantUserId: selectedListing.landlord.id,
          listingId: selectedListing.id,
          initialMessage: inquiryDraft.trim()
        });
      }

      setInquiryDraft('');
      setStatusMessage('Inquiry sent. Landlord has been notified.');
    } catch (error) {
      setStatusMessage(getApiErrorMessage(error));
    }
  }

  const hideNavbarOnWorkspace = false;

  return (
    <div className="app-shell">
      {!authView && !hideNavbarOnWorkspace ? (
      <header className={`top-nav${navHidden ? ' nav-hidden' : ''}`}>
        <button className="brand-box brand-box-btn" type="button" onClick={handleGoHome} aria-label="Go to main page">
          <img src={brandLogo} alt="Room4Rent" className="brand-logo" />
          <div>
            <strong>Room4Rent</strong>
            <p>Smart room renting for students and landlords</p>
          </div>
        </button>

        <button
          className={`mobile-menu-toggle${mobileMenuOpen ? ' is-open' : ''}`}
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={`menu-links${mobileMenuOpen ? ' mobile-open' : ''}`} aria-label="Primary navigation">
          <a href="#discover" onClick={() => { setMobileMenuOpen(false); setShowMainLanding(true); }}>Home</a>
          <a href="#features" onClick={() => { setMobileMenuOpen(false); setShowMainLanding(true); }}>Browse Rooms</a>
          {session ? <a href="#pricing" onClick={() => { setMobileMenuOpen(false); setShowMainLanding(true); }}>Pricing</a> : null}
          {session ? <a href="#messages" onClick={() => { setMobileMenuOpen(false); setShowMainLanding(true); }}>Messages</a> : null}
          {session ? <a href="#dashboard" onClick={() => { setMobileMenuOpen(false); setShowMainLanding(true); }}>Dashboard</a> : null}
          {session?.role === 'landlord' ? (
            <button className="menu-link-btn" type="button" onClick={() => { setMobileMenuOpen(false); setShowMainLanding(true); window.location.hash = 'dashboard'; }}>List Property</button>
          ) : null}

          {!session ? (
            <div className="menu-auth-mobile">
              <button className="btn btn-secondary" type="button" onClick={() => { setMobileMenuOpen(false); openAuthModal('login'); }}>Log In</button>
              <button className="btn btn-primary" type="button" onClick={() => { setMobileMenuOpen(false); openAuthModal('register'); }}>Sign Up</button>
            </div>
          ) : (
            <div className="menu-auth-mobile menu-auth-mobile-session">
              <span className="session-pill">{session.role}</span>
              <button className="btn btn-secondary" type="button" onClick={() => { setMobileMenuOpen(false); handleLogout(); }}>Log Out</button>
            </div>
          )}
        </nav>

        <div className="menu-actions">
          {session ? (
            <>
              <span className="session-pill">{session.role}</span>
              <button className="btn btn-secondary" type="button" onClick={handleLogout}>Log Out</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" type="button" onClick={() => openAuthModal('login')}>Log In</button>
              <button className="btn btn-primary" type="button" onClick={() => openAuthModal('register')}>Sign Up</button>
            </>
          )}
        </div>
      </header>
      ) : null}

      {!authView && hideNavbarOnWorkspace ? (
        <button className="profile-home-shortcut" type="button" onClick={handleGoHome}>Room4Rent Home</button>
      ) : null}

      {statusMessage ? <p className="status-banner" data-reveal="fade-up">{statusMessage}</p> : null}

      {popupNotice ? (
        <div className={`popup-notice popup-notice-${popupNotice.tone}`} role="status" aria-live="polite">
          <span>{popupNotice.text}</span>
          <button type="button" aria-label="Close message" onClick={() => setPopupNotice(null)}>x</button>
        </div>
      ) : null}

      <main className={`content-wrap ${session && !hideNavbarOnWorkspace ? 'content-wrap-session' : ''}`}>
        {selectedListing ? (
        <section className="room-detail-page" data-reveal="rise">
          <button className="room-detail-back" type="button" onClick={closeListingDetail}>
            Back
          </button>

          <div className="room-detail-layout">
            <div className="room-detail-main">
              <div className="room-detail-hero-media">
                <span className="room-verified-badge">Verified Property</span>
                <img src={getListingImageUrl(selectedListing)} alt={selectedListing.title} loading="lazy" />
              </div>

              <div className="room-title-row">
                <div>
                  <h2>{selectedListing.title}</h2>
                  <p>{selectedListing.addressLine1 || '-'}, {selectedListing.locality?.city || '-'}</p>
                </div>
                <div className="room-title-actions">
                  <button type="button" className="icon-ghost-btn" onClick={handleSaveListing}>Save</button>
                  <button type="button" className="icon-ghost-btn" onClick={() => navigator.share ? navigator.share({ title: selectedListing.title }) : undefined}>Share</button>
                </div>
              </div>

              <div className="room-quick-facts">
                <article className="room-fact-card">
                  <span>Type</span>
                  <strong>{selectedListing.roomType || 'PG'}</strong>
                </article>
                <article className="room-fact-card">
                  <span>Rent</span>
                  <strong>{formatCurrency(selectedListing.monthlyRent)}/mo</strong>
                </article>
                <article className="room-fact-card">
                  <span>Deposit</span>
                  <strong>{formatCurrency(selectedListing.securityDeposit || 0)}</strong>
                </article>
                <article className="room-fact-card">
                  <span>Available</span>
                  <strong>{getAvailabilityLabel(selectedListing)}</strong>
                </article>
              </div>

              <div className="room-detail-copy">
                <h3>About This Room</h3>
                <p>{selectedListing.description || 'Comfortable accommodation with essentials for students and working tenants.'}</p>

                <h3>Amenities</h3>
                <div className="listing-facilities listing-facilities-detail listing-facilities-highlight">
                  {getListingAllFacilities(selectedListing).map((facility) => (
                    <span key={`detail-facility-${facility}`} className="facility-chip">{facility}</span>
                  ))}
                </div>

                {selectedListing.images?.length ? (
                  <>
                    <h3>Photos</h3>
                    <div className="drawer-image-grid room-detail-gallery">
                      {selectedListing.images.map((image) => (
                        <a key={image.id} href={image.image_url} target="_blank" rel="noreferrer">
                          <img src={image.image_url} alt={selectedListing.title} loading="lazy" />
                        </a>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <aside className="room-detail-side">
              <div className="room-booking-card">
                <h3>{formatCurrency(selectedListing.monthlyRent)}<span>/month</span></h3>
                <p className="room-furnishing-pill">{selectedListing.furnishingType || 'Fully Furnished'}</p>
                <hr />
                <p className="booking-muted">Listed by</p>
                <h4>{selectedListing.landlord?.fullName || 'Owner'}</h4>
                <p>{selectedListing.landlord?.phone || 'Phone will be shared after inquiry'}</p>
                <p>{selectedListing.landlord?.email || 'Email not available'}</p>

                <textarea
                  placeholder="Write your booking or inquiry message"
                  value={inquiryDraft}
                  onChange={(event) => setInquiryDraft(event.target.value)}
                />
                <button className="btn btn-primary room-book-btn" type="button" onClick={handleInquiry}>Request Booking</button>
              </div>

              <div className="room-nearby-pill">
                Near {selectedListing.locality?.localityName || selectedListing.locality?.city || 'City Center'}
              </div>
            </aside>
          </div>
        </section>
        ) : null}

        {!selectedListing && (!session || showMainLanding) ? (
        <section className="hero-panel" id="discover" data-reveal="rise">
          <div className="hero-copy" data-reveal="rise">
            <span className="eyebrow">Student Housing Platform</span>
            <h1>Find your perfect room</h1>
            <p>We help 50,000+ students, 100,000+ rooms available, and 20+ states covered.</p>

            <form className="search-form" onSubmit={handleSearch}>
              <label className="search-field">
                <span className="field-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M10.5 4a6.5 6.5 0 015.13 10.5l4 4-1.42 1.42-4-4A6.5 6.5 0 1110.5 4zm0 2a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
                  </svg>
                </span>
                <input
                  placeholder="Search room, city, university, or location"
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                />
                <button className="search-location-btn" type="button" onClick={handleAutoDetectLocation} disabled={isLocating}>
                  <span className="btn-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z" />
                    </svg>
                  </span>
                  {isLocating ? 'Detecting...' : 'Use my location'}
                </button>
              </label>
            </form>
          </div>
        </section>
        ) : null}

        {!selectedListing && (!session || showMainLanding) ? (
        <section className="grid-section" id="features" data-reveal="rise">
          <header className="section-head">
            <h2>Browse Rooms</h2>
            <p>Tap any listing for immersive details, save it, or send inquiry right away.</p>
          </header>

          {publicState.error ? <p className="status-inline">{publicState.error}</p> : null}

          <div className="listing-grid">
            {publicState.loading
              ? Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="listing-card listing-card-skeleton" style={{ '--stagger-index': idx }} data-reveal="rise" />)
              : publicState.items.map((item, idx) => (
                  <button className="listing-card lift-card" key={item.id} type="button" onClick={() => openListingDrawer(item)} style={{ '--stagger-index': idx }} data-reveal="rise">
                    <div className="listing-cover">
                      <img src={getListingImageUrl(item)} alt={item.title} loading="lazy" />
                    </div>
                    <div className="tag-row">
                      <span className="tag tag-success">{item.isVerified ? 'Verified' : 'Pending'}</span>
                      <span className="tag tag-muted">{item.status}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.locality?.localityName}, {item.locality?.city}</p>
                    <strong>{formatCurrency(item.monthlyRent)}</strong>
                    {getListingFacilities(item).length ? (
                      <div className="listing-facilities">
                        {getListingFacilities(item).map((facility) => (
                          <span key={`${item.id}-${facility}`} className="facility-chip">{facility}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="meta-row">
                      <span>{item.roomType}</span>
                      <span>{item.furnishingType || 'Unspecified'}</span>
                    </div>
                  </button>
                ))}
          </div>
        </section>
              ) : null}

        {!selectedListing && session && showMainLanding ? (
        <section className="workspace" id="pricing" data-reveal="rise">
          <header className="section-head">
            <h2>Pricing</h2>
            <p>Simple plans and transparent listing growth options.</p>
          </header>
          <div className="workspace-grid">
            <article className="workspace-card">
              <h3>Starter</h3>
              <p className="status-inline">Great for first-time hosts and students getting started.</p>
            </article>
            <article className="workspace-card">
              <h3>Pro</h3>
              <p className="status-inline">Priority visibility, advanced tools, and faster response features.</p>
            </article>
          </div>
        </section>
        ) : null}

        {!selectedListing && session && showMainLanding ? (
        <section className="workspace" id="messages" data-reveal="rise">
          <header className="section-head">
            <h2>Messages</h2>
            <p>Recent conversations and inquiry activity.</p>
          </header>
          <div className="workspace-grid">
            <article className="workspace-card">
              <h3>Conversations</h3>
              <p className="status-inline">{session.role === 'student' ? studentWorkspace.conversations.length : landlordWorkspace.inquiries.length} active threads</p>
            </article>
            <article className="workspace-card">
              <h3>Quick Status</h3>
              <p className="status-inline">Stay updated on replies, listing interest, and follow-ups.</p>
            </article>
          </div>
        </section>
        ) : null}

        {!selectedListing && session && showMainLanding ? (
        <section className="workspace" id="dashboard" data-reveal="rise">
          <header className="section-head">
            <h2>Dashboard</h2>
            <p>Welcome, {session.user?.fullName || 'User'}.</p>
          </header>
          <div className="workspace-grid">
            <article className="workspace-card">
              <h3>Role</h3>
              <p className="status-inline">{session.role}</p>
            </article>
            <article className="workspace-card">
              <h3>Email Verification</h3>
              <p className="status-inline">{profileState.data?.isEmailVerified ? 'Verified' : 'Pending'}</p>
            </article>
            <article className="workspace-card">
              <h3>Phone Verification</h3>
              <p className="status-inline">{profileState.data?.isPhoneVerified ? 'Verified' : 'Pending'}</p>
            </article>
          </div>
        </section>
        ) : null}

        

        {!selectedListing && !session ? (
        <section className="info-hub" id="about" data-reveal="fade-up">
          <header className="section-head info-head">
            <div className="info-head-copy">
              <span className="info-eyebrow">About Room4Rent</span>
              <h2>Trusted renting experience for students and landlords</h2>
              <p>Room4Rent helps students discover verified rooms while giving landlords practical tools to manage listings and inquiries.</p>
            </div>
            <div className="info-trust-grid">
              <div className="info-trust-item">
                <strong>Verified Rooms</strong>
                <span>Quality checks and safer listings</span>
              </div>
              <div className="info-trust-item">
                <strong>Fast Support</strong>
                <span>Daily assistance for both roles</span>
              </div>
              <div className="info-trust-item">
                <strong>Transparent Policy</strong>
                <span>Privacy and terms written clearly</span>
              </div>
            </div>
          </header>

        </section>
        ) : null}
      </main>

      {!selectedListing && !session ? (
      <footer className="footer-band" data-reveal="fade-up">
        <div className="footer-band-inner">
          <div className="footer-brand-panel">
            <div className="footer-brand-top">
              <img src={brandLogo} alt="Room4Rent" className="footer-brand-logo" />
              <strong>Room4Rent</strong>
            </div>
            <p>Verified rooms, smarter search, and landlord connections that feel calm and trustworthy.</p>
            <div className="footer-socials" aria-label="Room4Rent social links">
              <a href="#discover" className="footer-social-link" aria-label="Open discover section">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5a7 7 0 107 7h-2a5 5 0 11-5-5V5z" /></svg>
              </a>
              <a href="#features" className="footer-social-link" aria-label="Open listings section">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v2H4V7zm0 4h10v2H4v-2zm0 4h16v2H4v-2z" /></svg>
              </a>
              <a href="#contact" className="footer-social-link" aria-label="Open contact section">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 00-5 5v4a5 5 0 1010 0V7a5 5 0 00-5-5zm7 11a7 7 0 01-14 0H3a9 9 0 0018 0h-2z" /></svg>
              </a>
            </div>
          </div>

          <div className="footer-column">
            <h4>Product</h4>
            <div className="footer-links">
              <a href="#discover">Search Rooms</a>
              <a href="#features">Nearby Rooms</a>
              <a href="#workspace">Student Dashboard</a>
              <a href="#workspace">360 Tours</a>
              <a href="#workspace">Owner Contact</a>
            </div>
          </div>

          <div className="footer-column">
            <h4>Company</h4>
            <div className="footer-links">
              <a href="#about">About</a>
              <a href="#careers">Careers</a>
              <a href="#contact">Contact</a>
              <a href="#privacy">Privacy</a>
              <a href="#terms">Terms</a>
            </div>
          </div>

          <div className="footer-column footer-newsletter">
            <h4>Resources</h4>
            <div className="footer-links">
              <a href="#help">Help Center</a>
              <a href="#contact">Support</a>
              <a href="#privacy">Safety Guide</a>
              <a href="#workspace">Pricing</a>
            </div>
          </div>
        </div>

        <div className="footer-divider" />

        <div className="footer-bottom">
          <div>
            <p>© 2026 Room4Rent. All rights reserved.</p>
            <div className="footer-bottom-links">
              <a href="#privacy">Privacy</a>
              <span>•</span>
              <a href="#terms">Terms</a>
            </div>
          </div>

          <form className="footer-bottom-subscribe" onSubmit={(event) => event.preventDefault()}>
            <span className="footer-bottom-subscribe-label">Stay updated:</span>
            <input type="email" placeholder="your@email.com" />
            <button className="btn btn-primary" type="submit">Subscribe</button>
          </form>
        </div>
      </footer>
      ) : null}

      {authView ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setAuthView(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-hero">
              <div className="auth-modal-brand" aria-hidden="true">
                <img src={brandLogo} alt="" className="auth-modal-logo" />
                <strong>Room4Rent</strong>
              </div>
              <div className="auth-modal-hero-copy">
                <h2 className="auth-modal-title">{authView === 'login' ? 'Welcome Back' : 'Get Started'}</h2>
                <p>{authView === 'login' ? 'Continue to your personal account and workspace.' : 'Create your account and start renting smarter.'}</p>
              </div>
            </div>

            <div className="auth-modal-body">
              {authMessage ? <p className="auth-feedback" role="alert">{authMessage}</p> : null}

              {authView === 'login' ? (
                <form className="auth-form" onSubmit={handleLogin}>
                  {verificationAssist?.url ? (
                    <div className="verify-link-panel" role="status" aria-live="polite">
                      <strong>{verificationAssist.emailSent ? 'Verification email sent' : 'Verification email was not delivered'}</strong>
                      <p>Verify your account first, then log in.</p>
                      <div className="verify-link-actions">
                        <a href={verificationAssist.url} target="_blank" rel="noreferrer">Open verification link</a>
                        <button type="button" onClick={handleCopyVerificationLink}>Copy link</button>
                      </div>
                    </div>
                  ) : null}

                  {verificationIdentifier ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendSubmitting}
                    >
                      {resendSubmitting ? 'Sending verification...' : 'Resend verification email'}
                    </button>
                  ) : null}

                  <input
                    required
                    placeholder="Phone or email"
                    value={loginForm.identifier}
                    onChange={(event) => setLoginForm({ ...loginForm, identifier: event.target.value })}
                  />
                  <input
                    required
                    type="password"
                    placeholder="Password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  />
                  <button className="btn btn-primary" type="submit" disabled={authSubmitting}>{authSubmitting ? 'Please wait...' : 'Continue'}</button>
                  <p className="switch-text">No account? <button type="button" onClick={() => openAuthModal('register')}>Sign up now</button></p>
                </form>
              ) : (
                <form className="auth-form" onSubmit={handleRegister}>
                  <div className="field-row">
                    <label><input type="radio" name="role" checked={registerForm.role === 'student'} onChange={() => setRegisterForm({ ...registerForm, role: 'student' })} /> Student</label>
                    <label><input type="radio" name="role" checked={registerForm.role === 'landlord'} onChange={() => setRegisterForm({ ...registerForm, role: 'landlord' })} /> Landlord</label>
                  </div>
                  <input
                    required
                    placeholder="Full name"
                    value={registerForm.fullName}
                    onChange={(event) => setRegisterForm({ ...registerForm, fullName: event.target.value })}
                  />
                  <input
                    required
                    placeholder="Phone"
                    value={registerForm.phone}
                    onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })}
                  />
                  {registerErrors.phone ? <p className="field-error">{registerErrors.phone}</p> : null}
                  <input
                    required
                    placeholder="Email"
                    value={registerForm.email}
                    onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                  />
                  {registerErrors.email ? <p className="field-error">{registerErrors.email}</p> : null}
                  <input
                    required
                    type="password"
                    placeholder="Password"
                    value={registerForm.password}
                    onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                  />

                  {registerForm.role === 'student' ? (
                    <>
                      <input placeholder="University name" value={registerForm.universityName} onChange={(event) => setRegisterForm({ ...registerForm, universityName: event.target.value })} />
                      <input placeholder="Course name" value={registerForm.courseName} onChange={(event) => setRegisterForm({ ...registerForm, courseName: event.target.value })} />
                      <div className="field-row">
                        <input type="number" min="1" max="8" placeholder="Year of study" value={registerForm.yearOfStudy} onChange={(event) => setRegisterForm({ ...registerForm, yearOfStudy: event.target.value })} />
                        <select value={registerForm.preferredGender} onChange={(event) => setRegisterForm({ ...registerForm, preferredGender: event.target.value })}>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="any">Any</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <input placeholder="Business name" value={registerForm.businessName} onChange={(event) => setRegisterForm({ ...registerForm, businessName: event.target.value })} />
                  )}

                  <button className="btn btn-primary" type="submit" disabled={authSubmitting}>{authSubmitting ? 'Creating account...' : 'Create Account'}</button>
                  <p className="switch-text">Already have account? <button type="button" onClick={() => openAuthModal('login')}>Log in</button></p>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : null}


    </div>
  );
}

export default App;
