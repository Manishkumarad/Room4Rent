import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { createRoomRentalClient, resolveApiBaseUrl } from './src/lib/api';

const tabs = [
  { key: 'discover', label: 'Discover' },
  { key: 'saved', label: 'Saved' },
  { key: 'chat', label: 'Chat' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'membership', label: 'Membership' },
  { key: 'profile', label: 'Profile' }
];

function currency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Pill({ text, active }) {
  return <Text style={[styles.pill, active && styles.pillActive]}>{text}</Text>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('discover');
  const [loading, setLoading] = useState(true);
  const [publicData, setPublicData] = useState({ health: null, plans: [], listings: [], error: null });
  const [roleData, setRoleData] = useState({ loading: false, data: null, error: null });
  const [connectedData, setConnectedData] = useState({
    profile: null,
    savedSearches: [],
    alerts: [],
    conversations: [],
    messages: [],
    roommateProfile: null,
    roommateMatches: [],
    selectedConversation: null
  });
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    role: 'student',
    fullName: '',
    phone: '',
    email: '',
    password: '',
    universityName: '',
    courseName: '',
    budgetMin: '',
    budgetMax: '',
    preferredGender: '',
    businessName: ''
  });
  const [filters, setFilters] = useState({ city: '', search: '', minRent: '', maxRent: '' });
  const [savedSearchForm, setSavedSearchForm] = useState({ name: 'My search', city: '', search: '', minBudget: '', maxBudget: '' });
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    email: '',
    studentProfile: { universityName: '', courseName: '', yearOfStudy: '', budgetMin: '', budgetMax: '', preferredGender: '' },
    landlordProfile: { businessName: '' },
    roommateProfile: { sleepSchedule: '', foodPreference: '', smokingPreference: '', studyNoisePreference: '', bio: '', isOptedIn: true }
  });
  const [selectedListing, setSelectedListing] = useState(null);
  const [listingInquiryDraft, setListingInquiryDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');

  const client = useMemo(() => createRoomRentalClient({ baseUrl: resolveApiBaseUrl(), token: session?.token || null }), [session]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [health, plans, listings] = await Promise.all([
          client.fetchHealth(),
          client.fetchPlans(),
          client.fetchListings({ status: 'active', limit: 6 })
        ]);
        if (!active) return;
        setPublicData({ health, plans: plans.items || [], listings: listings.items || [], error: null });
      } catch (error) {
        if (!active) return;
        setPublicData((current) => ({ ...current, error: error.message }));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!session?.token) {
      setRoleData({ loading: false, data: null, error: null });
      setConnectedData({ profile: null, savedSearches: [], alerts: [], conversations: [], messages: [], roommateProfile: null, roommateMatches: [], selectedConversation: null });
      return undefined;
    }

    let active = true;
    setRoleData({ loading: true, data: null, error: null });

    (async () => {
      try {
        let data = null;
        if (session.role === 'student') {
          data = {
            dashboard: await client.fetchStudentDashboard(),
            alerts: await client.fetchStudentAlerts({ limit: 5 }),
            rooms: await client.fetchRoommates({ limit: 5 })
          };
        } else if (session.role === 'landlord') {
          data = {
            dashboard: await client.fetchLandlordDashboard(),
            membership: await client.fetchMembership(),
            conversations: await client.fetchConversations()
          };
        } else {
          data = {
            overview: await client.fetchAdminOverview(),
            workers: await client.fetchWorkerHealth(),
            queues: await client.fetchQueueHealth()
          };
        }

        if (!active) return;
        setRoleData({ loading: false, data, error: null });
      } catch (error) {
        if (!active) return;
        setRoleData({ loading: false, data: null, error: error.message });
      }
    })();

    return () => {
      active = false;
    };
  }, [client, session]);

  useEffect(() => {
    if (!session?.token) {
      return undefined;
    }

    let active = true;

    (async () => {
      try {
        const results = await Promise.all([
          client.fetchProfile(),
          session.role === 'student' ? client.fetchSavedSearches() : Promise.resolve({ items: [] }),
          session.role === 'student' ? client.fetchStudentAlerts({ limit: 10 }) : Promise.resolve({ items: [] }),
          session.role === 'student' ? client.fetchRoommateProfile() : Promise.resolve({ profile: null }),
          session.role === 'student' ? client.fetchRoommates({ limit: 8 }) : Promise.resolve({ items: [] }),
          session.role === 'student' || session.role === 'landlord' ? client.fetchConversations() : Promise.resolve({ items: [] })
        ]);

        if (!active) return;

        const [profile, savedSearches, alerts, roommateProfile, roommateMatches, conversations] = results;
        setConnectedData({
          profile,
          savedSearches: savedSearches.items || [],
          alerts: alerts.items || [],
          conversations: conversations.items || [],
          messages: [],
          roommateProfile: roommateProfile.profile || null,
          roommateMatches: roommateMatches.items || [],
          selectedConversation: null
        });

        setProfileForm({
          fullName: profile.fullName || '',
          email: profile.email || '',
          studentProfile: {
            universityName: profile.roleProfile?.university_name || '',
            courseName: profile.roleProfile?.course_name || '',
            yearOfStudy: profile.roleProfile?.year_of_study || '',
            budgetMin: profile.roleProfile?.budget_min || '',
            budgetMax: profile.roleProfile?.budget_max || '',
            preferredGender: profile.roleProfile?.preferred_gender || ''
          },
          landlordProfile: { businessName: profile.roleProfile?.business_name || '' },
          roommateProfile: {
            sleepSchedule: roommateProfile.profile?.sleep_schedule || '',
            foodPreference: roommateProfile.profile?.food_preference || '',
            smokingPreference: roommateProfile.profile?.smoking_preference || '',
            studyNoisePreference: roommateProfile.profile?.study_noise_preference || '',
            bio: roommateProfile.profile?.bio || '',
            isOptedIn: roommateProfile.profile?.is_opted_in ?? true
          }
        });
      } catch (error) {
        if (!active) return;
        Alert.alert('Sync failed', error.message);
      }
    })();

    return () => {
      active = false;
    };
  }, [client, session]);

  async function refreshListings() {
    try {
      const listings = await client.fetchStudentListings({
        city: filters.city,
        search: filters.search,
        minBudget: filters.minRent,
        maxBudget: filters.maxRent,
        limit: 6
      });
      setPublicData((current) => ({ ...current, listings: listings.items || [] }));
    } catch (error) {
      Alert.alert('Search failed', error.message);
    }
  }

  async function openListing(listing) {
    try {
      const immersive = await client.fetchImmersive(listing.id);
      setSelectedListing({ ...listing, immersiveAsset: immersive.item || immersive });
    } catch {
      setSelectedListing(listing);
    }
  }

  async function saveSelectedListing() {
    if (!selectedListing) return;
    try {
      await client.saveListing(selectedListing.id);
      Alert.alert('Saved', `${selectedListing.title} was added to your shortlist.`);
    } catch (error) {
      Alert.alert('Save failed', error.message);
    }
  }

  async function sendListingInquiry() {
    if (!selectedListing) return;
    const body = listingInquiryDraft.trim();
    if (!body) {
      Alert.alert('Write a message first', 'Add a short inquiry before sending.');
      return;
    }

    if (!selectedListing.landlord?.id) {
      Alert.alert('Missing landlord', 'This listing does not include a landlord contact yet.');
      return;
    }

    try {
      await client.createInquiry(selectedListing.id, { message: body });
      await client.createConversation({
        participantUserId: selectedListing.landlord?.id,
        listingId: selectedListing.id,
        initialMessage: body
      });
      setListingInquiryDraft('');
      Alert.alert('Sent', 'Inquiry and chat request sent.');
    } catch (error) {
      Alert.alert('Inquiry failed', error.message);
    }
  }

  async function saveSearch() {
    try {
      await client.createSavedSearch({
        name: savedSearchForm.name,
        filters: {
          city: savedSearchForm.city || undefined,
          search: savedSearchForm.search || undefined,
          minBudget: savedSearchForm.minBudget ? Number(savedSearchForm.minBudget) : undefined,
          maxBudget: savedSearchForm.maxBudget ? Number(savedSearchForm.maxBudget) : undefined
        },
        isActive: true
      });
      const searches = await client.fetchSavedSearches();
      setConnectedData((current) => ({ ...current, savedSearches: searches.items || [] }));
      Alert.alert('Saved', 'Search saved successfully.');
    } catch (error) {
      Alert.alert('Save search failed', error.message);
    }
  }

  async function selectConversation(conversation) {
    try {
      const [conversationResult, messagesResult] = await Promise.all([
        client.fetchConversation(conversation.id),
        client.fetchMessages(conversation.id, { limit: 30 })
      ]);
      setConnectedData((current) => ({
        ...current,
        selectedConversation: conversationResult.conversation || conversation,
        messages: messagesResult.items || []
      }));
    } catch (error) {
      Alert.alert('Chat failed', error.message);
    }
  }

  async function sendMessage() {
    if (!connectedData.selectedConversation) return;
    const body = messageDraft.trim();
    if (!body) {
      Alert.alert('Write a message first', 'Type a message before sending.');
      return;
    }

    try {
      await client.sendMessage(connectedData.selectedConversation.id, { body, messageType: 'text' });
      setMessageDraft('');
      await selectConversation(connectedData.selectedConversation);
    } catch (error) {
      Alert.alert('Send failed', error.message);
    }
  }

  async function updateProfile() {
    try {
      const payload = {
        fullName: profileForm.fullName || undefined,
        email: profileForm.email || null,
        studentProfile: session?.role === 'student' ? {
          universityName: profileForm.studentProfile.universityName || null,
          courseName: profileForm.studentProfile.courseName || null,
          yearOfStudy: profileForm.studentProfile.yearOfStudy ? Number(profileForm.studentProfile.yearOfStudy) : null,
          budgetMin: profileForm.studentProfile.budgetMin ? Number(profileForm.studentProfile.budgetMin) : null,
          budgetMax: profileForm.studentProfile.budgetMax ? Number(profileForm.studentProfile.budgetMax) : null,
          preferredGender: profileForm.studentProfile.preferredGender || null
        } : undefined,
        landlordProfile: session?.role === 'landlord' ? { businessName: profileForm.landlordProfile.businessName || null } : undefined
      };

      const updated = await client.updateProfile(payload);
      setConnectedData((current) => ({ ...current, profile: updated }));
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (error) {
      Alert.alert('Profile update failed', error.message);
    }
  }

  async function updateRoommateProfile() {
    if (session?.role !== 'student') return;

    try {
      const updated = await client.updateRoommateProfile({
        sleepSchedule: profileForm.roommateProfile.sleepSchedule || null,
        foodPreference: profileForm.roommateProfile.foodPreference || null,
        smokingPreference: profileForm.roommateProfile.smokingPreference || null,
        studyNoisePreference: profileForm.roommateProfile.studyNoisePreference || null,
        bio: profileForm.roommateProfile.bio || null,
        isOptedIn: Boolean(profileForm.roommateProfile.isOptedIn)
      });
      setConnectedData((current) => ({ ...current, roommateProfile: updated }));
      Alert.alert('Saved', 'Roommate profile updated.');
    } catch (error) {
      Alert.alert('Roommate profile failed', error.message);
    }
  }

  async function login() {
    try {
      const response = await client.login(loginForm.identifier, loginForm.password);
      const nextSession = { token: response.accessToken, role: response.user.role, user: response.user };
      setSession(nextSession);
    } catch (error) {
      Alert.alert('Login failed', error.message);
    }
  }

  async function register() {
    try {
      const payload = {
        role: registerForm.role,
        fullName: registerForm.fullName,
        phone: registerForm.phone,
        email: registerForm.email || undefined,
        password: registerForm.password,
        profile: registerForm.role === 'landlord'
          ? { businessName: registerForm.businessName }
          : {
              universityName: registerForm.universityName || undefined,
              courseName: registerForm.courseName || undefined,
              budgetMin: registerForm.budgetMin ? Number(registerForm.budgetMin) : undefined,
              budgetMax: registerForm.budgetMax ? Number(registerForm.budgetMax) : undefined,
              preferredGender: registerForm.preferredGender || undefined
            }
      };
      const response = await client.register(payload);
      setSession({ token: response.accessToken, role: response.user.role, user: response.user });
    } catch (error) {
      Alert.alert('Registration failed', error.message);
    }
  }

  function logout() {
    setSession(null);
    setRoleData({ loading: false, data: null, error: null });
  }

  const activeTab = tabs.find((item) => item.key === tab) || tabs[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backgroundOrbA} />
      <View style={styles.backgroundOrbB} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.heroCard}>
          <Text style={styles.brand}>RoomRental</Text>
          <Text style={styles.heroTitle}>Verified room discovery for Indian students</Text>
          <Text style={styles.heroCopy}>
            Premium yet practical mobile journeys for Tier 2 and Tier 3 cities, backed by the same backend used by the web app.
          </Text>
          <View style={styles.pillRow}>
            <Pill text="Verified" active />
            <Pill text="Chat" />
            <Pill text="Immersive" />
            <Pill text="Secure" />
          </View>
          <View style={styles.healthRow}>
            <View style={styles.healthBox}><Text style={styles.healthValue}>{publicData.health?.status || 'checking'}</Text><Text style={styles.healthLabel}>API health</Text></View>
            <View style={styles.healthBox}><Text style={styles.healthValue}>{publicData.listings.length}</Text><Text style={styles.healthLabel}>Listings</Text></View>
            <View style={styles.healthBox}><Text style={styles.healthValue}>{publicData.plans.length}</Text><Text style={styles.healthLabel}>Plans</Text></View>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Access the platform</Text>
          <TextInput style={styles.input} placeholder="Phone or email" placeholderTextColor="#74839b" value={loginForm.identifier} onChangeText={(value) => setLoginForm({ ...loginForm, identifier: value })} />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#74839b" secureTextEntry value={loginForm.password} onChangeText={(value) => setLoginForm({ ...loginForm, password: value })} />
          <Pressable style={styles.primaryButton} onPress={login}><Text style={styles.primaryButtonText}>Login</Text></Pressable>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Create account</Text>
          <TextInput style={styles.input} placeholder="Role (student / landlord)" placeholderTextColor="#74839b" value={registerForm.role} onChangeText={(value) => setRegisterForm({ ...registerForm, role: value })} />
          <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#74839b" value={registerForm.fullName} onChangeText={(value) => setRegisterForm({ ...registerForm, fullName: value })} />
          <TextInput style={styles.input} placeholder="Phone" placeholderTextColor="#74839b" value={registerForm.phone} onChangeText={(value) => setRegisterForm({ ...registerForm, phone: value })} />
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#74839b" value={registerForm.email} onChangeText={(value) => setRegisterForm({ ...registerForm, email: value })} />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#74839b" secureTextEntry value={registerForm.password} onChangeText={(value) => setRegisterForm({ ...registerForm, password: value })} />
          <Pressable style={styles.secondaryButton} onPress={register}><Text style={styles.secondaryButtonText}>Register</Text></Pressable>
        </Card>

        <View style={styles.tabRow}>
          {tabs.map((item) => (
            <Pressable key={item.key} style={[styles.tab, activeTab.key === item.key && styles.tabActive]} onPress={() => setTab(item.key)}>
              <Text style={[styles.tabText, activeTab.key === item.key && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'discover' && (
          <Card>
            <Text style={styles.sectionTitle}>Discover rooms</Text>
            <TextInput style={styles.input} placeholder="City" placeholderTextColor="#74839b" value={filters.city} onChangeText={(value) => setFilters({ ...filters, city: value })} />
            <TextInput style={styles.input} placeholder="Search" placeholderTextColor="#74839b" value={filters.search} onChangeText={(value) => setFilters({ ...filters, search: value })} />
            <View style={styles.rowInputs}>
              <TextInput style={[styles.input, styles.flexInput]} placeholder="Min rent" placeholderTextColor="#74839b" value={filters.minRent} onChangeText={(value) => setFilters({ ...filters, minRent: value })} />
              <TextInput style={[styles.input, styles.flexInput]} placeholder="Max rent" placeholderTextColor="#74839b" value={filters.maxRent} onChangeText={(value) => setFilters({ ...filters, maxRent: value })} />
            </View>
            <Pressable style={styles.primaryButton} onPress={refreshListings}><Text style={styles.primaryButtonText}>Apply filters</Text></Pressable>

            {loading ? <ActivityIndicator color="#63e6be" style={styles.loader} /> : null}
            {publicData.listings.map((item) => (
              <Pressable key={item.id} onPress={() => openListing(item)}>
                <Card style={styles.listingCard}>
                <View style={styles.cardHeaderRow}>
                  <Pill text={item.isVerified ? 'Verified' : 'Pending'} active={Boolean(item.isVerified)} />
                  <Text style={styles.price}>{currency(item.monthlyRent)}</Text>
                </View>
                <Text style={styles.listingTitle}>{item.title}</Text>
                <Text style={styles.muted}>{item.locality?.city} · {item.locality?.localityName}</Text>
                <Text style={styles.muted}>{item.description || 'No description available.'}</Text>
                <Text style={styles.metaLine}>{item.roomType} · {item.furnishingType || 'unspecified'} · {item.tenantGenderPreference || 'any gender'}</Text>
                </Card>
              </Pressable>
            ))}
            {selectedListing ? (
              <Card style={styles.detailCard}>
                <Text style={styles.sectionTitle}>{selectedListing.title}</Text>
                <Text style={styles.muted}>{selectedListing.description || 'No description available.'}</Text>
                <Text style={styles.metaLine}>{currency(selectedListing.monthlyRent)} · {selectedListing.locality?.localityName}</Text>
                <TextInput style={styles.input} placeholder="Write an inquiry" placeholderTextColor="#74839b" value={listingInquiryDraft} onChangeText={setListingInquiryDraft} />
                <View style={styles.detailActions}>
                  <Pressable style={styles.secondaryButton} onPress={saveSelectedListing}><Text style={styles.secondaryButtonText}>Save</Text></Pressable>
                  <Pressable style={styles.secondaryButton} onPress={sendListingInquiry}><Text style={styles.secondaryButtonText}>Inquire</Text></Pressable>
                </View>
              </Card>
            ) : null}
          </Card>
        )}

        {tab === 'saved' && (
          <Card>
            <Text style={styles.sectionTitle}>Saved searches</Text>
            <TextInput style={styles.input} placeholder="Search name" placeholderTextColor="#74839b" value={savedSearchForm.name} onChangeText={(value) => setSavedSearchForm({ ...savedSearchForm, name: value })} />
            <TextInput style={styles.input} placeholder="City" placeholderTextColor="#74839b" value={savedSearchForm.city} onChangeText={(value) => setSavedSearchForm({ ...savedSearchForm, city: value })} />
            <TextInput style={styles.input} placeholder="Search term" placeholderTextColor="#74839b" value={savedSearchForm.search} onChangeText={(value) => setSavedSearchForm({ ...savedSearchForm, search: value })} />
            <View style={styles.rowInputs}>
              <TextInput style={[styles.input, styles.flexInput]} placeholder="Min budget" placeholderTextColor="#74839b" value={savedSearchForm.minBudget} onChangeText={(value) => setSavedSearchForm({ ...savedSearchForm, minBudget: value })} />
              <TextInput style={[styles.input, styles.flexInput]} placeholder="Max budget" placeholderTextColor="#74839b" value={savedSearchForm.maxBudget} onChangeText={(value) => setSavedSearchForm({ ...savedSearchForm, maxBudget: value })} />
            </View>
            <Pressable style={styles.primaryButton} onPress={saveSearch}><Text style={styles.primaryButtonText}>Save search</Text></Pressable>
            {connectedData.savedSearches.map((search) => (
              <View key={search.id} style={styles.alertCard}>
                <Text style={styles.alertTitle}>{search.name}</Text>
                <Text style={styles.muted}>{search.filters.city || 'Any city'} · {search.filters.roomType || 'Any room'}</Text>
              </View>
            ))}
          </Card>
        )}

        {tab === 'chat' && (
          <Card>
            <Text style={styles.sectionTitle}>Chat</Text>
            {connectedData.conversations.map((conversation) => (
              <Pressable key={conversation.id} style={styles.alertCard} onPress={() => selectConversation(conversation)}>
                <Text style={styles.alertTitle}>{conversation.participant_full_name || conversation.participant?.fullName}</Text>
                <Text style={styles.muted}>{conversation.last_message_body || conversation.lastMessage?.body || 'No messages yet.'}</Text>
              </Pressable>
            ))}
            {connectedData.selectedConversation ? (
              <View style={styles.chatBox}>
                {(connectedData.messages || []).map((message) => (
                  <View key={message.id} style={[styles.messageBubble, message.sender?.userId === session?.user?.id && styles.messageBubbleMine]}>
                    <Text style={styles.messageText}>{message.body}</Text>
                    <Text style={styles.messageMeta}>{message.sender?.fullName} · {message.sentAt}</Text>
                  </View>
                ))}
                <TextInput style={styles.input} placeholder="Write a reply" placeholderTextColor="#74839b" value={messageDraft} onChangeText={setMessageDraft} />
                <Pressable style={styles.primaryButton} onPress={sendMessage}><Text style={styles.primaryButtonText}>Send</Text></Pressable>
              </View>
            ) : null}
          </Card>
        )}

        {tab === 'alerts' && (
          <Card>
            <Text style={styles.sectionTitle}>Live updates</Text>
            {session?.role === 'student' ? (
              <>
                <Text style={styles.muted}>Unread alerts: {(roleData.data?.alerts?.items || []).filter((alert) => !alert.isRead).length}</Text>
                {(roleData.data?.alerts?.items || []).map((alert) => (
                  <View key={alert.id} style={styles.alertCard}>
                    <Text style={styles.alertTitle}>{alert.title || 'New alert'}</Text>
                    <Text style={styles.muted}>{alert.message}</Text>
                  </View>
                ))}
                <Text style={styles.muted}>Roommate matches: {roleData.data?.rooms?.items?.length || 0}</Text>
              </>
            ) : (
              <Text style={styles.muted}>Login as a student to see instant saved-search alerts and matchmaking.</Text>
            )}
          </Card>
        )}

        {tab === 'membership' && (
          <Card>
            <Text style={styles.sectionTitle}>Landlord memberships</Text>
            {publicData.plans.map((plan) => (
              <View key={plan.id} style={styles.planCard}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>{currency(plan.monthlyPrice)}/mo</Text>
                <Text style={styles.muted}>{plan.listingBoostQuota} boosted listings · {plan.leadQuota} leads</Text>
              </View>
            ))}
            {session?.role === 'landlord' ? (
              <Text style={styles.muted}>Active subscription: {roleData.data?.membership?.membership?.plan?.name || 'none'}</Text>
            ) : null}
          </Card>
        )}

        {tab === 'profile' && (
          <Card>
            <Text style={styles.sectionTitle}>Profile & security</Text>
            {session ? (
              <>
                <Text style={styles.profileText}>{session.user.fullName}</Text>
                <Text style={styles.muted}>{session.user.role}</Text>
                <Text style={styles.muted}>JWT session synced with backend auth</Text>
                <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#74839b" value={profileForm.fullName} onChangeText={(value) => setProfileForm({ ...profileForm, fullName: value })} />
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#74839b" value={profileForm.email} onChangeText={(value) => setProfileForm({ ...profileForm, email: value })} />
                {session.role === 'student' ? (
                  <>
                    <TextInput style={styles.input} placeholder="University" placeholderTextColor="#74839b" value={profileForm.studentProfile.universityName} onChangeText={(value) => setProfileForm({ ...profileForm, studentProfile: { ...profileForm.studentProfile, universityName: value } })} />
                    <TextInput style={styles.input} placeholder="Course" placeholderTextColor="#74839b" value={profileForm.studentProfile.courseName} onChangeText={(value) => setProfileForm({ ...profileForm, studentProfile: { ...profileForm.studentProfile, courseName: value } })} />
                    <TextInput style={styles.input} placeholder="Roommate bio" placeholderTextColor="#74839b" value={profileForm.roommateProfile.bio} onChangeText={(value) => setProfileForm({ ...profileForm, roommateProfile: { ...profileForm.roommateProfile, bio: value } })} />
                    <Pressable style={styles.secondaryButton} onPress={updateRoommateProfile}><Text style={styles.secondaryButtonText}>Update roommate profile</Text></Pressable>
                  </>
                ) : null}
                {session.role === 'landlord' ? (
                  <TextInput style={styles.input} placeholder="Business name" placeholderTextColor="#74839b" value={profileForm.landlordProfile.businessName} onChangeText={(value) => setProfileForm({ ...profileForm, landlordProfile: { businessName: value } })} />
                ) : null}
                <Pressable style={styles.primaryButton} onPress={updateProfile}><Text style={styles.primaryButtonText}>Update profile</Text></Pressable>
                <Pressable style={styles.logoutButton} onPress={logout}><Text style={styles.logoutButtonText}>Logout</Text></Pressable>
              </>
            ) : (
              <Text style={styles.muted}>Sign in to sync chat, alerts, membership, and dashboards across devices.</Text>
            )}
          </Card>
        )}

        {session?.role === 'admin' ? (
          <Card>
            <Text style={styles.sectionTitle}>Ops view</Text>
            <Text style={styles.muted}>Queue lag checks: {roleData.data?.queues?.items?.length || 0}</Text>
            <Text style={styles.muted}>Worker heartbeats: {roleData.data?.workers?.items?.length || 0}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08111f'
  },
  container: {
    padding: 16,
    gap: 14
  },
  backgroundOrbA: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(99, 230, 190, 0.12)'
  },
  backgroundOrbB: {
    position: 'absolute',
    bottom: 100,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(124, 156, 255, 0.12)'
  },
  card: {
    backgroundColor: 'rgba(16, 34, 56, 0.96)',
    borderColor: 'rgba(156, 190, 255, 0.16)',
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 6
  },
  heroCard: {
    paddingVertical: 20
  },
  brand: {
    color: '#63e6be',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontSize: 12,
    fontWeight: '800'
  },
  heroTitle: {
    color: '#f4f7fb',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800'
  },
  heroCopy: {
    color: '#a8b4c7',
    lineHeight: 22
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  pill: {
    color: '#a8b4c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden'
  },
  pillActive: {
    color: '#08111f',
    backgroundColor: '#63e6be'
  },
  healthRow: {
    flexDirection: 'row',
    gap: 10
  },
  healthBox: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 4
  },
  healthValue: {
    color: '#f4f7fb',
    fontSize: 18,
    fontWeight: '800'
  },
  healthLabel: {
    color: '#a8b4c7',
    fontSize: 12
  },
  sectionTitle: {
    color: '#f4f7fb',
    fontSize: 18,
    fontWeight: '800'
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f4f7fb',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  primaryButton: {
    backgroundColor: '#63e6be',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#08111f',
    fontWeight: '800'
  },
  secondaryButton: {
    backgroundColor: 'rgba(124,156,255,0.2)',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#f4f7fb',
    fontWeight: '800'
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 6
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  tabActive: {
    backgroundColor: '#7c9cff'
  },
  tabText: {
    color: '#a8b4c7',
    fontWeight: '700'
  },
  tabTextActive: {
    color: '#08111f'
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10
  },
  flexInput: {
    flex: 1
  },
  loader: {
    marginVertical: 16
  },
  listingCard: {
    marginTop: 12
  },
  detailCard: {
    marginTop: 12,
    gap: 10
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  price: {
    color: '#63e6be',
    fontWeight: '800'
  },
  listingTitle: {
    color: '#f4f7fb',
    fontSize: 16,
    fontWeight: '800'
  },
  muted: {
    color: '#a8b4c7'
  },
  metaLine: {
    color: '#7c9cff'
  },
  alertCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 4
  },
  chatBox: {
    gap: 10,
    marginTop: 8
  },
  messageBubble: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 4
  },
  messageBubbleMine: {
    backgroundColor: 'rgba(99, 230, 190, 0.12)'
  },
  messageText: {
    color: '#f4f7fb',
    fontWeight: '700'
  },
  messageMeta: {
    color: '#a8b4c7',
    fontSize: 12
  },
  alertTitle: {
    color: '#f4f7fb',
    fontWeight: '800'
  },
  planCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
    gap: 6,
    marginTop: 10
  },
  planName: {
    color: '#f4f7fb',
    fontWeight: '800'
  },
  planPrice: {
    color: '#63e6be',
    fontSize: 18,
    fontWeight: '800'
  },
  profileText: {
    color: '#f4f7fb',
    fontSize: 20,
    fontWeight: '800'
  },
  logoutButton: {
    marginTop: 10,
    backgroundColor: 'rgba(255,123,123,0.16)',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center'
  },
  logoutButtonText: {
    color: '#ffb0b0',
    fontWeight: '800'
  }
});
