import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { createRoomRentalClient, resolveApiBaseUrl } from './src/lib/api';

const tabs = [
  { key: 'saved', label: 'Saved Rooms', icon: 'heart-outline' },
  { key: 'browse', label: 'Browsing Rooms', icon: 'magnify' },
  { key: 'bookings', label: 'My Bookings', icon: 'wallet-outline' },
  { key: 'profile', label: 'Profile', icon: 'account-outline' }
];

const defaultRegisterForm = {
  role: 'student',
  fullName: '',
  phone: '',
  email: '',
  password: '',
  universityName: '',
  courseName: '',
  businessName: ''
};

const defaultLandlordListingForm = {
  localityId: '',
  title: '',
  addressLine1: '',
  monthlyRent: '',
  securityDeposit: '',
  imageUrl: '',
  latitude: '',
  longitude: ''
};

function currency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function listingImage(item) {
  return item?.primaryImageUrl || item?.images?.[0]?.image_url || 'https://picsum.photos/seed/room4rent-mobile/900/600';
}

function AppShell({ children, title, subtitle }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </ScrollView>
  );
}

export default function App() {
  const [authMode, setAuthMode] = useState('login');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('browse');

  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
  const [verificationMessage, setVerificationMessage] = useState('');

  const [searchText, setSearchText] = useState('');
  const [publicListings, setPublicListings] = useState([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState(null);
  const [listingInquiryDraft, setListingInquiryDraft] = useState('');
  const [immersiveLoading, setImmersiveLoading] = useState(false);

  const [savedListings, setSavedListings] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [profile, setProfile] = useState(null);
  const [conversations, setConversations] = useState([]);

  const [localities, setLocalities] = useState([]);
  const [landlordListingForm, setLandlordListingForm] = useState(defaultLandlordListingForm);
  const [locationDetecting, setLocationDetecting] = useState(false);

  const client = useMemo(
    () => createRoomRentalClient({ baseUrl: resolveApiBaseUrl(), token: session?.token || null }),
    [session]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setPublicLoading(true);
      try {
        const result = await client.fetchListings({ status: 'active', limit: 16 });
        if (!active) return;
        setPublicListings(result.items || []);
      } catch (error) {
        if (!active) return;
        Alert.alert('Load failed', error.message || 'Unable to load listings.');
      } finally {
        if (active) setPublicLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!session?.token) {
      setSavedListings([]);
      setBookings([]);
      setProfile(null);
      setConversations([]);
      setLocalities([]);
      return;
    }

    let active = true;

    (async () => {
      try {
        const tasks = [
          client.fetchProfile(),
          client.fetchConversations()
        ];

        if (session.role === 'student') {
          tasks.push(client.fetchSavedListings({ limit: 20 }));
          tasks.push(client.fetchMyInquiries({ limit: 20 }));
        }

        if (session.role === 'landlord') {
          tasks.push(client.fetchReceivedInquiries({ limit: 20 }));
          tasks.push(client.fetchLocalityInsights({ limit: 20 }));
        }

        const result = await Promise.all(tasks);
        if (!active) return;

        setProfile(result[0]);
        setConversations(result[1]?.items || []);

        if (session.role === 'student') {
          setSavedListings(result[2]?.items || []);
          setBookings(result[3]?.items || []);
        }

        if (session.role === 'landlord') {
          setBookings(result[2]?.items || []);
          setLocalities(result[3]?.items || []);
        }
      } catch (error) {
        if (!active) return;
        Alert.alert('Sync failed', error.message || 'Unable to sync account data.');
      }
    })();

    return () => {
      active = false;
    };
  }, [client, session]);

  async function handleLogin() {
    if (!loginForm.identifier.trim() || !loginForm.password.trim()) {
      Alert.alert('Missing fields', 'Please enter email/phone and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await client.login(loginForm.identifier.trim(), loginForm.password);
      setSession({ token: result.accessToken, role: result.user.role, user: result.user });
      setVerificationMessage('');
      setAuthMode('login');
    } catch (error) {
      if (error?.payload?.code === 'EMAIL_NOT_VERIFIED') {
        const text = error?.payload?.message || 'Please verify your email before login.';
        setVerificationMessage(text);
        Alert.alert('Email verification required', text);
      } else {
        Alert.alert('Login failed', error.message || 'Invalid credentials.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!registerForm.fullName.trim() || !registerForm.phone.trim() || !registerForm.email.trim() || !registerForm.password.trim()) {
      Alert.alert('Missing fields', 'Name, phone, email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        role: registerForm.role,
        fullName: registerForm.fullName.trim(),
        phone: registerForm.phone.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
        profile: registerForm.role === 'student'
          ? {
              universityName: registerForm.universityName || undefined,
              courseName: registerForm.courseName || undefined
            }
          : {
              businessName: registerForm.businessName || undefined
            }
      };

      const result = await client.register(payload);

      if (result.requiresEmailVerification) {
        const msg = result.message || 'Verification email sent. Please verify and then login.';
        setVerificationMessage(msg);
        setAuthMode('login');
        setLoginForm((current) => ({ ...current, identifier: registerForm.email.trim() }));
        Alert.alert('Verification sent', msg);
        return;
      }

      if (result.accessToken) {
        setSession({ token: result.accessToken, role: result.user.role, user: result.user });
        return;
      }

      Alert.alert('Signup completed', 'Now verify email and login.');
      setAuthMode('login');
    } catch (error) {
      Alert.alert('Signup failed', error.message || 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    const identifier = (loginForm.identifier || registerForm.email).trim();
    if (!identifier) {
      Alert.alert('Identifier required', 'Enter your registered email or phone first.');
      return;
    }

    try {
      const result = await client.resendVerification(identifier);
      Alert.alert('Verification resent', result.message || 'Please check your email.');
    } catch (error) {
      Alert.alert('Resend failed', error.message || 'Unable to resend verification.');
    }
  }

  async function openListing(listing) {
    setSelectedListing(listing);
    setImmersiveLoading(true);

    try {
      const immersive = await client.fetchImmersive(listing.id);
      setSelectedListing((current) => ({ ...current, immersiveAsset: immersive?.item || immersive || null }));
    } catch {
      // Ignore immersive failures and show listing detail without 3D link.
    } finally {
      setImmersiveLoading(false);
    }
  }

  async function handleSaveListing(listingId) {
    if (!session?.token || session.role !== 'student') {
      Alert.alert('Student login required', 'Login as student to save rooms.');
      return;
    }

    try {
      await client.saveListing(listingId);
      Alert.alert('Saved', 'Room added to your saved list.');
      const refreshed = await client.fetchSavedListings({ limit: 20 });
      setSavedListings(refreshed.items || []);
    } catch (error) {
      Alert.alert('Save failed', error.message || 'Unable to save room.');
    }
  }

  async function handleBookingRequest() {
    if (!selectedListing) return;

    if (!session?.token) {
      Alert.alert('Login required', 'Please login before booking.');
      return;
    }

    const message = listingInquiryDraft.trim();
    if (!message) {
      Alert.alert('Write message', 'Please add booking message before submit.');
      return;
    }

    try {
      await client.createInquiry(selectedListing.id, { message });
      if (selectedListing.landlord?.id) {
        await client.createConversation({
          participantUserId: selectedListing.landlord.id,
          listingId: selectedListing.id,
          initialMessage: message
        });
      }

      Alert.alert('Booking requested', 'Owner has received your booking request.');
      setListingInquiryDraft('');

      if (session.role === 'student') {
        const refreshed = await client.fetchMyInquiries({ limit: 20 });
        setBookings(refreshed.items || []);
      }
    } catch (error) {
      Alert.alert('Booking failed', error.message || 'Unable to submit booking request.');
    }
  }

  async function publishLandlordListing() {
    if (session?.role !== 'landlord') {
      Alert.alert('Landlord only', 'Only landlord accounts can publish listing.');
      return;
    }

    if (!landlordListingForm.localityId || !landlordListingForm.title || !landlordListingForm.addressLine1 || !landlordListingForm.monthlyRent) {
      Alert.alert('Missing fields', 'Select locality and fill title, address, monthly rent.');
      return;
    }

    try {
      const created = await client.createListing({
        localityId: landlordListingForm.localityId,
        title: landlordListingForm.title,
        addressLine1: landlordListingForm.addressLine1,
        monthlyRent: Number(landlordListingForm.monthlyRent),
        securityDeposit: landlordListingForm.securityDeposit ? Number(landlordListingForm.securityDeposit) : 0,
        latitude: landlordListingForm.latitude ? Number(landlordListingForm.latitude) : undefined,
        longitude: landlordListingForm.longitude ? Number(landlordListingForm.longitude) : undefined,
        status: 'active'
      });

      if (landlordListingForm.imageUrl.trim()) {
        await client.addListingImage(created.listing.id, {
          imageUrl: landlordListingForm.imageUrl.trim(),
          isPrimary: true,
          sortOrder: 0
        });
      }

      setLandlordListingForm(defaultLandlordListingForm);
      Alert.alert('Published', 'Your listing is published successfully.');
    } catch (error) {
      Alert.alert('Publish failed', error.message || 'Could not publish listing.');
    }
  }

  async function detectCurrentLocation() {
    try {
      setLocationDetecting(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to auto-fill property location.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      let addressText = '';
      try {
        const geocoded = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocoded?.length) {
          const place = geocoded[0];
          addressText = [place.name, place.street, place.city].filter(Boolean).join(', ');
        }
      } catch {
        addressText = '';
      }

      setLandlordListingForm((current) => ({
        ...current,
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6),
        addressLine1: current.addressLine1 || addressText
      }));
      Alert.alert('Location detected', 'Coordinates have been filled automatically.');
    } catch (error) {
      Alert.alert('Location failed', error.message || 'Unable to detect current location.');
    } finally {
      setLocationDetecting(false);
    }
  }

  const filteredListings = useMemo(() => {
    const phrase = searchText.trim().toLowerCase();
    if (!phrase) return publicListings;

    return publicListings.filter((item) => {
      const text = `${item.title || ''} ${item.description || ''} ${item.locality?.city || ''} ${item.locality?.localityName || ''}`.toLowerCase();
      return text.includes(phrase);
    });
  }, [publicListings, searchText]);

  function renderAuth() {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <AppShell title="Room4Rent" subtitle="Student ?? Employee ?? ??? ???? room booking ??">
          <View style={styles.authSwitchRow}>
            <Pressable style={[styles.authSwitch, authMode === 'login' && styles.authSwitchActive]} onPress={() => setAuthMode('login')}>
              <Text style={[styles.authSwitchText, authMode === 'login' && styles.authSwitchTextActive]}>Log In</Text>
            </Pressable>
            <Pressable style={[styles.authSwitch, authMode === 'register' && styles.authSwitchActive]} onPress={() => setAuthMode('register')}>
              <Text style={[styles.authSwitchText, authMode === 'register' && styles.authSwitchTextActive]}>Sign Up</Text>
            </Pressable>
          </View>

          {verificationMessage ? <Text style={styles.verificationBanner}>{verificationMessage}</Text> : null}

          {authMode === 'login' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Welcome back</Text>
              <TextInput
                style={styles.input}
                placeholder="Email or phone"
                value={loginForm.identifier}
                onChangeText={(value) => setLoginForm((current) => ({ ...current, identifier: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                secureTextEntry
                value={loginForm.password}
                onChangeText={(value) => setLoginForm((current) => ({ ...current, password: value }))}
              />
              <Pressable style={styles.primaryBtn} onPress={handleLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryBtnText}>Log In</Text>}
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={handleResendVerification}>
                <Text style={styles.secondaryBtnText}>Resend verification email</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Create account</Text>

              <View style={styles.roleRow}>
                <Pressable
                  style={[styles.roleChip, registerForm.role === 'student' && styles.roleChipActive]}
                  onPress={() => setRegisterForm((current) => ({ ...current, role: 'student' }))}
                >
                  <Text style={[styles.roleChipText, registerForm.role === 'student' && styles.roleChipTextActive]}>Student</Text>
                </Pressable>
                <Pressable
                  style={[styles.roleChip, registerForm.role === 'landlord' && styles.roleChipActive]}
                  onPress={() => setRegisterForm((current) => ({ ...current, role: 'landlord' }))}
                >
                  <Text style={[styles.roleChipText, registerForm.role === 'landlord' && styles.roleChipTextActive]}>Landowner</Text>
                </Pressable>
              </View>

              <TextInput style={styles.input} placeholder="Full name" value={registerForm.fullName} onChangeText={(value) => setRegisterForm((current) => ({ ...current, fullName: value }))} />
              <TextInput style={styles.input} placeholder="Phone" value={registerForm.phone} onChangeText={(value) => setRegisterForm((current) => ({ ...current, phone: value }))} keyboardType="phone-pad" />
              <TextInput style={styles.input} placeholder="Email" value={registerForm.email} onChangeText={(value) => setRegisterForm((current) => ({ ...current, email: value }))} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Password" secureTextEntry value={registerForm.password} onChangeText={(value) => setRegisterForm((current) => ({ ...current, password: value }))} />

              {registerForm.role === 'student' ? (
                <>
                  <TextInput style={styles.input} placeholder="University / Company" value={registerForm.universityName} onChangeText={(value) => setRegisterForm((current) => ({ ...current, universityName: value }))} />
                  <TextInput style={styles.input} placeholder="Course / Department" value={registerForm.courseName} onChangeText={(value) => setRegisterForm((current) => ({ ...current, courseName: value }))} />
                </>
              ) : (
                <TextInput style={styles.input} placeholder="Business name" value={registerForm.businessName} onChangeText={(value) => setRegisterForm((current) => ({ ...current, businessName: value }))} />
              )}

              <Pressable style={styles.primaryBtn} onPress={handleRegister} disabled={loading}>
                {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryBtnText}>Sign Up</Text>}
              </Pressable>
            </View>
          )}
        </AppShell>
      </SafeAreaView>
    );
  }

  function renderBrowse() {
    if (selectedListing) {
      return (
        <ScrollView contentContainerStyle={styles.screen}>
          <Pressable style={styles.backBtn} onPress={() => setSelectedListing(null)}>
            <Text style={styles.backBtnText}>? Back to listings</Text>
          </Pressable>

          <View style={styles.detailHeroCard}>
            <Image source={{ uri: listingImage(selectedListing) }} style={styles.detailHeroImage} />
          </View>

          <Text style={styles.detailTitle}>{selectedListing.title}</Text>
          <Text style={styles.detailAddress}>{selectedListing.addressLine1 || '-'}, {selectedListing.locality?.city || '-'}</Text>

          <View style={styles.detailStatsRow}>
            <View style={styles.detailStat}><Text style={styles.detailStatLabel}>Rent</Text><Text style={styles.detailStatValue}>{currency(selectedListing.monthlyRent)}</Text></View>
            <View style={styles.detailStat}><Text style={styles.detailStatLabel}>Deposit</Text><Text style={styles.detailStatValue}>{currency(selectedListing.securityDeposit || 0)}</Text></View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Owner & Booking</Text>
            <Text style={styles.detailOwnerName}>{selectedListing.landlord?.fullName || 'Owner'}</Text>
            <Text style={styles.detailOwnerLine}>Phone: {selectedListing.landlord?.phone || 'Will be shared after inquiry'}</Text>
            <Text style={styles.detailOwnerLine}>Email: {selectedListing.landlord?.email || 'Not available'}</Text>

            <TextInput
              style={[styles.input, styles.detailMessageInput]}
              placeholder="Move-in date, budget, and your message"
              value={listingInquiryDraft}
              onChangeText={setListingInquiryDraft}
              multiline
            />

            <Pressable style={styles.primaryBtn} onPress={handleBookingRequest}>
              <Text style={styles.primaryBtnText}>Request Booking</Text>
            </Pressable>

            <Pressable style={styles.secondaryBtn} onPress={() => handleSaveListing(selectedListing.id)}>
              <Text style={styles.secondaryBtnText}>Save Room</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Room Details</Text>
            <Text style={styles.detailParagraph}>{selectedListing.description || 'Safe and comfortable accommodation with essential amenities.'}</Text>
            <Text style={styles.detailOwnerLine}>Location: {selectedListing.locality?.localityName || '-'}, {selectedListing.locality?.city || '-'}</Text>
            <Text style={styles.detailOwnerLine}>Type: {selectedListing.roomType || 'PG'} | Furnishing: {selectedListing.furnishingType || 'Furnished'}</Text>

            <Pressable
              style={styles.secondaryBtn}
              onPress={() => {
                const url = selectedListing?.immersiveAsset?.assetUrl;
                if (!url) {
                  Alert.alert('3D view', immersiveLoading ? 'Loading 3D view...' : '3D view link is not available for this listing yet.');
                  return;
                }
                Linking.openURL(url).catch(() => Alert.alert('Open failed', 'Unable to open 3D link.'));
              }}
            >
              <Text style={styles.secondaryBtnText}>Open 3D View</Text>
            </Pressable>
          </View>

          <View style={styles.featureGrid}>
            <View style={styles.featureCard}><Text style={styles.featureTitle}>Chat</Text><Text style={styles.featureBody}>Direct landlord chat available</Text></View>
            <View style={styles.featureCard}><Text style={styles.featureTitle}>Online Payment</Text><Text style={styles.featureBody}>Pay rent securely in app</Text></View>
            <View style={styles.featureCard}><Text style={styles.featureTitle}>Digital Agreement</Text><Text style={styles.featureBody}>Rent agreement workflow</Text></View>
            <View style={styles.featureCard}><Text style={styles.featureTitle}>Reviews</Text><Text style={styles.featureBody}>Ratings and feedback support</Text></View>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.title}>Browse Rooms</Text>

        <TextInput
          style={[styles.input, styles.searchInput]}
          placeholder="Search city, area, room type"
          value={searchText}
          onChangeText={setSearchText}
        />

        <View style={styles.offerBanner}>
          <Text style={styles.offerTitle}>First Booking 50% Off!</Text>
          <Text style={styles.offerSub}>Limited time offer for students and employees.</Text>
          <Pressable style={styles.offerBtn} onPress={() => Alert.alert('Offer applied', 'Choose your room now and send a booking request.') }>
            <Text style={styles.offerBtnText}>Book Now</Text>
          </Pressable>
        </View>

        {publicLoading ? <ActivityIndicator size="large" color="#3f37c9" style={styles.loader} /> : null}

        {filteredListings.map((item) => (
          <Pressable key={item.id} style={styles.listingCard} onPress={() => openListing(item)}>
            <Image source={{ uri: listingImage(item) }} style={styles.listingImage} />
            <View style={styles.listingBody}>
              <Text style={styles.listingTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.listingMeta}>{item.locality?.localityName || '-'}, {item.locality?.city || '-'}</Text>
              <Text style={styles.listingRent}>{currency(item.monthlyRent)} / month</Text>
              <Text style={styles.listing3d}>Tap for details + 3D view</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  function renderSaved() {
    if (!session?.token) {
      return <AppShell title="Saved Rooms" subtitle="Login to save your favourite rooms." />;
    }

    return (
      <AppShell title="Saved Rooms" subtitle="Your bookmarked shortlist">
        {savedListings.length === 0 ? <Text style={styles.emptyText}>No saved rooms yet.</Text> : null}
        {savedListings.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <Text style={styles.sectionTitle}>{entry.listingTitle || entry.title || 'Saved Room'}</Text>
            <Text style={styles.detailOwnerLine}>Status: {entry.status || 'saved'}</Text>
          </View>
        ))}
      </AppShell>
    );
  }

  function renderBookings() {
    if (!session?.token) {
      return <AppShell title="My Bookings" subtitle="Login to track booking requests." />;
    }

    return (
      <AppShell
        title="My Bookings"
        subtitle={session.role === 'student' ? 'Track booking requests and payment flow' : 'Manage incoming booking requests'}
      >
        {bookings.length === 0 ? <Text style={styles.emptyText}>No booking records yet.</Text> : null}

        {bookings.map((entry) => (
          <View key={entry.id} style={styles.card}>
            <Text style={styles.sectionTitle}>{entry.listing?.title || 'Room booking'}</Text>
            <Text style={styles.detailOwnerLine}>Status: {entry.status || 'pending'}</Text>
            <Text style={styles.detailOwnerLine}>Message: {entry.message || 'No message'}</Text>
            <View style={styles.rowGap}>
              <Pressable style={styles.secondaryBtn} onPress={() => Alert.alert('Chat', 'Chat module is available from profile and room details flow.')}> 
                <Text style={styles.secondaryBtnText}>Chat</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => Alert.alert('Payment', 'Online payment integration is enabled in membership and booking flow.')}> 
                <Text style={styles.secondaryBtnText}>Pay Online</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => Alert.alert('Agreement', 'Digital rent agreement workflow can be completed post booking approval.')}> 
                <Text style={styles.secondaryBtnText}>Agreement</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </AppShell>
    );
  }

  function renderProfile() {
    if (!session?.token) {
      return <AppShell title="Profile" subtitle="Login to view profile." />;
    }

    return (
      <AppShell title="Profile" subtitle={`Logged in as ${session.role}`}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{profile?.fullName || session.user?.fullName || 'User'}</Text>
          <Text style={styles.detailOwnerLine}>Email: {profile?.email || session.user?.email || '-'}</Text>
          <Text style={styles.detailOwnerLine}>Phone: {profile?.phone || session.user?.phone || '-'}</Text>
          <Text style={styles.detailOwnerLine}>Conversations: {conversations.length}</Text>
        </View>

        <View style={styles.featureGrid}>
          <View style={styles.featureCard}><Text style={styles.featureTitle}>Chat</Text><Text style={styles.featureBody}>Direct student-landlord messages</Text></View>
          <View style={styles.featureCard}><Text style={styles.featureTitle}>Payments</Text><Text style={styles.featureBody}>Online rent and receipts</Text></View>
          <View style={styles.featureCard}><Text style={styles.featureTitle}>Agreement</Text><Text style={styles.featureBody}>Digital rent agreement flow</Text></View>
          <View style={styles.featureCard}><Text style={styles.featureTitle}>Reviews</Text><Text style={styles.featureBody}>Rate your stay and owners</Text></View>
        </View>

        {session.role === 'landlord' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Publish Listing</Text>

            <Text style={styles.detailOwnerLine}>Select locality</Text>
            <View style={styles.localityWrap}>
              {localities.slice(0, 8).map((loc) => (
                <Pressable
                  key={loc.id}
                  style={[styles.localityChip, landlordListingForm.localityId === loc.id && styles.localityChipActive]}
                  onPress={() => setLandlordListingForm((current) => ({ ...current, localityId: loc.id }))}
                >
                  <Text style={[styles.localityChipText, landlordListingForm.localityId === loc.id && styles.localityChipTextActive]}>{loc.localityName}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput style={styles.input} placeholder="Listing title" value={landlordListingForm.title} onChangeText={(value) => setLandlordListingForm((current) => ({ ...current, title: value }))} />
            <TextInput style={styles.input} placeholder="Address" value={landlordListingForm.addressLine1} onChangeText={(value) => setLandlordListingForm((current) => ({ ...current, addressLine1: value }))} />
            <Pressable style={styles.secondaryBtn} onPress={detectCurrentLocation} disabled={locationDetecting}>
              <Text style={styles.secondaryBtnText}>{locationDetecting ? 'Detecting location...' : 'Auto Detect Location'}</Text>
            </Pressable>
            <View style={styles.rowGap}>
              <TextInput style={[styles.input, styles.halfInput]} placeholder="Latitude" value={landlordListingForm.latitude} onChangeText={(value) => setLandlordListingForm((current) => ({ ...current, latitude: value }))} />
              <TextInput style={[styles.input, styles.halfInput]} placeholder="Longitude" value={landlordListingForm.longitude} onChangeText={(value) => setLandlordListingForm((current) => ({ ...current, longitude: value }))} />
            </View>
            <TextInput style={styles.input} placeholder="Monthly rent" keyboardType="numeric" value={landlordListingForm.monthlyRent} onChangeText={(value) => setLandlordListingForm((current) => ({ ...current, monthlyRent: value }))} />
            <TextInput style={styles.input} placeholder="Security deposit" keyboardType="numeric" value={landlordListingForm.securityDeposit} onChangeText={(value) => setLandlordListingForm((current) => ({ ...current, securityDeposit: value }))} />
            <TextInput style={styles.input} placeholder="Primary image URL" value={landlordListingForm.imageUrl} onChangeText={(value) => setLandlordListingForm((current) => ({ ...current, imageUrl: value }))} />

            <Pressable style={styles.primaryBtn} onPress={publishLandlordListing}>
              <Text style={styles.primaryBtnText}>Publish Property</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          style={[styles.secondaryBtn, styles.logoutBtn]}
          onPress={() => {
            setSession(null);
            setTab('browse');
            setSelectedListing(null);
          }}
        >
          <Text style={styles.secondaryBtnText}>Log out</Text>
        </Pressable>
      </AppShell>
    );
  }

  function renderActiveTab() {
    if (tab === 'saved') return renderSaved();
    if (tab === 'bookings') return renderBookings();
    if (tab === 'profile') return renderProfile();
    return renderBrowse();
  }

  if (!session) {
    return renderAuth();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.appBody}>{renderActiveTab()}</View>
      <View style={styles.bottomNav}>
        {tabs.map((item) => (
          <Pressable key={item.key} style={styles.tabBtn} onPress={() => setTab(item.key)}>
            <MaterialCommunityIcons name={item.icon} size={20} color={tab === item.key ? '#3f37c9' : '#8089a6'} />
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f6ff'
  },
  appBody: {
    flex: 1
  },
  screen: {
    padding: 16,
    gap: 12,
    paddingBottom: 100
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1d2340'
  },
  subtitle: {
    color: '#546078',
    fontSize: 14,
    marginBottom: 8
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9dff0',
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2852'
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d9f0',
    backgroundColor: '#fdfdff',
    paddingHorizontal: 12,
    color: '#1f2852'
  },
  searchInput: {
    minHeight: 52,
    fontSize: 16,
    backgroundColor: '#ffffff'
  },
  authSwitchRow: {
    backgroundColor: '#ecefff',
    borderRadius: 12,
    padding: 4,
    flexDirection: 'row'
  },
  authSwitch: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  authSwitchActive: {
    backgroundColor: '#ffffff'
  },
  authSwitchText: {
    color: '#6a7391',
    fontWeight: '700'
  },
  authSwitchTextActive: {
    color: '#2d2f77'
  },
  verificationBanner: {
    borderWidth: 1,
    borderColor: '#f0d39c',
    backgroundColor: '#fff7e8',
    color: '#7c4d09',
    borderRadius: 10,
    padding: 10,
    fontWeight: '600'
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8
  },
  roleChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d0d9f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff'
  },
  roleChipActive: {
    backgroundColor: '#3f37c9',
    borderColor: '#3f37c9'
  },
  roleChipText: {
    color: '#3d4a67',
    fontWeight: '700'
  },
  roleChipTextActive: {
    color: '#ffffff'
  },
  primaryBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#3f37c9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15
  },
  secondaryBtn: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0d9f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  secondaryBtnText: {
    color: '#344163',
    fontWeight: '700'
  },
  loader: {
    marginTop: 20
  },
  offerBanner: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#2f2a9a',
    borderWidth: 1,
    borderColor: '#4b45c9',
    gap: 8
  },
  offerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800'
  },
  offerSub: {
    color: '#d9dbff'
  },
  offerBtn: {
    alignSelf: 'flex-start',
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#f6a019',
    alignItems: 'center',
    justifyContent: 'center'
  },
  offerBtnText: {
    color: '#251c10',
    fontWeight: '800'
  },
  listingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9dff0',
    overflow: 'hidden'
  },
  listingImage: {
    width: '100%',
    height: 190,
    resizeMode: 'cover'
  },
  listingBody: {
    padding: 12,
    gap: 4
  },
  listingTitle: {
    color: '#1f2852',
    fontSize: 16,
    fontWeight: '700'
  },
  listingMeta: {
    color: '#5e6b84'
  },
  listingRent: {
    color: '#1b1f42',
    fontWeight: '800'
  },
  listing3d: {
    color: '#3f37c9',
    fontWeight: '700',
    fontSize: 12
  },
  backBtn: {
    alignSelf: 'flex-start'
  },
  backBtnText: {
    color: '#3f37c9',
    fontWeight: '700'
  },
  detailHeroCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d9dff0'
  },
  detailHeroImage: {
    width: '100%',
    height: 230,
    resizeMode: 'cover'
  },
  detailTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1d2340'
  },
  detailAddress: {
    color: '#5d6a85',
    marginTop: -4
  },
  detailStatsRow: {
    flexDirection: 'row',
    gap: 8
  },
  detailStat: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d8dff0',
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 2
  },
  detailStatLabel: {
    color: '#65728b',
    fontSize: 12
  },
  detailStatValue: {
    color: '#1e2543',
    fontWeight: '800'
  },
  detailOwnerName: {
    color: '#1f2852',
    fontSize: 18,
    fontWeight: '700'
  },
  detailOwnerLine: {
    color: '#596782'
  },
  detailMessageInput: {
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 12
  },
  detailParagraph: {
    color: '#51617d',
    lineHeight: 22
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  featureCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe1f3',
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 4
  },
  featureTitle: {
    color: '#1d2340',
    fontWeight: '700'
  },
  featureBody: {
    color: '#5a6882',
    fontSize: 12
  },
  emptyText: {
    color: '#5a6882',
    fontWeight: '600'
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  halfInput: {
    flex: 1,
    minWidth: 130
  },
  localityWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  localityChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d0d9f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  localityChipActive: {
    backgroundColor: '#ecebff',
    borderColor: '#3f37c9'
  },
  localityChipText: {
    color: '#3c4866',
    fontWeight: '700',
    fontSize: 12
  },
  localityChipTextActive: {
    color: '#2b2599'
  },
  logoutBtn: {
    marginTop: 8
  },
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#d9def0',
    backgroundColor: '#ffffff',
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 6
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 2
  },
  tabText: {
    fontSize: 10,
    color: '#8089a6',
    fontWeight: '700',
    textAlign: 'center'
  },
  tabTextActive: {
    color: '#3f37c9'
  }
});
