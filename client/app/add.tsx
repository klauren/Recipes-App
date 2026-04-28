import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { recipeApi, type Ingredient, type Instruction } from '../services/api';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Other'];

export default function AddRecipeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // `prefill` is JSON-serialised PreviewData sent back from the Import Preview "Edit" button.
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();

  // Import from URL
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('4');
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>('Easy');
  const [category, setCategory] = useState('Dinner');
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ amount: '', unit: '', name: '' }]);
  const [instructions, setInstructions] = useState<Instruction[]>([{ body: '' }]);
  const [saving, setSaving] = useState(false);

  // Populate form when arriving from Import Preview via the Edit button.
  useEffect(() => {
    if (!prefill) return;
    try {
      const d = JSON.parse(prefill);
      setTitle(d.title || '');
      setDescription(d.description || '');
      setPrepTime(String(d.prep_time || ''));
      setCookTime(String(d.cook_time || ''));
      setServings(String(d.servings || 4));
      setDifficulty(d.difficulty || 'Medium');
      setCategory(d.category || 'Other');
      setIngredients(d.ingredients?.length ? d.ingredients : [{ amount: '', unit: '', name: '' }]);
      setInstructions(d.instructions?.length ? d.instructions : [{ body: '' }]);
    } catch {}
  }, [prefill]);

  // Scrapes the URL then navigates to Import Preview rather than pre-filling the
  // form directly — lets the user review the result before committing to an edit.
  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const data = await recipeApi.import(importUrl.trim());
      router.push({ pathname: '/import-preview', params: { data: JSON.stringify(data) } });
    } catch (e: any) {
      Alert.alert('Import failed', e.message);
    } finally {
      setImporting(false);
    }
  };

  // ── Ingredient list helpers ───────────────────────────────────────────────
  const addIngredient = () => setIngredients(prev => [...prev, { amount: '', unit: '', name: '' }]);
  const removeIngredient = (i: number) => setIngredients(prev => prev.filter((_, idx) => idx !== i));
  const updateIngredient = (i: number, field: keyof Ingredient, val: string) =>
    setIngredients(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing));

  // ── Instruction list helpers ──────────────────────────────────────────────
  const addInstruction = () => setInstructions(prev => [...prev, { body: '' }]);
  const removeInstruction = (i: number) => setInstructions(prev => prev.filter((_, idx) => idx !== i));
  const updateInstruction = (i: number, val: string) =>
    setInstructions(prev => prev.map((ins, idx) => idx === i ? { body: val } : ins));

  const resetForm = () => {
    setTitle(''); setDescription(''); setPrepTime(''); setCookTime('');
    setServings('4'); setDifficulty('Easy'); setCategory('Dinner');
    setIngredients([{ amount: '', unit: '', name: '' }]);
    setInstructions([{ body: '' }]);
    setImportUrl('');
  };

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert('Required', 'Recipe name is required');
    setSaving(true);
    try {
      const recipe = await recipeApi.create({
        title: title.trim(),
        description: description.trim(),
        prep_time: parseInt(prepTime) || 0,
        cook_time: parseInt(cookTime) || 0,
        servings: parseInt(servings) || 4,
        difficulty,
        category,
        ingredients: ingredients.filter(i => i.name.trim()),
        instructions: instructions.filter(i => i.body.trim()),
      });
      Alert.alert('Saved!', `"${recipe.title}" added to your recipes.`, [
        { text: 'View Recipe', onPress: () => router.replace(`/recipe/${recipe.id}`) },
        { text: 'Add Another', onPress: resetForm },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.surfacePrimary }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={Colors.fgPrimary} />
          </TouchableOpacity>
          <Text style={styles.headTitle}>Add Recipe</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>

          {/* Import from URL */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Ionicons name="link-outline" size={16} color={Colors.accent} />
              <Text style={styles.label}>Import from Link</Text>
            </View>
            <View style={styles.linkRow}>
              <TextInput
                style={styles.linkInput}
                placeholder="https://..."
                placeholderTextColor={Colors.fgMuted}
                value={importUrl}
                onChangeText={setImportUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                style={styles.importBtn}
                onPress={handleImport}
                disabled={importing || !importUrl.trim()}
              >
                {importing
                  ? <ActivityIndicator size="small" color={Colors.fgInverse} />
                  : <Ionicons name="arrow-forward" size={20} color={Colors.fgInverse} />
                }
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Supports any recipe site with Schema.org markup</Text>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.divLine} />
            <Text style={styles.divText}>or add manually</Text>
            <View style={styles.divLine} />
          </View>

          {/* Recipe Name */}
          <Field label="Recipe Name" required>
            <TextInput
              style={styles.input}
              placeholder="e.g. Lemon Herb Risotto"
              placeholderTextColor={Colors.fgMuted}
              value={title}
              onChangeText={setTitle}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Brief description..."
              placeholderTextColor={Colors.fgMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </Field>

          {/* Time + Servings */}
          <View style={styles.row2}>
            <Field label="Prep Time (min)" style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={Colors.fgMuted}
                value={prepTime}
                onChangeText={setPrepTime}
                keyboardType="numeric"
              />
            </Field>
            <Field label="Cook Time (min)" style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={Colors.fgMuted}
                value={cookTime}
                onChangeText={setCookTime}
                keyboardType="numeric"
              />
            </Field>
            <Field label="Servings" style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                placeholder="4"
                placeholderTextColor={Colors.fgMuted}
                value={servings}
                onChangeText={setServings}
                keyboardType="numeric"
              />
            </Field>
          </View>

          {/* Difficulty */}
          <Field label="Difficulty">
            <View style={styles.row2}>
              {DIFFICULTIES.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.diffBtn, difficulty === d && styles.diffBtnActive]}
                  onPress={() => setDifficulty(d)}
                >
                  <Text style={[styles.diffText, difficulty === d && styles.diffTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          {/* Category */}
          <Field label="Category">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, category === cat && styles.catChipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Field>

          {/* Ingredients */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {ingredients.map((ing, i) => (
              <View key={i} style={styles.ingRow}>
                <TextInput
                  style={[styles.input, { width: 56 }]}
                  placeholder="Amt"
                  placeholderTextColor={Colors.fgMuted}
                  value={ing.amount}
                  onChangeText={v => updateIngredient(i, 'amount', v)}
                />
                <TextInput
                  style={[styles.input, { width: 56 }]}
                  placeholder="Unit"
                  placeholderTextColor={Colors.fgMuted}
                  value={ing.unit}
                  onChangeText={v => updateIngredient(i, 'unit', v)}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Ingredient"
                  placeholderTextColor={Colors.fgMuted}
                  value={ing.name}
                  onChangeText={v => updateIngredient(i, 'name', v)}
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity onPress={() => removeIngredient(i)}>
                    <Ionicons name="remove-circle-outline" size={22} color={Colors.fgMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addRowBtn} onPress={addIngredient}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
              <Text style={styles.addRowText}>Add Ingredient</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {instructions.map((ins, i) => (
              <View key={i} style={styles.instRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{i + 1}</Text>
                </View>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={`Step ${i + 1}...`}
                  placeholderTextColor={Colors.fgMuted}
                  value={ins.body}
                  onChangeText={v => updateInstruction(i, v)}
                  multiline
                />
                {instructions.length > 1 && (
                  <TouchableOpacity onPress={() => removeInstruction(i)}>
                    <Ionicons name="remove-circle-outline" size={22} color={Colors.fgMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addRowBtn} onPress={addInstruction}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
              <Text style={styles.addRowText}>Add Step</Text>
            </TouchableOpacity>
          </View>

          {/* Save */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.fgInverse} /> : <Text style={styles.saveBtnText}>Save Recipe</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children, required, style }: { label: string; children: React.ReactNode; required?: boolean; style?: object }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={fieldStyles.label}>{label}{required ? ' *' : ''}</Text>
      {children}
    </View>
  );
}
const fieldStyles = StyleSheet.create({
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.fgSecondary },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surfacePrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  headTitle: {
    flex: 1,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 26,
    color: Colors.fgPrimary,
    textAlign: 'center',
  },
  form: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  section: { gap: 12 },
  sectionTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, color: Colors.fgPrimary },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.fgSecondary },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkRow: { flexDirection: 'row', gap: 8 },
  linkInput: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.fgPrimary,
  },
  importBtn: {
    width: 44, height: 44,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.fgMuted },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divLine: { flex: 1, height: 1, backgroundColor: 'rgba(140,135,130,0.2)' },
  divText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.fgMuted },
  input: {
    height: 44,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.fgPrimary,
  },
  multiline: { height: 88, paddingTop: 12, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 8 },
  diffBtn: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diffBtnActive: { backgroundColor: Colors.accent },
  diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgPrimary },
  diffTextActive: { color: Colors.fgInverse },
  catChip: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  catChipActive: { backgroundColor: Colors.accent },
  catText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.fgPrimary },
  catTextActive: { color: Colors.fgInverse },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  instRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8, flexShrink: 0,
  },
  stepBadgeText: { color: Colors.fgInverse, fontFamily: 'Inter_700Bold', fontSize: 13 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addRowText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.accent },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 99,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.fgInverse },
});
