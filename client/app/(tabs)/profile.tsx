import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { profileApi, type Profile } from '../../services/api';

const SETTINGS = [
  { icon: 'notifications-outline' as const, label: 'Notifications', arrow: true },
  { icon: 'moon-outline' as const, label: 'Dark Mode', arrow: false },
  { icon: 'share-outline' as const, label: 'Share Recipes', arrow: true },
  { icon: 'information-circle-outline' as const, label: 'About Mise', arrow: true },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await profileApi.get();
      setProfile(p);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const startEdit = () => {
    if (!profile) return;
    setEditName(profile.name);
    setEditUsername(profile.username);
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      const updated = await profileApi.patch({ name: editName, username: editUsername });
      setProfile(prev => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading || !profile) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const initials = profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {/* avatar_color is stored per-user so future multi-user support works out of the box. */}
          <View style={[styles.avatar, { backgroundColor: profile.avatar_color || Colors.accent }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          {editing ? (
            <View style={styles.editForm}>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Display name"
                placeholderTextColor={Colors.fgMuted}
              />
              <TextInput
                style={styles.editInput}
                value={editUsername}
                onChangeText={setEditUsername}
                placeholder="@username"
                placeholderTextColor={Colors.fgMuted}
                autoCapitalize="none"
              />
              <View style={styles.editBtns}>
                <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.username}>{profile.username}</Text>
              <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
                <Ionicons name="pencil-outline" size={14} color={Colors.fgMuted} />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: 'Recipes', value: profile.totalRecipes },
            { label: 'Saved', value: profile.savedRecipes },
            { label: 'Meals Planned', value: profile.mealsPlanned },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
          <View style={styles.quickRow}>
            {/* router.navigate switches tabs in-place; router.push would stack them. */}
            <TouchableOpacity style={styles.quickCard} onPress={() => router.navigate('/saved')}>
              <Ionicons name="heart-outline" size={24} color={Colors.accent} />
              <Text style={styles.quickLabel}>Saved</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCard} onPress={() => router.navigate('/add')}>
              <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
              <Text style={styles.quickLabel}>Add Recipe</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCard} onPress={() => router.navigate('/cart')}>
              <Ionicons name="cart-outline" size={24} color={Colors.accent} />
              <Text style={styles.quickLabel}>Cart</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.settingsList}>
            {SETTINGS.map((s, i) => (
              <TouchableOpacity
                key={s.label}
                style={[
                  styles.settingsItem,
                  i < SETTINGS.length - 1 && styles.settingsItemBorder,
                ]}
                onPress={() => Alert.alert(s.label, 'Coming soon!')}
              >
                <Ionicons name={s.icon} size={20} color={Colors.fgSecondary} />
                <Text style={styles.settingsLabel}>{s.label}</Text>
                {s.arrow && <Ionicons name="chevron-forward" size={16} color={Colors.fgMuted} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.version}>Mise · v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfacePrimary },
  center: { flex: 1, backgroundColor: Colors.surfacePrimary, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: 28, paddingBottom: 12 },
  profileHeader: { alignItems: 'center', gap: 12 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.fgInverse },
  nameBlock: { alignItems: 'center', gap: 4 },
  name: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24, color: Colors.fgPrimary },
  username: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.fgMuted },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
  },
  editBtnText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.fgMuted },
  editForm: { width: '100%', gap: 10, alignItems: 'stretch' },
  editInput: {
    height: 44,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.fgPrimary,
  },
  editBtns: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    flex: 1, height: 44, backgroundColor: Colors.accent,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgInverse },
  cancelBtn: {
    flex: 1, height: 44, backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgSecondary },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.fgPrimary },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted, textAlign: 'center' },
  section: { gap: 12 },
  sectionTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18, color: Colors.fgPrimary },
  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: {
    flex: 1,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  quickLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.fgSecondary },
  settingsList: { backgroundColor: Colors.surfaceSecondary, borderRadius: 16, overflow: 'hidden' },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingsItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingsLabel: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.fgPrimary },
  version: {
    fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.fgMuted,
    textAlign: 'center', marginTop: 8,
  },
});
