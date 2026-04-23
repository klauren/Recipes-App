import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { cartApi, type CartItem, type CartResponse, type MonthlyCartResponse } from '../../services/api';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Produce: 'leaf-outline',
  Dairy: 'water-outline',
  'Meat & Fish': 'fish-outline',
  Pantry: 'grid-outline',
  Drinks: 'wine-outline',
  Other: 'bag-handle-outline',
};

type ViewMode = 'weekly' | 'monthly';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ViewMode>('weekly');
  const [weekData, setWeekData] = useState<CartResponse | null>(null);
  const [monthData, setMonthData] = useState<MonthlyCartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonth = todayStr.slice(0, 7);

  const loadWeekly = useCallback(async () => {
    const result = await cartApi.get(todayStr);
    setWeekData(result);
  }, [todayStr]);

  const loadMonthly = useCallback(async () => {
    const result = await cartApi.monthly(currentMonth);
    setMonthData(result);
  }, [currentMonth]);

  const load = useCallback(async () => {
    try {
      await Promise.all([loadWeekly(), loadMonthly()]);
    } catch {}
  }, [loadWeekly, loadMonthly]);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const generateList = async () => {
    setGenerating(true);
    try {
      await cartApi.generate(todayStr);
      await load();
      Alert.alert('Shopping list generated!', 'Items from your meal plan this week have been added.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setGenerating(false);
    }
  };

  const toggleItem = async (item: CartItem) => {
    const updated = await cartApi.toggle(item.id, !item.is_checked);
    // Helper: swap the updated item in place across both weekly and monthly datasets.
    const patchGroups = (groups: Record<string, CartItem[]>) => {
      const out: Record<string, CartItem[]> = {};
      Object.entries(groups).forEach(([cat, items]) => {
        out[cat] = items.map(i => i.id === updated.id ? updated : i);
      });
      return out;
    };
    setWeekData(prev => prev ? {
      ...prev,
      groups: patchGroups(prev.groups),
      items: prev.items.map(i => i.id === updated.id ? updated : i),
    } : prev);
    setMonthData(prev => prev ? {
      ...prev,
      groups: patchGroups(prev.groups),
      items: prev.items.map(i => i.id === updated.id ? updated : i),
      checkedItems: prev.items.filter(i => (i.id === updated.id ? updated : i).is_checked).length,
    } : prev);
  };

  const deleteItem = async (item: CartItem) => {
    await cartApi.delete(item.id);
    // Remove the item from the weekly list immediately (optimistic update).
    setWeekData(prev => {
      if (!prev) return prev;
      const newItems = prev.items.filter(i => i.id !== item.id);
      const newGroups: Record<string, CartItem[]> = {};
      Object.entries(prev.groups).forEach(([cat, items]) => {
        const filtered = items.filter(i => i.id !== item.id);
        if (filtered.length) newGroups[cat] = filtered;
      });
      return { ...prev, items: newItems, groups: newGroups };
    });
  };

  const clearList = () => {
    Alert.alert('Clear List', 'Remove all items from this week?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await cartApi.clear(todayStr);
        await load();
      }},
    ]);
  };

  const addItem = async () => {
    const name = newItemName.trim();
    if (!name) return;
    await cartApi.add({ name, week: todayStr });
    setNewItemName('');
    setAddingItem(false);
    await load();
  };

  const activeData = mode === 'weekly' ? weekData : monthData;
  const totalItems = activeData?.items.length ?? 0;
  const checkedItems = mode === 'weekly'
    ? (weekData?.items.filter(i => i.is_checked).length ?? 0)
    : (monthData?.checkedItems ?? 0);
  const categories = activeData ? Object.keys(activeData.groups) : [];

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Shopping List</Text>
        {totalItems > 0 && mode === 'weekly' && (
          <TouchableOpacity style={styles.clearBtn} onPress={clearList}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Weekly / Monthly toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'weekly' && styles.toggleBtnActive]}
          onPress={() => setMode('weekly')}
        >
          <Text style={[styles.toggleText, mode === 'weekly' && styles.toggleTextActive]}>Weekly</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'monthly' && styles.toggleBtnActive]}
          onPress={() => setMode('monthly')}
        >
          <Text style={[styles.toggleText, mode === 'monthly' && styles.toggleTextActive]}>Monthly</Text>
        </TouchableOpacity>
      </View>

      {/* Monthly summary banner */}
      {mode === 'monthly' && monthData && (
        <View style={styles.monthBanner}>
          <View style={styles.monthStat}>
            <Text style={styles.monthStatValue}>{monthData.totalItems}</Text>
            <Text style={styles.monthStatLabel}>Total Items</Text>
          </View>
          <View style={styles.monthDivider} />
          <View style={styles.monthStat}>
            <Text style={styles.monthStatValue}>{monthData.checkedItems}</Text>
            <Text style={styles.monthStatLabel}>Purchased</Text>
          </View>
          <View style={styles.monthDivider} />
          <View style={styles.monthStat}>
            <Text style={styles.monthStatValue}>{monthData.weekCount}</Text>
            <Text style={styles.monthStatLabel}>Weeks</Text>
          </View>
        </View>
      )}

      {/* Progress (weekly only) */}
      {mode === 'weekly' && totalItems > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(checkedItems / totalItems) * 100}%` as any }]} />
          </View>
          <Text style={styles.progressText}>{checkedItems}/{totalItems} items</Text>
        </View>
      )}

      {/* Generate + Add actions (weekly only) */}
      {mode === 'weekly' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.generateBtn, { flex: 1 }]}
            onPress={generateList}
            disabled={generating}
          >
            {generating
              ? <ActivityIndicator size="small" color={Colors.fgInverse} />
              : <Ionicons name="flash-outline" size={16} color={Colors.fgInverse} />
            }
            <Text style={styles.generateText}>
              {generating ? 'Generating...' : 'Generate from Plan'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setAddingItem(v => !v)}
          >
            <Ionicons name="add" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      )}

      {/* Inline add-item form */}
      {addingItem && mode === 'weekly' && (
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="Item name…"
            placeholderTextColor={Colors.fgMuted}
            value={newItemName}
            onChangeText={setNewItemName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={addItem}
          />
          <TouchableOpacity style={styles.addConfirmBtn} onPress={addItem}>
            <Text style={styles.addConfirmText}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setAddingItem(false); setNewItemName(''); }}>
            <Ionicons name="close" size={18} color={Colors.fgMuted} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {totalItems === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cart-outline" size={48} color={Colors.fgMuted} />
            <Text style={styles.emptyTitle}>
              {mode === 'monthly' ? 'No items this month' : 'Your list is empty'}
            </Text>
            {mode === 'weekly' && (
              <Text style={styles.emptySub}>
                Tap "Generate from Plan" to auto-populate ingredients from your weekly meals
              </Text>
            )}
          </View>
        ) : (
          categories.map(cat => (
            <View key={cat} style={styles.section}>
              <View style={styles.catHeader}>
                <Ionicons name={CATEGORY_ICONS[cat] || 'bag-handle-outline'} size={16} color={Colors.accent} />
                <Text style={styles.catTitle}>{cat}</Text>
                <Text style={styles.catCount}>{activeData!.groups[cat].length}</Text>
              </View>
              <View style={styles.itemList}>
                {activeData!.groups[cat].map(item => (
                  <View key={item.id} style={styles.item}>
                    <TouchableOpacity
                      style={styles.itemTouchable}
                      onPress={() => toggleItem(item)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, item.is_checked ? styles.checkboxChecked : null]}>
                        {!!item.is_checked && <Ionicons name="checkmark" size={12} color={Colors.fgInverse} />}
                      </View>
                      <View style={styles.itemBody}>
                        <Text style={[styles.itemName, item.is_checked ? styles.itemNameChecked : null]}>
                          {[item.amount, item.unit].filter(Boolean).join(' ')}{[item.amount, item.unit].some(Boolean) ? ' ' : ''}
                          {item.name}
                        </Text>
                        {item.source_recipe ? (
                          <Text style={styles.itemSource}>{item.source_recipe}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                    {/* Delete is only available in weekly mode — monthly items span multiple weeks. */}
                    {mode === 'weekly' && (
                      <TouchableOpacity onPress={() => deleteItem(item)} hitSlop={8} style={styles.deleteItemBtn}>
                        <Ionicons name="trash-outline" size={16} color={Colors.fgMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfacePrimary },
  center: { flex: 1, backgroundColor: Colors.surfacePrimary, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 26, color: Colors.fgPrimary },
  clearBtn: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgSecondary },
  toggleRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
    padding: 3,
    marginBottom: 16,
    gap: 2,
  },
  toggleBtn: {
    borderRadius: 99,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  toggleBtnActive: { backgroundColor: Colors.surfacePrimary },
  toggleText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgMuted },
  toggleTextActive: { color: Colors.fgPrimary },
  monthBanner: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 16,
    paddingVertical: 16,
  },
  monthStat: { flex: 1, alignItems: 'center', gap: 2 },
  monthStatValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.fgPrimary },
  monthStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted },
  monthDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 3 },
  progressText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.fgMuted, width: 64, textAlign: 'right' },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  generateText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.fgInverse },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.fgPrimary,
    height: 36,
  },
  addConfirmBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addConfirmText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgInverse },
  scroll: { paddingHorizontal: 20, paddingBottom: 12, gap: 20 },
  section: { gap: 10 },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catTitle: { flex: 1, fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18, color: Colors.fgPrimary },
  catCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.fgMuted,
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
  },
  itemList: { backgroundColor: Colors.surfaceSecondary, borderRadius: 16, overflow: 'hidden' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  // Touchable area for the checkbox + label; stretches to fill available space.
  itemTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  deleteItemBtn: {
    paddingRight: 14,
    paddingVertical: 14,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.fgMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  itemBody: { flex: 1, gap: 2 },
  itemName: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgPrimary },
  itemNameChecked: { textDecorationLine: 'line-through', color: Colors.fgMuted },
  itemSource: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: Colors.fgPrimary },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.fgMuted, textAlign: 'center', lineHeight: 21 },
});
