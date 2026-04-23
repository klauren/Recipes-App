import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { recipeApi, type Ingredient, type Instruction, type Recipe } from '../../services/api';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
const CATEGORIES   = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Other'];

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  // Form fields — initialised empty, populated once the recipe loads.
  const [title,        setTitle]        = useState('');
  const [description,  setDescription]  = useState('');
  const [prepTime,     setPrepTime]     = useState('');
  const [cookTime,     setCookTime]     = useState('');
  const [servings,     setServings]     = useState('4');
  const [difficulty,   setDifficulty]   = useState<typeof DIFFICULTIES[number]>('Medium');
  const [category,     setCategory]     = useState('Dinner');
  const [ingredients,  setIngredients]  = useState<Ingredient[]>([]);
  const [instructions, setInstructions] = useState<Instruction[]>([]);

  const [loadingRecipe, setLoadingRecipe] = useState(true);
  const [saving,        setSaving]        = useState(false);

  // Load the full recipe (with ingredients + instructions) on mount.
  const loadRecipe = useCallback(async () => {
    try {
      const r: Recipe = await recipeApi.get(Number(id));
      setTitle(r.title);
      setDescription(r.description || '');
      setPrepTime(String(r.prep_time || ''));
      setCookTime(String(r.cook_time || ''));
      setServings(String(r.servings || 4));
      setDifficulty(r.difficulty || 'Medium');
      setCategory(r.category || 'Other');
      // Fall back to one empty row so the form is never completely blank.
      setIngredients(r.ingredients?.length ? r.ingredients : [{ amount: '', unit: '', name: '' }]);
      setInstructions(r.instructions?.length ? r.instructions : [{ body: '' }]);
    } catch {
      Alert.alert('Error', 'Could not load recipe');
      router.back();
    } finally {
      setLoadingRecipe(false);
    }
  }, [id]);

  useEffect(() => { loadRecipe(); }, [loadRecipe]);

  // ── Ingredient list helpers ───────────────────────────────────────────────
  const addIngredient    = () => setIngredients(prev => [...prev, { amount: '', unit: '', name: '' }]);
  const removeIngredient = (i: number) => setIngredients(prev => prev.filter((_, idx) => idx !== i));
  const updateIngredient = (i: number, field: keyof Ingredient, val: string) =>
    setIngredients(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing));

  // ── Instruction list helpers ──────────────────────────────────────────────
  const addInstruction    = () => setInstructions(prev => [...prev, { body: '' }]);
  const removeInstruction = (i: number) => setInstructions(prev => prev.filter((_, idx) => idx !== i));
  const updateInstruction = (i: number, val: string) =>
    setInstructions(prev => prev.map((ins, idx) => idx === i ? { body: val } : ins));

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert('Required', 'Recipe name is required');
    setSaving(true);
    try {
      // Blank ingredient rows (no name) and blank instruction rows are stripped
      // before sending so the server doesn't store empty placeholder data.
      await recipeApi.patch(Number(id), {
        title:        title.trim(),
        description:  description.trim(),
        prep_time:    parseInt(prepTime)  || 0,
        cook_time:    parseInt(cookTime)  || 0,
        servings:     parseInt(servings)  || 4,
        difficulty,
        category,
        ingredients:  ingredients.filter(i => i.name.trim()),
        instructions: instructions.filter(i => i.body.trim()),
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingRecipe) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

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
          <Text style={styles.headTitle}>Edit Recipe</Text>
          {/* Invisible spacer keeps title centred */}
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>

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
          <View style={styles.row3}>
            <Field label="Prep (min)" style={{ flex: 1 }}>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={Colors.fgMuted}
                value={prepTime}
                onChangeText={setPrepTime}
                keyboardType="numeric"
              />
            </Field>
            <Field label="Cook (min)" style={{ flex: 1 }}>
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
            <View style={styles.row3}>
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
                  <TouchableOpacity onPress={() => removeIngredient(i)} hitSlop={8}>
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
                  <TouchableOpacity onPress={() => removeInstruction(i)} hitSlop={8}>
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
            {saving
              ? <ActivityIndicator color={Colors.fgInverse} />
              : <Text style={styles.saveBtnText}>Save Changes</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Shared field label wrapper ────────────────────────────────────────────────

function Field({ label, children, required, style }: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  style?: object;
}) {
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
  center: { flex: 1, backgroundColor: Colors.surfacePrimary, alignItems: 'center', justifyContent: 'center' },
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
    fontSize: 22,
    color: Colors.fgPrimary,
    textAlign: 'center',
  },
  form: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  section: { gap: 12 },
  sectionTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, color: Colors.fgPrimary },
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
  row3: { flexDirection: 'row', gap: 8 },
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
